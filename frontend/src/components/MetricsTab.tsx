import { useCallback, useEffect, useState } from 'react';
import type {
  PlatformHealthCheck,
  PlatformSDIChannel,
  PlatformSDIFormat,
  PlatformSDIMetrics,
  PlatformSensorChip,
  PlatformSxStorage,
} from '@/types';

interface Props {
  /** API server IP — same as ConfigTab's apiServerIp / serverConfig.ip. */
  ip: string;
  isDemo: boolean;
}

const POLL_MS = 5000;

// ─── fetch helper ────────────────────────────────────────────────────────────

async function fetchPlatform<T>(ip: string, path: string): Promise<T | null> {
  try {
    const res = await fetch(`/api/platform?ip=${encodeURIComponent(ip)}&path=${encodeURIComponent(path)}`);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

// ─── display helpers ─────────────────────────────────────────────────────────

function fmtBytes(n?: number): string {
  if (n === undefined || n === null || !isFinite(n)) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  if (n < 1024 ** 4) return `${(n / 1024 ** 3).toFixed(1)} GB`;
  return `${(n / 1024 ** 4).toFixed(2)} TB`;
}

function fmtBitsPerSec(bps?: number): string {
  if (!bps || !isFinite(bps) || bps <= 0) return '—';
  if (bps < 1_000_000) return `${(bps / 1_000).toFixed(0)} Kbps`;
  if (bps < 1_000_000_000) return `${(bps / 1_000_000).toFixed(1)} Mbps`;
  return `${(bps / 1_000_000_000).toFixed(2)} Gbps`;
}

function fmtDuration(secs?: number): string {
  if (!secs || !isFinite(secs) || secs <= 0) return '—';
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function fmtRate(r?: { Numerator?: number; Denominator?: number }): string {
  if (!r?.Numerator || !r?.Denominator) return '—';
  const fps = r.Numerator / r.Denominator;
  return Number.isInteger(fps) ? `${fps}` : fps.toFixed(2);
}

function fmtFormat(c?: PlatformSDIFormat): string {
  if (!c?.HorizontalResolution || !c?.VerticalResolution) return '—';
  return `${c.VerticalResolution}${c.Progressive ? 'p' : 'i'}${fmtRate(c.Rate)}`;
}

// ─── section primitive ──────────────────────────────────────────────────────

function Section({
  title,
  trailing,
  children,
}: {
  title: string;
  trailing?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-evs-gray-dark border border-evs-gray rounded-xs">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-evs-gray">
        <span className="text-xs font-semibold uppercase tracking-wider text-evs-gray-lighter">{title}</span>
        {trailing ? <span className="ml-auto">{trailing}</span> : null}
      </div>
      <div className="p-3">{children}</div>
    </div>
  );
}

// ─── sub-sections ────────────────────────────────────────────────────────────

function HealthSection({ checks }: { checks: PlatformHealthCheck[] | null }) {
  if (!checks) {
    return (
      <Section title="Service health">
        <p className="text-xs text-evs-gray-lighter">Loading…</p>
      </Section>
    );
  }
  if (checks.length === 0) {
    return (
      <Section title="Service health">
        <p className="text-xs text-evs-gray-lighter">No health entries returned.</p>
      </Section>
    );
  }
  const counts = { passing: 0, warning: 0, critical: 0, other: 0 };
  for (const c of checks) {
    const s = c.Status ?? '';
    if (s === 'passing') counts.passing++;
    else if (s === 'warning') counts.warning++;
    else if (s === 'critical') counts.critical++;
    else counts.other++;
  }
  const order: Record<string, number> = { critical: 0, warning: 1, '': 2, passing: 3 };
  const sorted = [...checks].sort((a, b) => (order[a.Status ?? ''] ?? 4) - (order[b.Status ?? ''] ?? 4));
  return (
    <Section
      title={`Service health (${checks.length})`}
      trailing={
        <span className="text-[11px] font-mono">
          <span className="text-evs-success">{counts.passing}✓</span>{' '}
          <span className="text-evs-warning">{counts.warning}!</span>{' '}
          <span className="text-evs-danger">{counts.critical}✗</span>
        </span>
      }
    >
      <table className="w-full text-xs">
        <thead className="text-evs-gray-lighter">
          <tr className="border-b border-evs-gray">
            <th className="text-left py-1 font-medium w-20">Status</th>
            <th className="text-left py-1 font-medium">Service</th>
            <th className="text-left py-1 font-medium">Output</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((c, i) => {
            const colour =
              c.Status === 'passing' ? 'text-evs-success' :
              c.Status === 'critical' ? 'text-evs-danger' :
              c.Status === 'warning' ? 'text-evs-warning' :
              'text-evs-gray-lighter';
            const summary = (c.Output ?? '').split('\n').map(l => l.trim()).filter(Boolean)[0] ?? '';
            return (
              <tr key={i} className="border-b border-evs-gray/40">
                <td className={`py-1 font-mono uppercase ${colour}`}>{c.Status ?? '—'}</td>
                <td className="py-1 font-mono">{c.ServiceName ?? c.Name ?? c.CheckID ?? '—'}</td>
                <td className="py-1 text-evs-gray-lighter truncate max-w-md" title={c.Output ?? ''}>{summary}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Section>
  );
}

function SDISection({ sdi }: { sdi: PlatformSDIMetrics | null }) {
  if (!sdi) return <Section title="SDI signals"><p className="text-xs text-evs-gray-lighter">Loading…</p></Section>;
  const rows: Array<{ board: number; ch: PlatformSDIChannel }> = [];
  (sdi.Boards ?? []).forEach((b, bi) => (b.Channels ?? []).forEach(ch => rows.push({ board: bi, ch })));
  if (rows.length === 0) {
    return <Section title="SDI signals"><p className="text-xs text-evs-gray-lighter">No channels reported.</p></Section>;
  }
  return (
    <Section title={`SDI signals (${rows.length})`}>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-evs-gray-lighter">
            <tr className="border-b border-evs-gray">
              <th className="text-left py-1 font-medium">B/P</th>
              <th className="text-left py-1 font-medium">Type</th>
              <th className="text-left py-1 font-medium">Run</th>
              <th className="text-left py-1 font-medium">Configured</th>
              <th className="text-left py-1 font-medium">Signal</th>
              <th className="text-left py-1 font-medium">3G</th>
              <th className="text-left py-1 font-medium">Sync</th>
              <th className="text-left py-1 font-medium">LTC</th>
              <th className="text-left py-1 font-medium">Timecode</th>
              <th className="text-left py-1 font-medium">Error</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ board, ch }, i) => {
              const sigFormat = fmtFormat(ch.Signal);
              const cfgFormat = fmtFormat(ch.Configuration);
              const matches = sigFormat === cfgFormat;
              const sync = ch.SyncWithRef ?? '—';
              const syncColour =
                sync === 'Locked' ? 'text-evs-success' :
                sync === 'Spurious' ? 'text-evs-warning' :
                sync === '—' ? '' : 'text-evs-danger';
              const err = ch.Error ?? '—';
              const errColour = err === 'NoError' ? 'text-evs-gray-lighter' : 'text-evs-danger';
              const tc = ch.Timecodes?.['Auto-Generated']?.Timecode ?? '—';
              const ltcOk = ch.Signal?.LtcValid;
              return (
                <tr key={i} className="border-b border-evs-gray/40">
                  <td className="py-1 font-mono">{board}/{ch.Index}</td>
                  <td className="py-1">{ch.Type ?? '—'}</td>
                  <td className={`py-1 ${ch.Running ? 'text-evs-success' : 'text-evs-gray-lighter'}`}>{ch.Running ? '●' : '○'}</td>
                  <td className="py-1 font-mono">{cfgFormat}</td>
                  <td className={`py-1 font-mono ${matches ? '' : 'text-evs-warning'}`}>{sigFormat}</td>
                  <td className="py-1 font-mono text-evs-gray-lighter">{(ch.Signal?.['3GInterface'] ?? '').replace(/^Level_/, 'L')}</td>
                  <td className={`py-1 font-mono ${syncColour}`}>{sync}</td>
                  <td className={`py-1 font-mono ${ltcOk ? 'text-evs-success' : 'text-evs-gray-lighter'}`}>{ltcOk ? (ch.Signal?.LtcValue || 'OK') : '—'}</td>
                  <td className="py-1 font-mono text-evs-gray-lighter">{tc}</td>
                  <td className={`py-1 ${errColour}`}>{err === 'NoError' ? '—' : err}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

function StorageSection({ sx }: { sx: PlatformSxStorage | null }) {
  if (!sx) return <Section title="Recording storage"><p className="text-xs text-evs-gray-lighter">Loading…</p></Section>;
  const partitions = sx.partitionsInfos ?? [];
  return (
    <Section title="Recording storage (SxStorage)">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
        <Field label="Total" value={sx['total size'] ?? '—'} />
        <Field label="Block size" value={sx['block size'] ?? '—'} />
        <Field label="Partitions" value={String(sx['partition count'] ?? '—')} />
        <Field label="Dynamic tracks" value={String(sx['dynamic track count'] ?? '—')} />
      </div>
      {partitions.length > 0 && (
        <table className="w-full text-xs">
          <thead className="text-evs-gray-lighter">
            <tr className="border-b border-evs-gray">
              <th className="text-left py-1 font-medium">Partition</th>
              <th className="text-right py-1 font-medium">Used</th>
              <th className="text-right py-1 font-medium">Available</th>
              <th className="text-right py-1 font-medium">Total</th>
              <th className="text-right py-1 font-medium">%</th>
              <th className="text-right py-1 font-medium">Bitrate</th>
              <th className="text-right py-1 font-medium">Time left</th>
            </tr>
          </thead>
          <tbody>
            {partitions.map((p, i) => {
              const total = p.totalBytes ?? 0;
              const used = p.totalUsedBytes ?? 0;
              const avail = p.availableBytes ?? Math.max(total - used, 0);
              const pct = total > 0 ? Math.round((used / total) * 100) : null;
              const heat =
                pct === null ? '' :
                pct >= 90 ? 'text-evs-danger' :
                pct >= 75 ? 'text-evs-warning' :
                'text-evs-contrast';
              const bps = p.totalBitrate ?? 0;
              const secsLeft = bps > 0 ? Math.floor(avail / bps) : 0;
              return (
                <tr key={i} className="border-b border-evs-gray/40">
                  <td className="py-1 font-mono">#{p.id ?? i}</td>
                  <td className="py-1 text-right font-mono">{fmtBytes(used)}</td>
                  <td className="py-1 text-right font-mono">{fmtBytes(avail)}</td>
                  <td className="py-1 text-right font-mono">{fmtBytes(total)}</td>
                  <td className={`py-1 text-right font-mono ${heat}`}>{pct !== null ? `${pct}%` : '—'}</td>
                  <td className="py-1 text-right font-mono">{fmtBitsPerSec(bps)}</td>
                  <td className="py-1 text-right font-mono">{fmtDuration(secsLeft)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </Section>
  );
}

function SensorsSection({ sensors }: { sensors: PlatformSensorChip[] | null }) {
  if (!sensors) return <Section title="Hardware sensors"><p className="text-xs text-evs-gray-lighter">Loading…</p></Section>;
  if (sensors.length === 0) return <Section title="Hardware sensors"><p className="text-xs text-evs-gray-lighter">No sensors reported.</p></Section>;
  return (
    <Section title="Hardware sensors">
      {sensors.map((chip, ci) => (
        <div key={ci} className="mb-3 last:mb-0">
          <div className="text-[10px] uppercase tracking-wider text-evs-gray-lighter mb-1 font-mono">{chip.name}</div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            {(chip.elements ?? []).map((el, ei) => (
              <Field key={ei} label={el.name ?? '—'} value={el.data ?? '—'} mono />
            ))}
          </div>
        </div>
      ))}
    </Section>
  );
}

function Field({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <span className="text-[10px] uppercase tracking-wider text-evs-gray-lighter">{label}</span>
      <span className={`text-xs text-evs-contrast truncate ${mono ? 'font-mono' : ''}`}>{value ?? '—'}</span>
    </div>
  );
}

// ─── main tab ────────────────────────────────────────────────────────────────

export default function MetricsTab({ ip, isDemo }: Props) {
  const [checks, setChecks] = useState<PlatformHealthCheck[] | null>(null);
  const [sdi, setSdi] = useState<PlatformSDIMetrics | null>(null);
  const [sensors, setSensors] = useState<PlatformSensorChip[] | null>(null);
  const [sx, setSx] = useState<PlatformSxStorage | null>(null);

  const refresh = useCallback(async () => {
    if (isDemo || !ip) return;
    const [h, s, se, sxs] = await Promise.all([
      fetchPlatform<PlatformHealthCheck[]>(ip, 'health/checks'),
      fetchPlatform<PlatformSDIMetrics>(ip, 'metrics/sdi'),
      fetchPlatform<PlatformSensorChip[]>(ip, 'metrics/sensors'),
      fetchPlatform<PlatformSxStorage>(ip, 'metrics/sxstorage'),
    ]);
    if (h !== null) setChecks(h);
    if (s !== null) setSdi(s);
    if (se !== null) setSensors(se);
    if (sxs !== null) setSx(sxs);
  }, [ip, isDemo]);

  useEffect(() => {
    setChecks(null); setSdi(null); setSensors(null); setSx(null);
    refresh();
    const id = setInterval(refresh, POLL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  if (isDemo) {
    return (
      <div className="p-4">
        <div className="bg-evs-gray-dark border border-evs-gray rounded-xs p-6 text-center text-evs-gray-lighter text-sm">
          Live metrics not available in preview mode. Connect a real Xeebra to populate this tab.
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 space-y-2">
      <HealthSection checks={checks} />
      <SDISection sdi={sdi} />
      <StorageSection sx={sx} />
      <SensorsSection sensors={sensors} />
    </div>
  );
}
