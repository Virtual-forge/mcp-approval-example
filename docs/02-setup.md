# Setup & Running Locally

This walks through what's actually required to get the frontend, backend, and agent
service running.

## 0. Prerequisites

- Node.js 18+ (backend uses `node --watch`, needs Node 18.11+)
- Python 3.10+
- A reachable Postgres instance
- The `postgres-mcp` CLI on `PATH` (installed separately — it is **not** an npm/pip
  package pulled in by `requirements.txt`)
- An Nvidia API key (the agent uses `agno.models.nvidia.Nvidia`, model id
  `nvidia/nemotron-3-ultra-550b-a55b`)
- A Jira Cloud instance + API token, with 9 custom fields already created (see
  [06-hitl-approval-workflow.md](./06-hitl-approval-workflow.md))

An [agent-service `.env.example`](../agent-service/.env.example) is provided. Copy it
to `agent-service/.env` and fill in every value, including the blank Jira field-ID
entries, with values for your environment. The backend and frontend `.env` files are
created separately as described below.

## 1. Database

```bash
psql "$DATABASE_URL" -f db/init.sql
```

This creates and seeds the `products` table only (12 demo rows). It does **not** create
the `run_approvals` table that `agent-service/agent.py` and `agent-service/hitl.py`
require at runtime — see [03-data-model.md](./03-data-model.md#run_approvals-not-in-initsql)
for the DDL you need to run manually before the approval flow will work.

## 2. Backend API (`backend/`)

```bash
cd backend
npm install
node src/index.js     # or: npm run dev (auto-restarts on changes)
```

Create `backend/.env` with:

| Var | Required | Default | Notes |
|---|---|---|---|
| `DATABASE_URL` | yes | — | Postgres connection string, read by `pg.Pool` in `src/db.js` |
| `PORT` | no | `4000` | |
| `CORS_ORIGIN` | no | `http://localhost:5173` | Comma-separated list allowed |

## 3. Agent service (`agent-service/`)

```bash
cd agent-service
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python agent.py        # http://localhost:7790
```

`requirements.txt` does not currently list every package imported by the service.
`agent.py`/`hitl.py` also import `jira`, `psycopg2`, `certifi`, `truststore`, and
`httpx`. Install them manually (`pip install jira psycopg2-binary certifi truststore
httpx`) or the service will fail on import.

Create `agent-service/.env` from the example. All of these values are required:

| Var | Notes |
|---|---|---|
| `DATABASE_URL` | Postgres connection string used by both the agent and approval workflow |
| `NVIDIA_API_KEY` | API key for the Nvidia model provider |
| `JIRA_BASE_URL` | Base URL of your Jira instance |
| `JIRA_EMAIL` | Jira account email |
| `JIRA_API_TOKEN` | Jira API token |
| `JIRA_PROJECT_KEY` | Project key from your Jira instance; approval issues are created in this project |
| `JIRA_ISSUE_TYPE` | Issue type available in the selected Jira project |
| `JIRA_FIELD_APPROVAL_ID` | Custom-field ID for the approval requirement ID |
| `JIRA_FIELD_TOOL_NAME` | Custom-field ID for the tool name |
| `JIRA_FIELD_AGENT_ID` | Custom-field ID for the agent ID |
| `JIRA_FIELD_APPROVAL_TYPE` | Custom-field ID for the approval type |
| `JIRA_FIELD_TOOL_CALL_ID` | Custom-field ID for the tool call ID |
| `JIRA_FIELD_TOOL_ARGS` | Custom-field ID for the tool arguments |
| `JIRA_FIELD_SESSION_ID` | Custom-field ID for the session ID |
| `JIRA_FIELD_RUN_ID` | Custom-field ID for the run ID |
| `JIRA_FIELD_REQUESTED_BY` | Custom-field ID for the requester |

Every Jira setting above is required for the approval workflow. The app does not supply
defaults for the project key, issue type, or custom-field IDs. Select the project key,
issue type, and field IDs that exist in your Jira instance; the nine `JIRA_FIELD_*`
values must be the IDs of the corresponding custom fields in that instance.

## 4. Frontend (`frontend/`)

```bash
cd frontend
npm install
npm run dev             # http://localhost:5173
```

Create `frontend/.env` with (all optional — `frontend/src/api.js` has working
fallbacks for local dev):

| Var | Default |
|---|---|
| `VITE_API_URL` | `http://localhost:4000/api` |
| `VITE_AGENT_OS_URL` | `http://localhost:7790` |
| `VITE_AGENT_ID` | `postgres_agent` |

## Verifying it's wired up

1. `curl http://localhost:4000/api/health` → `{"status":"ok","db":"connected"}`
2. Open `http://localhost:5173` — you should see the 12 seeded products
3. Open the chat widget, ask "which products are low on stock?" — this runs entirely
   through the agent's own MCP/Postgres connection, independent of the Node API
4. Ask it to "drop the products table" to exercise the approval flow (see next page) —
   **note this will actually attempt a real DROP once approved**, so do this against a
   throwaway database
