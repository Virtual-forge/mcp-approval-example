# Inventory Console — demo dashboard 

A small product-inventory dashboard: a React UI listing products with a
detail view, backed by a Node/Express + Postgres API, plus a chat widget
wired to an **Agno AgentOS** agent that talks to the same Postgres database
through the **Postgres MCP server** (so the agent can genuinely query and
edit rows, not just answer from a prompt).

## Architecture

```
 React (Vite, :5173)
   ├── REST calls ─────────────► Node/Express API (:4000) ──► Postgres
   └── chat widget ────────────► AgentOS (FastAPI) (:7790)
                                     └── Agno Agent ──MCP──► Postgres
                                         (same "products" table)
```

Two independent paths hit the same table on purpose: the Node API is the
"normal" CRUD path the dashboard itself uses, and the agent's MCP path is
what powers the chat widget — e.g. asking it to "restock the Cirrus
headphones to 50" issues a real `UPDATE`, and the dashboard refreshes to
show it.

**Key Architecture Differences from v1 README:**
- Agent service runs on **port 7790** (AgentOS default), not 8001
- Uses **AgentOS** (Agno's new framework) instead of raw FastAPI
- Uses **Nvidia Nemotron 3 Ultra** model via Agno, not OpenAI/Anthropic directly
- Uses **postgres-mcp** CLI tool (not `@modelcontextprotocol/server-postgres` via npx)
- Includes **Jira HITL (Human-in-the-Loop) middleware** for DDL approval workflows
- Uses **Agno PostgresDb** for session persistence
- Database URL is hardcoded in agent.py (not from .env)

## Prerequisites

- Node.js 18+
- Python 3.10+
- A running Postgres instance you can connect to
- `postgres-mcp` CLI tool installed and on PATH (not npx)
- Nvidia API key for Nemotron model (or modify agent.py for other providers)
- Jira instance with custom fields configured (for HITL approval workflow)

## 1. Database

```bash
psql "$DATABASE_URL" -f db/init.sql
```

This creates the `products` table and seeds 12 mock products (peripherals,
displays, audio gear, etc.) with a mix of `active`, `low_stock`, and
`discontinued` statuses so the dashboard and the agent both have something
interesting to show on first run.

**Note:** The `DATABASE_URL` in agent.py is hardcoded to `postgresql://postgres:qaszdeszqa@localhost:5432/test_db`. You'll need to either:
- Create a database named `test_db` with that user/password, OR
- Edit `agent-service/agent.py` to use your actual DATABASE_URL

## 2. Backend API (Node/Express)

```bash
cd backend
cp .env.example .env      # fill in DATABASE_URL
npm install
npm run dev                # http://localhost:4000
```

**Environment variables (.env):**
- `DATABASE_URL` - PostgreSQL connection string
- `PORT` - optional, defaults to 4000
- `CORS_ORIGIN` - optional, defaults to http://localhost:5173

**API Endpoints:**
- `GET /api/health` - health check with DB connectivity
- `GET /api/products` - list all products (newest first)
- `GET /api/products/:id` - get single product
- `POST /api/products` - create product (sku, name, category, price required)
- `PUT /api/products/:id` - update product
- `DELETE /api/products/:id` - delete product

## 3. Agent Service (Agno AgentOS)

```bash
cd agent-service
python3 -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python agent.py              # http://localhost:7790
```

**Required Environment Variables (set in shell or .env):**
- `JIRA_BASE_URL` - Your Jira instance URL
- `JIRA_EMAIL` - Jira account email
- `JIRA_API_TOKEN` - Jira API token
- `JIRA_PROJECT_KEY` - Jira project key (e.g., "SCRUM")
- `JIRA_ISSUE_TYPE` - optional, defaults to "Task"
- Jira custom field IDs (see agent.py for defaults):
  - `JIRA_FIELD_APPROVAL_ID`
  - `JIRA_FIELD_TOOL_NAME`
  - `JIRA_FIELD_AGENT_ID`
  - `JIRA_FIELD_APPROVAL_TYPE`
  - `JIRA_FIELD_TOOL_CALL_ID`
  - `JIRA_FIELD_TOOL_ARGS`
  - `JIRA_FIELD_SESSION_ID`
  - `JIRA_FIELD_RUN_ID`
  - `JIRA_FIELD_REQUESTED_BY`

**Important Notes:**
- The agent uses **Nvidia Nemotron 3 Ultra** model via Agno's Nvidia provider
- Database URL is **hardcoded** in `agent.py` - edit the file to change it
- The `postgres-mcp` CLI tool must be installed and on PATH
- AgentOS runs on **port 7790** (not 8001)
- Includes Jira HITL middleware for DDL operation approvals
- Uses Agno's PostgresDb for session persistence

**AgentOS Endpoints:**
- `POST /agents/{agent_id}/runs` - Start agent run (used by chat widget)
- `GET /api/approvals/{run_id}` - Check Jira approval status
- `POST /api/approvals/{run_id}/continue` - Continue after Jira approval
- `POST /api/approvals/{run_id}/reject` - Reject paused run

## 4. Frontend (React + Vite)

```bash
cd frontend
cp .env.example .env       # defaults already point at localhost:4000/7790
npm install
npm run dev                 # http://localhost:5173
```

**Environment variables (.env):**
- `VITE_API_URL` - defaults to `http://localhost:4000/api`
- `VITE_AGENT_OS_URL` - defaults to `http://localhost:7790`
- `VITE_AGENT_ID` - defaults to `postgres_agent`

Open http://localhost:5173 — browse the catalog on the left, click a
product to see its detail view, and use "Ask the agent" in the bottom right
for the chatbot.

## Things to try in the chat widget

- "Which products are low on stock?"
- "What's the most expensive item in Peripherals?"
- "Restock the Cirrus headphones to 50 units" → then close/reopen a product to see the dashboard reflect the change
- "Add a new product: a $25 USB-C cable, SKU CB-2001, category Accessories, 100 in stock"
- Try a DDL operation like "Drop the products table" - it will create a Jira ticket for approval

## How the Chat Widget Works

1. User sends message → `POST /agents/postgres_agent/runs` with `session_id` (persisted in localStorage)
2. AgentOS runs the agent with MCP tools connected to Postgres
3. If agent needs to run DDL (DROP/ALTER TABLE), it pauses and creates a Jira ticket via HITL middleware
4. Frontend polls `/api/approvals/{run_id}` and shows approval button
5. When Jira ticket is approved, frontend calls `/api/approvals/{run_id}/continue`
6. Agent resumes and returns result
7. Frontend calls `onDataChanged` callback to refresh product list

## Jira HITL Middleware & Approval Process

The agent service includes a **Human-in-the-Loop (HITL) middleware** that intercepts
potentially destructive database operations (DDL statements like `DROP TABLE`,
`ALTER TABLE`, `TRUNCATE`, etc.) and requires human approval before execution.

### How It Works

**1. Middleware Interception (`agent-service/hitl.py`)**
- The `JiraMiddleware` class wraps the agent's tool execution
- Before any tool runs, it checks if the SQL contains DDL patterns
- If DDL is detected, the run is **paused** and a Jira ticket is created

**2. Jira Ticket Creation**
- Creates a Jira issue in the configured project (`JIRA_PROJECT_KEY`)
- Populates custom fields with execution context:
  - `JIRA_FIELD_TOOL_NAME` - the MCP tool being called (e.g., `execute_sql`)
  - `JIRA_FIELD_TOOL_ARGS` - the SQL statement and parameters
  - `JIRA_FIELD_AGENT_ID` - the agent identifier (`postgres_agent`)
  - `JIRA_FIELD_APPROVAL_TYPE` - set to "DDL"
  - `JIRA_FIELD_SESSION_ID` / `JIRA_FIELD_RUN_ID` - for resuming
  - `JIRA_FIELD_REQUESTED_BY` - user who triggered the action
- Sets the approval field (`JIRA_FIELD_APPROVAL_ID`) to "Pending"

**3. Frontend Polling & Approval UI**
- Chat widget polls `GET /api/approvals/{run_id}` every 3 seconds
- When status is "pending", shows an **Approval Button** component
- User clicks "Approve" → calls `POST /api/approvals/{run_id}/continue`
- User clicks "Reject" → calls `POST /api/approvals/{run_id}/reject`

**4. Resume Execution**
- On approval: middleware updates Jira ticket status to "Approved",
  releases the pause, and agent continues with the tool call
- On rejection: middleware updates Jira ticket to "Rejected",
  cancels the run, and returns an error to the user

### Required Jira Configuration

You must configure these **custom fields** in your Jira instance and set their
IDs in the environment variables:

| Env Variable | Purpose | Example Value |
|--------------|---------|---------------|
| `JIRA_FIELD_APPROVAL_ID` | Approval status field (Pending/Approved/Rejected) | `customfield_10001` |
| `JIRA_FIELD_TOOL_NAME` | Stores the MCP tool name | `customfield_10002` |
| `JIRA_FIELD_AGENT_ID` | Stores the agent identifier | `customfield_10003` |
| `JIRA_FIELD_APPROVAL_TYPE` | Type of approval (DDL, DML, etc.) | `customfield_10004` |
| `JIRA_FIELD_TOOL_CALL_ID` | Unique ID for the tool call | `customfield_10005` |
| `JIRA_FIELD_TOOL_ARGS` | JSON string of tool arguments (SQL) | `customfield_10006` |
| `JIRA_FIELD_SESSION_ID` | AgentOS session ID | `customfield_10007` |
| `JIRA_FIELD_RUN_ID` | AgentOS run ID | `customfield_10008` |
| `JIRA_FIELD_REQUESTED_BY` | User who initiated the action | `customfield_10009` |

### Approval Flow Diagram

```
User: "Drop the products table"
         │
         ▼
AgentOS runs agent → MCPTools.execute_sql("DROP TABLE products")
         │
         ▼
JiraMiddleware intercepts → detects DDL pattern
         │
         ▼
Creates Jira ticket (status: Pending) → pauses run
         │
         ▼
Frontend polls /api/approvals/{run_id} → shows "Approve/Reject" buttons
         │
         ├── User clicks Approve ──► POST /continue ──► Resume run ──► Execute DDL
         │
         └── User clicks Reject ──► POST /reject ──► Cancel run ──► Error to user
```

### Security Notes

- **DDL operations are blocked by default** — no schema changes happen without explicit human approval
- The middleware only pauses for DDL; regular DML (SELECT, INSERT, UPDATE, DELETE) executes normally
- All approval decisions are audited in Jira with full context (SQL, user, timestamp)
- The `postgres-mcp` server runs with the same DB credentials as the agent — ensure your Postgres user has appropriate permissions

## Notes / known limits (it's a demo)

- The chat widget keeps one shared agent session per browser (persisted in localStorage) — fine for a live demo, not meant for multiple concurrent users.
- No auth on either service — add it before deploying this anywhere public.
- **Database URL is hardcoded in agent.py** - you must edit the file to match your Postgres setup.
- **Jira integration is required** for the HITL workflow - the agent will fail to create approval tickets without valid Jira credentials and custom fields.
- Agno's API moves fast; if `agent-service/agent.py` fails to import, check your installed `agno` version's docs for the current `MCPTools` / model-class signatures — the wiring pattern (MCP tool + Agent + AgentOS) stays the same even if exact call signatures shift.
- The `postgres-mcp` CLI tool must be installed separately (not via npx).
- Uses Nvidia Nemotron model - requires Nvidia API access or code change to use OpenAI/Anthropic.
