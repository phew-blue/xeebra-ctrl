// Tiny localStorage wrapper used to persist UI state (selected server per
// pane, split-view direction, active tab) across reloads.
//
// Wraps stored values as { v, value } so future schema changes can bump
// `v` to invalidate stale entries automatically — no manual migration.
// All keys are namespaced with the LEXI_PREFIX so they don't collide
// with any other app on the same origin.

const PREFIX = 'xctrl';

type Wrapped<T> = { v: string; value: T };

export function storeJSON<T>(key: string, value: T, version = '1'): void {
  if (typeof window === 'undefined') return;
  try {
    const wrapped: Wrapped<T> = { v: version, value };
    window.localStorage.setItem(`${PREFIX}:${key}`, JSON.stringify(wrapped));
  } catch {
    // Quota / privacy mode — storage is a UX nicety, not load-bearing.
  }
}

export function loadJSON<T>(key: string, version = '1'): T | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(`${PREFIX}:${key}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Wrapped<T>;
    if (!parsed || parsed.v !== version) return null;
    return parsed.value;
  } catch {
    return null;
  }
}

export function clearJSON(key: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(`${PREFIX}:${key}`);
  } catch {
    // ignore
  }
}
