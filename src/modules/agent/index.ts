export { createAgentApi, type TemplateStudioApi } from './services/agent.workflow';
export { AgentPanel } from './components/AgentPanel';
export { default as BridgePage } from './pages/BridgePage';
export { claudeLink, type ClaudeOpenMode, promptAnalyze, promptCreate, promptDuty } from './services/prompts';
export { cancelJob, enqueueJob, getDuty, isOnDuty, JOB_LABEL } from './services/duty';
export { handOffToClaude, openClaudeForDuty, OPEN_MODE_KEY, useDuty, useJobs, useOpenMode } from './hooks';
