import { User } from '../../common/types/auth.types';
import { AppMode } from '../../common/types/mode.types';

interface AppState {
  user: User | null;
  isLoggedIn: boolean;
  mode: AppMode;
  isLoading: boolean;
}

type Listener = (state: AppState) => void;
const listeners = new Set<Listener>();

let state: AppState = { user: null, isLoggedIn: false, mode: 'dev', isLoading: true };

export function getState(): AppState { return { ...state }; }

export function setUser(user: User | null): void {
  state = { ...state, user, isLoggedIn: !!user, isLoading: false };
  notify();
}

export function setMode(mode: AppMode): void { state = { ...state, mode }; notify(); }

export function handleSessionRestored(user: User): void { state = { ...state, user, isLoggedIn: true, isLoading: false }; notify(); }
export function handleSessionFailed(): void { state = { ...state, user: null, isLoggedIn: false, isLoading: false }; notify(); }

export function subscribe(fn: Listener): () => void { listeners.add(fn); return () => listeners.delete(fn); }

function notify(): void { const s = getState(); for (const fn of listeners) fn(s); }
