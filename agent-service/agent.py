from fastapi import HTTPException
import json
import os, certifi
from jira import JIRA
os.environ['SSL_CERT_FILE'] = certifi.where()
os.environ['REQUESTS_CA_BUNDLE'] = certifi.where()  # requests uses this one
os.environ['CURL_CA_BUNDLE'] = certifi.where()       # some libs use this instead
import httpx
import psycopg2
import truststore
truststore.inject_into_ssl()
from agno.agent import Agent
from agno.models.nvidia import Nvidia
from agno.tools.mcp import MCPTools
from agno.os import AgentOS  # Import AgentOS package
from dotenv import load_dotenv
from agno.db.postgres import PostgresDb

from hitl import JiraHitlMiddleware, run_admin_sql, block_unapproved_ddl_hook, FIELD_SESSION_ID
from fastapi import WebSocket, WebSocketDisconnect
from collections import defaultdict
import asyncio

load_dotenv()

JIRA_BASE_URL = os.environ["JIRA_BASE_URL"].rstrip("/")
JIRA_EMAIL = os.environ["JIRA_EMAIL"]
JIRA_API_TOKEN = os.environ["JIRA_API_TOKEN"]
JIRA_PROJECT_KEY = os.environ["JIRA_PROJECT_KEY"]
JIRA_ISSUE_TYPE = os.environ.get("JIRA_ISSUE_TYPE", "Task")

jira = JIRA(
    server=os.environ["JIRA_BASE_URL"],
    basic_auth=(os.environ["JIRA_EMAIL"], os.environ["JIRA_API_TOKEN"]),
)
DATABASE_URL = "postgresql://postgres:qaszdeszqa@localhost:5432/test_db"


class ConnectionManager:
    def __init__(self):
        self.active: dict[str, list[WebSocket]] = defaultdict(list)
        self.lock = asyncio.Lock()

    async def connect(self, session_id: str, ws: WebSocket):
        await ws.accept()
        async with self.lock:
            self.active[session_id].append(ws)

    async def disconnect(self, session_id: str, ws: WebSocket):
        async with self.lock:
            if ws in self.active.get(session_id, []):
                self.active[session_id].remove(ws)
            if not self.active.get(session_id):
                self.active.pop(session_id, None)

    async def send_to_session(self, session_id: str, payload: dict):
        for ws in list(self.active.get(session_id, [])):
            try:
                await ws.send_json(payload)
            except Exception:
                await self.disconnect(session_id, ws)

manager = ConnectionManager()


shared_model = Nvidia(id="nvidia/nemotron-3-ultra-550b-a55b")
postgres_mcp_command = "postgres-mcp --access-mode=unrestricted"
postgres_env_vars = {"DATABASE_URI": DATABASE_URL}
db = PostgresDb(db_url=DATABASE_URL)
postgres_mcp_tools = MCPTools(command=postgres_mcp_command, env=postgres_env_vars)

postgres_agent = Agent(
    id="postgres_agent",
    name="DBA Agent",
    store_history_messages=True,
    model=shared_model,
    tools=[postgres_mcp_tools, run_admin_sql],
    tool_hooks=[block_unapproved_ddl_hook],
instructions=[
    "You are a Senior DBA with access to PostgreSQL tools. Use them as needed to answer the request.",
    "Always reply in the same language the user writes in. If the user writes in French, reply in French.",
    "SELECT, INSERT, UPDATE, and DELETE statements do not need approval - call execute_sql directly.",
    "Only DROP TABLE and ALTER TABLE require approval - for those, call `run_admin_sql`, never execute_sql.",
    "Do not explain how the tools work; just execute them and answer the user request.",
    "Never tell the user an action succeeded unless a tool call in this conversation actually returned a success result.",
    "When a tool execution result is returned after approval, report the outcome clearly to the user.",
],
    db=db,
    debug_mode=True,
    cache_session=True,
)

agent_os = AgentOS(
        name="DBA_AgentOS",
        agents=[postgres_agent],
        db=db,
        tracing=False,
        cors_allowed_origins=["http://localhost:5173"],      
)

app = agent_os.get_app()
app.add_middleware(JiraHitlMiddleware)


JIRA_STATUS_MAP = {
    # adjust these to match your actual Jira workflow's status names (case-insensitive)
    "to do": "pending",
    "in progress": "pending",
    "approved": "approved",
    "done": "approved",
    "rejected": "blocked",
    "blocked": "blocked",
}

def _parse_sse_final_content(raw_text: str) -> dict:
    """AgentOS's /continue endpoint always responds as SSE regardless of the
    stream param. Walk the event stream and keep the last event that carries
    a non-empty 'content' field - that's the model's final reply."""
    last_content = None
    last_status = None

    for line in raw_text.splitlines():
        line = line.strip()
        if not line.startswith("data:"):
            continue
        payload = line[len("data:"):].strip()
        if not payload:
            continue
        try:
            event = json.loads(payload)
        except json.JSONDecodeError:
            continue

        if event.get("content"):
            last_content = event["content"]
        if event.get("status"):
            last_status = event["status"]

    return {"content": last_content, "status": last_status}

def _get_approval_row(run_id: str):
    with psycopg2.connect(DATABASE_URL) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT jira_issue_key, requirement_json FROM run_approvals WHERE run_id = %s", (run_id,)
            )
            row = cur.fetchone()
            return (row[0], row[1]) if row else None

async def _get_session_id_from_jira(issue_key: str) -> str | None:
    """Fetch the session_id from the Jira issue's custom field."""
    try:
        issue = jira.issue(issue_key)
        session_id = getattr(issue.fields, FIELD_SESSION_ID, None)
        return session_id
    except Exception as e:
        print(f"Error fetching session_id from Jira issue {issue_key}: {e}")
        return None

@app.websocket("/ws/sessions/{session_id}")
async def ws_session(websocket: WebSocket, session_id: str):
    await manager.connect(session_id, websocket)
    try:
        while True:
            await websocket.receive_text()  # just keeps the connection alive
    except WebSocketDisconnect:
        await manager.disconnect(session_id, websocket)

@app.get("/api/approvals/{run_id}")
def get_approval_status(run_id: str):
    row = _get_approval_row(run_id)          # was: issue_key = _get_approval_row(run_id)
    if not row:
        raise HTTPException(status_code=404, detail="No Jira ticket found for this run")
    issue_key, _requirement_json = row
    issue = jira.issue(issue_key)
    simplified = JIRA_STATUS_MAP.get(issue.fields.status.name.lower(), "pending")
    return {"run_id": run_id, "jira_status": issue.fields.status.name, "status": simplified}

def _extract_tool_exec(requirement: dict) -> dict:
    return requirement.get("tool_execution") or requirement.get("toolExecution") or {}

async def _resolve_paused_run(run_id: str, confirmed: bool, requirement_json: str, note: str | None = None, session_id: str | None = None):
    requirement = json.loads(requirement_json)
    tool_exec = requirement.get("tool_execution") or requirement.get("toolExecution") or {}

    tool_payload = {
        "tool_call_id": tool_exec.get("tool_call_id") or tool_exec.get("toolCallId"),
        "tool_name": tool_exec.get("tool_name") or tool_exec.get("toolName"),
        "tool_args": tool_exec.get("tool_args") or tool_exec.get("toolArgs") or {},
        "requires_confirmation": True,
        "confirmed": confirmed,
        "confirmation_note": note or ("Action approved by human" if confirmed else "Action rejected by human"),
    }

    form_data = {"tools": json.dumps([tool_payload])}
    if session_id:
        form_data["session_id"] = session_id

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                f"http://localhost:7790/agents/{postgres_agent.id}/runs/{run_id}/continue",
                data=form_data,
            )
            resp.raise_for_status()
            result = _parse_sse_final_content(resp.text) if resp.content else {}
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="The agent took too long to respond after resuming.")
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=e.response.text)

    if session_id:
        await manager.send_to_session(session_id, {
            "type": "run_resumed",
            "run_id": run_id,
            "status": "completed" if confirmed else "rejected",
            "content": result.get("content"),
        })

    return result
@app.post("/api/approvals/{run_id}/continue")
async def continue_paused_run(run_id: str):
    row = _get_approval_row(run_id)
    if not row:
        raise HTTPException(status_code=404, detail="No Jira ticket found for this run")
    issue_key, requirement_json = row

    issue = jira.issue(issue_key)
    simplified = JIRA_STATUS_MAP.get(issue.fields.status.name.lower(), "pending")
    if simplified != "approved":
        raise HTTPException(status_code=409, detail=f"Not approved yet (status: {issue.fields.status.name})")

    session_id = getattr(issue.fields, FIELD_SESSION_ID, None)
    result = await _resolve_paused_run(run_id, confirmed=True, requirement_json=requirement_json, session_id=session_id)
    return {"status": "completed", "content": result.get("content", "Action confirmée.")}


@app.post("/api/approvals/{run_id}/reject")
async def reject_paused_run(run_id: str):
    row = _get_approval_row(run_id)
    if not row:
        raise HTTPException(status_code=404, detail="No Jira ticket found for this run")
    issue_key, _requirement_json = row

    issue = jira.issue(issue_key)
    simplified = JIRA_STATUS_MAP.get(issue.fields.status.name.lower(), "pending")
    if simplified != "blocked":
        raise HTTPException(status_code=409, detail=f"Ticket is not blocked (status: {issue.fields.status.name})")

    session_id = getattr(issue.fields, FIELD_SESSION_ID, None)
    
    # 1. Best-effort cancel of the active run
    try:
        await _cancel_paused_run(run_id)
    except Exception as e:
        print(f"Notice: Run cancel returned non-200 (run may already be stopped): {e}")

    # 2. Force close/notify front-end via WebSocket
    if session_id:
        await manager.send_to_session(session_id, {
            "type": "session_invalidated",
            "reason": "action_rejected",
            "run_id": run_id,
            "content": "Cette session a été fermée suite au rejet de l'action dans Jira. Une nouvelle session a été démarrée.",
        })

    return {
        "status": "rejected",
        "session_closed": True,
        "content": "Action bloquée. La session a été terminée."
    }

async def _cancel_paused_run(run_id: str):
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"http://localhost:7790/agents/{postgres_agent.id}/runs/{run_id}/cancel"
            )
            resp.raise_for_status()
            return resp.content  # may be empty - see note below
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Timed out cancelling the run.")
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=e.response.text)

if __name__ == "__main__":

    agent_os.serve(app="agent:app", reload=False, port=7790)

