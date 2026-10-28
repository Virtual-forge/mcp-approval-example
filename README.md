# Inventory Console

Inventory Console is a demo application for browsing a seeded product catalog and
interacting with a PostgreSQL-backed DBA agent. It consists of a React/Vite frontend, a
Node/Express API, and a Python/Agno AgentOS service. The agent can query and update the
catalog through PostgreSQL MCP; `DROP TABLE` and `ALTER TABLE` requests go through a
Jira-backed human approval flow.

## Documentation

The detailed project documentation lives in [`docs/`](./docs/):

1. [Architecture](./docs/01-architecture.md) — services, data flow, and database setup
2. [Setup & running locally](./docs/02-setup.md) — prerequisites, environment variables,
   and how to start each service
3. [Data model](./docs/03-data-model.md) — product and approval tables
4. [Backend API](./docs/04-backend-api.md) — REST routes and behavior
5. [Agent service](./docs/05-agent-service.md) — Agno agent, tools, and endpoints
6. [HITL approval workflow](./docs/06-hitl-approval-workflow.md) — Jira approval flow
7. [Frontend](./docs/07-frontend.md) — UI structure and API usage
8. [Known gaps](./docs/08-known-gaps.md) — current limitations and setup caveats

## Quick start

See [Setup & running locally](./docs/02-setup.md) for the complete instructions. The
agent requires an `agent-service/.env` file; start with
[`agent-service/.env.example`](./agent-service/.env.example). You will need a reachable
PostgreSQL database, an Nvidia API key, and a Jira instance configured with the required
project, issue type, and custom fields.

Initialize the demo product catalog with `db/init.sql`. Note that this SQL file does
not create the `run_approvals` table required by the Jira approval workflow; the setup
guide and [data model documentation](./docs/03-data-model.md) describe this limitation.
