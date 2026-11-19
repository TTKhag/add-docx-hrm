import { createAgentApi, type TemplateStudioApi } from '@/modules/agent';

declare global {
  interface Window {
    TemplateStudio?: TemplateStudioApi;
  }
}

/** Expose the Claude ↔ Studio API (FR-02). Everything goes through validated workflows; nothing writes the mapping table directly. */
export function installAgentBridge() {
  if (window.TemplateStudio) return;
  Object.defineProperty(window, 'TemplateStudio', { value: createAgentApi(), writable: false, configurable: false });
  document.documentElement.dataset.templateStudio = 'ready';
}
