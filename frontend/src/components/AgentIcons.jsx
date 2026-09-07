import React from 'react';
import agnoLogo from '../assets/agno.png';
import langgraphLogo from '../assets/langgraph-color.svg';

function AgnoIcon({ size = 14 }) {
  return <img src={agnoLogo} alt="" width={size} height={size} className="agent-icon" />;
}

function LangGraphIcon({ size = 14 }) {
  return <img src={langgraphLogo} alt="" width={size} height={size} className="agent-icon" />;
}

export const AGENT_ICONS = {
  agno: AgnoIcon,
  langgraph: LangGraphIcon,
};
