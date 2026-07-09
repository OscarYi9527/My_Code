export type AppMode = 'dev' | 'simple';

export interface LayoutState {
  mode: AppMode;
  sidebarVisible: boolean;
  aiPanelVisible: boolean;
  terminalVisible: boolean;
  searchVisible: boolean;
}

export interface ModeSwitchRequest {
  mode: AppMode;
}

export interface ModeSwitchResponse {
  success: boolean;
  mode: AppMode;
}
