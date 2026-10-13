import assert from 'node:assert/strict';
import { test } from 'node:test';

// A minimal browser history with asynchronous traversal. Start at a tagged
// entry as though the user refreshed an editor reached through app navigation.
const events = new EventTarget();
const indexKey = '__flowbuilderHistoryIndex';
const entries = [
  { url: '/dashboard', state: { [indexKey]: 5 } },
  { url: '/workflows', state: { [indexKey]: 6 } },
  { url: '/workflows/test/edit', state: { [indexKey]: 7 } },
];
let position = 2;
const location = {
  get pathname() { return entries[position].url; },
  get href() { return `https://example.test${entries[position].url}`; },
};
const history = {
  get state() { return entries[position].state; },
  pushState(state: Record<string, number>, _unused: string, url: string) {
    entries.splice(position + 1);
    entries.push({ url, state });
    position += 1;
  },
  replaceState(state: Record<string, number>, _unused: string, url: string) {
    entries[position] = { url: new URL(url, location.href).pathname, state };
  },
  go(delta: number) {
    queueMicrotask(() => {
      position += delta;
      const event = new Event('popstate');
      Object.assign(event, { state: history.state });
      events.dispatchEvent(event);
    });
  },
};
Object.assign(globalThis, {
  window: { location, addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events) },
  history, location,
  addEventListener: events.addEventListener.bind(events),
  removeEventListener: events.removeEventListener.bind(events),
  dispatchEvent: events.dispatchEvent.bind(events),
});
const { guardedNavigate, registerNavigationBlocker, requestGuardedAction } = await import('./guarded-location.ts');
const settle = () => new Promise(resolve => setTimeout(resolve, 0));

test('navigation guard preserves editor history across refresh, stay, discard and forward', async () => {
  assert.equal(history.state[indexKey], 7, 'refresh retains history index');
  let pending: (() => void) | undefined;
  const unregister = registerNavigationBlocker(leave => { pending = leave; });
  history.go(-1);
  await settle();
  assert.equal(location.pathname, '/workflows/test/edit', 'Back restored editor URL');
  assert.equal(position, 2, 'Back preserves history entries');
  assert.ok(pending);
  pending = undefined; // Stay: do not run the requested navigation.
  history.go(-1);
  await settle();
  pending!();
  await settle();
  assert.equal(location.pathname, '/workflows', 'Discard replays original Back');
  history.go(1);
  await settle();
  assert.equal(location.pathname, '/workflows', 'Forward is also held');
  pending!();
  await settle();
  assert.equal(location.pathname, '/workflows/test/edit', 'Discard replays Forward');
  unregister();
});

test('sidebar navigation, sign-out actions and clean navigation share the guard', () => {
  let pending: (() => void) | undefined;
  const unregister = registerNavigationBlocker(leave => { pending = leave; });
  guardedNavigate('/requests');
  assert.equal(location.pathname, '/workflows/test/edit');
  pending!();
  assert.equal(location.pathname, '/requests');
  assert.equal(history.state[indexKey], 8);
  let signedOut = false;
  requestGuardedAction(() => { signedOut = true; });
  assert.equal(signedOut, false);
  pending!();
  assert.equal(signedOut, true);
  unregister();
  guardedNavigate('/workflows');
  assert.equal(location.pathname, '/workflows');
  assert.equal(history.state[indexKey], 9);
  guardedNavigate('/workflows/new', { replace: true });
  assert.equal(history.state[indexKey], 9, 'replace preserves index');
});
