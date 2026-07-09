import { AppMode } from '../../common/types/mode.types';

export function createModeSwitcher(currentMode: AppMode): string {
  return `
<div class="mode-switcher">
  <span class="mode-label">模式:</span>
  <button class="mode-btn ${currentMode === 'dev' ? 'active' : ''}" data-mode="dev" id="mode-dev-btn">开发</button>
  <button class="mode-btn ${currentMode === 'simple' ? 'active' : ''}" data-mode="simple" id="mode-simple-btn">简约</button>
</div>

<style>
.mode-switcher { display: flex; align-items: center; gap: 6px; padding: 4px 8px; background: #3c3c3c; border-radius: 4px; }
.mode-label { font-size: 11px; color: #999; }
.mode-btn { background: none; border: 1px solid transparent; color: #999; padding: 3px 8px; border-radius: 3px; cursor: pointer; font-size: 12px; }
.mode-btn:hover { color: #fff; }
.mode-btn.active { background: #007acc; color: #fff; border-color: #007acc; }
</style>
`;
}

export function bindModeSwitcherEvents(onSwitch: (mode: AppMode) => void): void {
  document.getElementById('mode-dev-btn')?.addEventListener('click', () => onSwitch('dev'));
  document.getElementById('mode-simple-btn')?.addEventListener('click', () => onSwitch('simple'));
}
