# Inventory Console — Documentation Wiki

This wiki documents the **actual** behavior of the codebase in this repo, verified
line-by-line against `agent-service/`, `backend/`, `frontend/`, and `db/`. Where the
top-level `README.md` describes something the code doesn't actually do, it's called
out explicitly in [08-known-gaps.md](./08-known-gaps.md) rather than silently repeated.

## Pages

1. [Architecture](./01-architecture.md) — the three services, how they talk to each other, and why there are two write paths into the same table
2. [Setup & Running Locally](./02-setup.md) — step-by-step, with the actual env vars each service reads
3. [Data Model](./03-data-model.md) — `products` and `run_approvals` tables
4. [Backend API (Node/Express)](./04-backend-api.md) — REST endpoints on port 4000
5. [Agent Service (Agno AgentOS)](./05-agent-service.md) — the agent, its tools, and its endpoints on port 7790
6. [HITL Approval Workflow](./06-hitl-approval-workflow.md) — how a DROP/ALTER TABLE request turns into a Jira ticket and back
7. [Frontend](./07-frontend.md) — component tree and what each one actually calls
8. [Known Gaps & Inconsistencies](./08-known-gaps.md) — things the code doesn't do that the old README implied, and things that would break a fresh clone

## One-paragraph summary

Three services share one Postgres database. The **frontend** (React/Vite, `:5173`) is a
read-only product catalog UI plus a chat widget. The **backend** (Node/Express, `:4000`)
exposes a full CRUD REST API over the `products` table, but — as of this codebase — the
frontend only ever calls the `GET` endpoints; nothing in the UI calls `POST`/`PUT`/`DELETE`.
The **agent service** (Python/Agno AgentOS, `:7790`) runs an LLM agent with direct MCP
access to the same Postgres database, so the chat widget can genuinely read and write
rows. Ordinary SQL (SELECT/INSERT/UPDATE/DELETE) runs immediately; `DROP TABLE` /
`ALTER TABLE` is intercepted and routed through a Jira-backed human-approval flow before
it's allowed to execute.
