import { agnoAdapter } from './agnoAdapter.js';
import { langgraphAdapter } from './langgraphAdapter.js';

export const AGENTS = {
  agno: agnoAdapter,
  langgraph: langgraphAdapter,
};

export const AGENT_LIST = Object.values(AGENTS);
export const DEFAULT_AGENT_ID = 'agno';
