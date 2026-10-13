import { useSyncExternalStore } from 'react';
import { navigate } from 'wouter/use-browser-location';

type NavigateOptions = { replace?: boolean; state?: unknown };
type Blocker = (leave: () => void) => void;
const indexKey = '__flowbuilderHistoryIndex';
type GuardState = {
  blocker: Blocker | null;
  index: number;
  path: string;
  restoring: boolean;
  allowedPop: boolean;
  afterRestore: (() => void) | null;
  listeners: Set<() => void>;
};
// The router and editor may refresh independently in Vite. Keep their shared
// controller across hot updates so an old hook cannot bypass a new blocker.
const guard: GuardState = import.meta.hot?.data.guard ?? {
  blocker: null, index: history.state?.[indexKey] ?? 0,
  path: window.location.pathname, restoring: false, allowedPop: false,
  afterRestore: null, listeners: new Set(),
};
if (import.meta.hot) import.meta.hot.data.guard = guard;

function stateAt(value: unknown, position: number) {
  return { ...(value && typeof value === 'object' ? value : {}), [indexKey]: position };
}
function publishLocation() {
  guard.path = window.location.pathname;
  guard.listeners.forEach(listener => listener());
}

// Give each app history entry an index so Back/Forward can be cancelled without
// replacing either entry or unmounting the editor before the user decides.
history.replaceState(stateAt(history.state, guard.index), '', window.location.href);
const onPopState = (event: PopStateEvent) => {
  const nextIndex = event.state?.[indexKey] as number | undefined;
  if (guard.restoring) {
    if (nextIndex !== undefined && nextIndex !== guard.index) {
      history.go(guard.index - nextIndex);
      return;
    }
    guard.restoring = false;
    const resume = guard.afterRestore;
    guard.afterRestore = null;
    resume?.();
    return;
  }
  if (guard.allowedPop) {
    guard.allowedPop = false;
    guard.index = nextIndex ?? guard.index;
    publishLocation();
    return;
  }
  if (guard.blocker && window.location.pathname !== guard.path && nextIndex !== undefined) {
    const delta = nextIndex - guard.index;
    guard.restoring = true;
    history.go(-delta);
    guard.blocker(() => {
      const resume = () => {
        guard.allowedPop = true;
        history.go(delta);
      };
      if (guard.restoring) guard.afterRestore = resume;
      else resume();
    });
    return;
  }
  guard.index = nextIndex ?? guard.index;
  publishLocation();
};
window.addEventListener('popstate', onPopState);
if (import.meta.hot) {
  import.meta.hot.dispose(() => window.removeEventListener('popstate', onPopState));
}

export function registerNavigationBlocker(next: Blocker) {
  guard.blocker = next;
  return () => { if (guard.blocker === next) guard.blocker = null; };
}

export function navigateWithoutGuard(to: string, options: NavigateOptions = {}) {
  if (!options.replace) guard.index += 1;
  navigate(to, { ...options, state: stateAt(options.state, guard.index) });
  publishLocation();
}

export function requestGuardedAction(leave: () => void) {
  if (guard.blocker) guard.blocker(leave);
  else leave();
}

export function guardedNavigate(to: string, options: NavigateOptions = {}) {
  const leave = () => navigateWithoutGuard(to, options);
  if (new URL(to, window.location.href).pathname !== guard.path) requestGuardedAction(leave);
  else leave();
}

const subscribe = (listener: () => void) => {
  guard.listeners.add(listener);
  return () => { guard.listeners.delete(listener); };
};
export function useGuardedLocation(): [string, typeof guardedNavigate] {
  return [useSyncExternalStore(subscribe, () => guard.path), guardedNavigate];
}
