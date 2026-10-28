import os, certifi
os.environ['SSL_CERT_FILE'] = certifi.where()
os.environ['REQUESTS_CA_BUNDLE'] = certifi.where()  # requests uses this one
os.environ['CURL_CA_BUNDLE'] = certifi.where()       # some libs use this instead
import truststore
truststore.inject_into_ssl()
import json
import os
from dotenv import load_dotenv
import inspect
import os
import re
from fastapi import Response
from jira import JIRA
import psycopg2
from agno.tools import tool
from starlette.middleware.base import BaseHTTPMiddleware
from agno.run import RunContext

load_dotenv()

JIRA_BASE_URL = os.environ["JIRA_BASE_URL"].rstrip("/")
JIRA_EMAIL = os.environ["JIRA_EMAIL"]
JIRA_API_TOKEN = os.environ["JIRA_API_TOKEN"]
JIRA_PROJECT_KEY = os.environ["JIRA_PROJECT_KEY"]
JIRA_ISSUE_TYPE = os.environ["JIRA_ISSUE_TYPE"]

jira = JIRA(
    server=os.environ["JIRA_BASE_URL"],
    basic_auth=(os.environ["JIRA_EMAIL"], os.environ["JIRA_API_TOKEN"]),
)

FIELD_APPROVAL_ID = os.environ["JIRA_FIELD_APPROVAL_ID"]
FIELD_TOOL_NAME = os.environ["JIRA_FIELD_TOOL_NAME"]
FIELD_AGENT_ID = os.environ["JIRA_FIELD_AGENT_ID"]
FIELD_APPROVAL_TYPE = os.environ["JIRA_FIELD_APPROVAL_TYPE"]
FIELD_TOOL_CALL_ID = os.environ["JIRA_FIELD_TOOL_CALL_ID"]
FIELD_TOOL_ARGS = os.environ["JIRA_FIELD_TOOL_ARGS"]
FIELD_SESSION_ID = os.environ["JIRA_FIELD_SESSION_ID"]
FIELD_RUN_ID = os.environ["JIRA_FIELD_RUN_ID"]
FIELD_REQUESTED_BY = os.environ["JIRA_FIELD_REQUESTED_BY"]

DATABASE_URL = os.environ["DATABASE_URL"]



_auth = (JIRA_EMAIL, JIRA_API_TOKEN)

class JiraHitlMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)

        is_run_endpoint = (
            request.method == "POST"
            and str(request.url.path).endswith("/runs")
        )
        if not is_run_endpoint:
            return response

        body = b"".join([chunk async for chunk in response.body_iterator])
        content_type = response.headers.get("content-type", "")
        

        if "text/event-stream" in content_type:
            for line in body.decode("utf-8", errors="ignore").splitlines():
                if not line.startswith("data:"):
                    continue
                payload = line[len("data:"):].strip()
                if not payload:
                    continue
                try:
                    data = json.loads(payload)
                except json.JSONDecodeError:
                    continue
             
                if data.get("status", "").upper() == "PAUSED":
                  
                    import traceback

                    try:
                        jira.create_issue(fields={...})
                    except Exception as e:
                        print("JIRA ISSUE CREATION FAILED:")
                        traceback.print_exc()
        elif "application/json" in content_type:
            try:
                data = json.loads(body)

                if data.get("status", "").upper() == "PAUSED":

                    try:
                        create_jira_issue_for_run(data)
                    except Exception as e:
                        print("JIRA ISSUE CREATION FAILED:", e)  # TEMP DEBUG
                 
            except json.JSONDecodeError as e:
                print("JSON DECODE FAILED:", e)  # TEMP DEBUG

        return Response(
            content=body,
            status_code=response.status_code,
            headers=dict(response.headers),
            media_type=response.media_type,
        )
    
def create_jira_issue_for_run(data: dict):
    # Be defensive: some run/stream payloads may omit keys or use
    # slightly different names (e.g. `active_requirements`). Use
    # .get() and fallbacks to avoid KeyError and log when required data
    # is missing.
    run_id = data.get("run_id")
    # session_id can appear under a few shapes depending on the event
    session_id = data.get("session_id") or data.get("sessionId")
    # sometimes the event contains a nested session object
    if session_id is None:
        sess = data.get("session")
        if isinstance(sess, dict):
            session_id = sess.get("id")

    agent_id = data.get("agent_id")
    requested_by = data.get("user_id", "lakehaylihamza@gmail.com")

    requirements = data.get("requirements") or data.get("active_requirements") or []

    if not session_id:
        print("create_jira_issue_for_run: missing session_id in payload; payload:", data)

    for requirement in requirements:
        # defensive access into requirement/tool_execution
        tool_exec = requirement.get("tool_execution") or requirement.get("toolExecution")
        if not tool_exec:
            continue

        if not tool_exec.get("requires_confirmation"):
            continue

        tool_call_id = tool_exec.get("tool_call_id") or tool_exec.get("toolCallId")
        tool_name = tool_exec.get("tool_name") or tool_exec.get("toolName")
        tool_args = tool_exec.get("tool_args") or tool_exec.get("toolArgs") or {}

        # Build description in the format expected by the frontend parser
        # Frontend expects: Agent:, Run:, Session:, Requested by (user_id):, Tool:, Context:, Requirements:, Arguments:
        # with JSON blocks for Context, Requirements, and Arguments
        import json
        description_parts = [
            f"Requirements:\n```json\n{json.dumps(requirement, indent=2)}\n```",
        ]
        description = "\n".join(description_parts)

        fields = {
            "project": {"key": JIRA_PROJECT_KEY},
            "issuetype": {"name": JIRA_ISSUE_TYPE},
            "summary": f"Approval: {tool_name}",
            "description": description,
            "labels": [f"run_id:{run_id}"] + ([f"session_id:{session_id}"] if session_id else []),
            FIELD_APPROVAL_ID: requirement.get("id"),
            FIELD_TOOL_NAME: tool_name,
            FIELD_AGENT_ID: agent_id,
            FIELD_APPROVAL_TYPE: tool_exec.get("approval_type", "required"),
            FIELD_TOOL_CALL_ID: tool_call_id,
            FIELD_TOOL_ARGS: json.dumps(tool_args),
            FIELD_RUN_ID: run_id,
            FIELD_REQUESTED_BY: requested_by,
        }

        # Only include session custom field if we have a value
        if session_id:
            fields[FIELD_SESSION_ID] = session_id

        new_issue = jira.create_issue(fields=fields)
        with psycopg2.connect(DATABASE_URL) as conn:
            with conn.cursor() as cur:
                
                              
                cur.execute(
                        "INSERT INTO run_approvals (run_id, jira_issue_key, requirement_json) VALUES (%s, %s, %s) "
                        "ON CONFLICT (run_id) DO UPDATE SET jira_issue_key = EXCLUDED.jira_issue_key, "
                        "requirement_json = EXCLUDED.requirement_json",
                        (run_id, new_issue.key, json.dumps(requirement)),
                    )
            conn.commit()


# --- same decorator you already have working in jira_agent.py ---
def jira_approval(func):
    wrapped = tool(requires_confirmation=True)(func)
    wrapped._jira_approval = True
    return wrapped

DANGEROUS_SQL_RE = re.compile(r"\b(DROP\s+TABLE|ALTER\s+TABLE)\b", re.IGNORECASE)

def _extract_sql(arguments: dict) -> str:
    # postgres-mcp's execute tool takes "sql" - keep "query" as a fallback
    # in case your installed version names it differently.
    return str(arguments.get("sql") or arguments.get("query") or "")



async def block_unapproved_ddl_hook(function_name, function_call, arguments):
    """Runs for every tool call the agent makes (MCP tools included).
    Hard-blocks DROP/ALTER attempted via the raw MCP execute tool, since
    MCPTools doesn't honor per-tool requires_confirmation."""
    if function_name == "execute_sql" and DANGEROUS_SQL_RE.search(_extract_sql(arguments)):
        return (
            "BLOCKED: schema-altering statements must go through the "
            "`run_admin_sql` tool, which requires human approval. "
            "Call run_admin_sql with this exact SQL instead."
        )
    if inspect.iscoroutinefunction(function_call):
        return await function_call(**arguments)
    return function_call(**arguments)

@jira_approval
def run_admin_sql(sql: str, run_context: RunContext) -> str:
    """Execute a DROP TABLE / ALTER TABLE (or other schema-altering) statement.
    Requires human approval before running."""
    with psycopg2.connect(DATABASE_URL) as conn:
        with conn.cursor() as cur:
            cur.execute(sql)
        conn.commit()
    return f"Executed: {sql}"

