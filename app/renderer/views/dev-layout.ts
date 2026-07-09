import { LayoutState, AppMode } from '../../common/types/mode.types';

export function createDevLayout(state: LayoutState): string {
  return `
<div class="dev-layout" id="dev-layout">
  <div class="layout-top">
    <div class="sidebar" id="sidebar">
      <div class="sidebar-header">资源管理器</div>
      <div id="file-tree-container"></div>
    </div>
    <div class="editor-area" id="editor-area">
      <div class="editor-tabs" id="editor-tabs"></div>
      <div class="editor-content" id="monaco-editor-host">
        <!-- VSCode Monaco Editor mounts here -->
      </div>
    </div>
    <div class="ai-panel ${state.aiPanelVisible ? '' : 'hidden'}" id="ai-panel">
      <div class="ai-panel-header">
        <span>AI 对话</span>
        <button class="ai-close-btn" id="ai-close-btn">✕</button>
      </div>
      <div id="ai-chat-container"></div>
    </div>
  </div>
  <div class="layout-bottom">
    <div class="panel-tabs" id="panel-tabs">
      <button class="panel-tab" data-panel="terminal">终端</button>
      <button class="panel-tab" data-panel="search">搜索</button>
    </div>
    <div class="panel-content" id="panel-content">
      <div class="terminal-panel ${state.terminalVisible ? '' : 'hidden'}" id="terminal-panel">
        <!-- VSCode terminal mounts here -->
      </div>
      <div class="search-panel ${state.searchVisible ? '' : 'hidden'}" id="search-panel">
        <input type="text" placeholder="搜索文件..." id="search-input" />
        <div id="search-results"></div>
      </div>
    </div>
  </div>
</div>

<style>
.dev-layout { display: flex; flex-direction: column; height: 100vh; background: #1e1e1e; color: #ccc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
.layout-top { display: flex; flex: 1; overflow: hidden; }
.sidebar { width: 260px; min-width: 200px; background: #252526; border-right: 1px solid #3c3c3c; display: flex; flex-direction: column; }
.sidebar-header { padding: 10px 12px; font-size: 11px; text-transform: uppercase; color: #999; letter-spacing: 0.5px; }
.editor-area { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
.editor-tabs { height: 36px; background: #2d2d2d; display: flex; align-items: center; padding: 0 8px; gap: 2px; border-bottom: 1px solid #3c3c3c; }
.editor-content { flex: 1; overflow: hidden; background: #1e1e1e; }
.ai-panel { width: 360px; min-width: 280px; background: #252526; border-left: 1px solid #3c3c3c; display: flex; flex-direction: column; }
.ai-panel.hidden { display: none; }
.ai-panel-header { display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; border-bottom: 1px solid #3c3c3c; font-size: 13px; }
.ai-close-btn { background: none; border: none; color: #999; cursor: pointer; font-size: 14px; }
.layout-bottom { height: 0; border-top: 1px solid #3c3c3c; }
.layout-bottom:has(.terminal-panel:not(.hidden)), .layout-bottom:has(.search-panel:not(.hidden)) { height: 200px; }
.panel-tabs { display: flex; padding: 0 8px; background: #2d2d2d; }
.panel-tab { background: none; border: none; color: #999; padding: 6px 12px; cursor: pointer; font-size: 12px; border-bottom: 2px solid transparent; }
.panel-tab:hover, .panel-tab.active { color: #fff; border-bottom-color: #007acc; }
.panel-content { height: calc(100% - 32px); overflow: auto; }
.terminal-panel.hidden, .search-panel.hidden { display: none; }
.hidden { display: none; }
</style>
`;
}

export function initDevLayout(): void {
  const toggleAiBtn = document.getElementById('ai-toggle-btn');
  const closeAiBtn = document.getElementById('ai-close-btn');
  const aiPanel = document.getElementById('ai-panel');

  toggleAiBtn?.addEventListener('click', () => aiPanel?.classList.toggle('hidden'));
  closeAiBtn?.addEventListener('click', () => aiPanel?.classList.add('hidden'));

  const panelTabs = document.querySelectorAll<HTMLElement>('.panel-tab');
  panelTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const panelId = tab.dataset.panel;
      if (!panelId) return;
      panelTabs.forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      document.querySelectorAll('.terminal-panel, .search-panel').forEach((p) => p.classList.add('hidden'));
      document.getElementById(`${panelId}-panel`)?.classList.remove('hidden');
      const bottom = document.querySelector('.layout-bottom') as HTMLElement;
      if (bottom) bottom.style.height = '200px';
    });
  });
}
