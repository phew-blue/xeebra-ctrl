import type { XeebraConfigServer } from '@/types';
import type { AlertCounts } from '@/hooks/useHealthAlerts';

interface Props {
  serverList: XeebraConfigServer[];
  serverListError: string | null;
  selectedServerId: string | null;
  onSelectServer: (id: string) => void;
  /** Per-server health-check alert counts (excludes ignored noise). */
  alertCounts?: Record<string, AlertCounts>;
}

const STATUS_DOT: Record<string, string> = {
  RUNNING: 'bg-evs-success',
  STOPPED: 'bg-evs-gray-lighter',
  ERROR: 'bg-evs-danger',
  OFFLINE: 'bg-evs-danger',
  NOT_CONNECTED: 'bg-evs-gray-lighter',
};

export default function Sidebar({ serverList, serverListError, selectedServerId, onSelectServer, alertCounts }: Props) {
  return (
    <aside className="w-52 shrink-0 bg-evs-gray-dark border-r border-evs-gray flex flex-col overflow-y-auto">
      <div className="px-3 pt-3 pb-1">
        <span className="text-xs font-semibold tracking-widest text-evs-gray-lighter uppercase">
          Servers
        </span>
      </div>

      <div className="flex-1 py-1">
        {serverListError ? (
          <div className="px-4 py-2 text-xs text-evs-danger">{serverListError}</div>
        ) : serverList.length === 0 ? (
          <div className="px-4 py-2 text-xs text-evs-gray-lighter">Connecting…</div>
        ) : (
          serverList.map(server => {
            const counts = alertCounts?.[server.id];
            const critical = counts?.critical ?? 0;
            const warning = counts?.warning ?? 0;
            return (
              <button
                key={server.id}
                onClick={() => onSelectServer(server.id)}
                className={`w-full text-left flex items-center gap-2.5 px-3 py-2 transition-colors ${
                  selectedServerId === server.id ? 'bg-evs-gray' : 'hover:bg-evs-gray/40'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_DOT[server.status] ?? 'bg-evs-gray-lighter'}`}
                />
                {/* Two-line stack: IP on top (mono), hostname below. Both
                    use fixed text colours so selected vs non-selected only
                    differs in background — IP/SN keep their look in both
                    states. IP at /85 contrast so it's readable info, not
                    decorative metadata, but stays subordinate to the
                    hostname label. */}
                <div className="flex-1 min-w-0 flex flex-col leading-tight">
                  <span className="text-[11px] font-mono text-evs-contrast/85 truncate">{server.ip}</span>
                  <span className="text-sm text-evs-contrast truncate">{server.name}</span>
                </div>
                {/* Health-check alert badges. Tinted backgrounds (not
                    solid) so they sit alongside the IP/hostname without
                    fighting them visually — the two-line layout already
                    gives the badges their own dedicated column so the
                    contrast issue the solid version was solving is gone. */}
                {(critical > 0 || warning > 0) && (
                  <span className="flex items-center gap-1 shrink-0">
                    {critical > 0 && (
                      <span
                        title={`${critical} critical health check${critical === 1 ? '' : 's'}`}
                        className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-xs bg-evs-danger/20 text-evs-danger"
                      >
                        {critical}
                      </span>
                    )}
                    {warning > 0 && (
                      <span
                        title={`${warning} warning health check${warning === 1 ? '' : 's'}`}
                        className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-xs bg-evs-warning/20 text-evs-warning"
                      >
                        {warning}
                      </span>
                    )}
                  </span>
                )}
              </button>
            );
          })
        )}
      </div>
    </aside>
  );
}
