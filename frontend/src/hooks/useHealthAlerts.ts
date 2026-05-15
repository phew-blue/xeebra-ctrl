import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { PlatformHealthCheck } from '@/types';

// Hardcoded ignore list: these systemd units are intentionally disabled by
// config on the Xeebras we polled (sdi-only deployment), so they always
// report critical. Ignoring them entirely keeps badge counts honest and
// stops them spamming the toast layer on every connect.
//
// If a deployment ever uses these services for real, drop the entry — the
// alerting will start surfacing them again automatically.
const IGNORE_SERVICE_NAMES = new Set<string>([
  'evs-ip-engine',
  'evs-streaming-engine',
]);

const POLL_MS = 5000;

export interface AlertCounts {
  /** Critical entries minus the ignored noise. */
  critical: number;
  /** Warning entries minus the ignored noise. */
  warning: number;
}

export interface UseHealthAlertsResult {
  /** Map serverId → counts; missing key means we haven't polled it yet. */
  byServerId: Record<string, AlertCounts>;
}

interface ServerInput {
  id: string;
  /** IP we use to talk to /api/platform on this server. */
  ip: string;
  /** Human-friendly label used in toast titles. */
  name: string;
}

/**
 * Polls /api/platform-console/health/checks per server every POLL_MS, and
 *   1. exposes per-server critical/warning counts for sidebar/card badges
 *      (excluding the hardcoded ignore list);
 *   2. fires a sonner toast the first time we see a (server, checkId,
 *      status) triple that we haven't already alerted on this session —
 *      which means existing-on-startup criticals are silently absorbed
 *      into the seen-set and never spam the user, but a freshly degraded
 *      VD or a service that flips to critical mid-show pops a toast
 *      immediately.
 *
 * Disabled when isDemo=true (no real backend to talk to).
 */
export function useHealthAlerts(
  servers: ServerInput[],
  isDemo: boolean,
): UseHealthAlertsResult {
  const [byServerId, setByServerId] = useState<Record<string, AlertCounts>>({});
  // (serverId,checkId,status) triples we've already observed in this
  // session — both the ones from first-poll baseline and ones we've
  // already toasted on. Stops re-toasting when state stays the same.
  const seenRef = useRef<Set<string>>(new Set());
  // Server IDs whose first poll has completed — only after that do we
  // start firing toasts for new entries.
  const initializedRef = useRef<Set<string>>(new Set());

  const poll = useCallback(async () => {
    if (isDemo || servers.length === 0) return;
    await Promise.all(
      servers.map(async (server) => {
        let checks: PlatformHealthCheck[] | null = null;
        try {
          const res = await fetch(
            `/api/platform?ip=${encodeURIComponent(server.ip)}&path=health%2Fchecks`,
          );
          if (res.ok) checks = (await res.json()) as PlatformHealthCheck[];
        } catch {
          // Treat fetch failure as "no data" — leave previous counts in
          // place rather than zeroing them and looking healthy when the
          // server is unreachable.
          return;
        }
        if (!Array.isArray(checks)) return;

        let critical = 0;
        let warning = 0;
        const isInitial = !initializedRef.current.has(server.id);
        for (const c of checks) {
          if (c.ServiceName && IGNORE_SERVICE_NAMES.has(c.ServiceName)) continue;
          if (c.Status !== 'critical' && c.Status !== 'warning') continue;

          if (c.Status === 'critical') critical++;
          else warning++;

          const key = `${server.id}:${c.CheckID ?? c.Name ?? ''}:${c.Status}`;
          if (seenRef.current.has(key)) continue;
          seenRef.current.add(key);

          if (!isInitial) {
            const summary =
              (c.Output ?? '').split('\n').map((l) => l.trim()).filter(Boolean)[0] ?? '';
            const title = `${server.name}: ${c.ServiceName ?? c.Name ?? c.CheckID ?? 'check'}`;
            if (c.Status === 'critical') {
              toast.error(title, { description: summary || 'critical', duration: 10_000 });
            } else {
              toast.warning(title, { description: summary || 'warning', duration: 8_000 });
            }
          }
        }
        initializedRef.current.add(server.id);
        setByServerId((prev) => {
          const cur = prev[server.id];
          if (cur && cur.critical === critical && cur.warning === warning) return prev;
          return { ...prev, [server.id]: { critical, warning } };
        });
      }),
    );
  }, [isDemo, servers]);

  useEffect(() => {
    poll();
    const id = setInterval(poll, POLL_MS);
    return () => clearInterval(id);
  }, [poll]);

  // When the server list changes (e.g. group switch), drop entries we no
  // longer have so stale badges don't linger.
  useEffect(() => {
    setByServerId((prev) => {
      const valid = new Set(servers.map((s) => s.id));
      const next: Record<string, AlertCounts> = {};
      for (const k of Object.keys(prev)) {
        if (valid.has(k)) next[k] = prev[k];
      }
      return Object.keys(next).length === Object.keys(prev).length ? prev : next;
    });
  }, [servers]);

  return { byServerId };
}
