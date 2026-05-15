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
                className={`w-full text-left flex items-center gap-2.5 px-4 py-2 text-sm transition-colors ${
                  selectedServerId === server.id
                    ? 'bg-evs-gray text-evs-contrast'
                    : 'text-evs-gray-lighter hover:text-evs-contrast hover:bg-evs-gray/40'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_DOT[server.status] ?? 'bg-evs-gray-lighter'}`}
                />
                <span className="truncate">{server.name}</span>
                {/* Health-check alert badges. Critical wins in colour;
                    show both numbers when there's a mix. */}
                {(critical > 0 || warning > 0) && (
                  <span className="flex items-center gap-1 ml-1 shrink-0">
                    {critical > 0 && (
                      <span
                        title={`${critical} critical health check${critical === 1 ? '' : 's'}`}
                        className="text-[10px] font-mono font-bold px-1.5 py-px rounded-xs bg-evs-danger/20 text-evs-danger"
                      >
                        {critical}
                      </span>
                    )}
                    {warning > 0 && (
                      <span
                        title={`${warning} warning health check${warning === 1 ? '' : 's'}`}
                        className="text-[10px] font-mono font-bold px-1.5 py-px rounded-xs bg-evs-warning/20 text-evs-warning"
                      >
                        {warning}
                      </span>
                    )}
                  </span>
                )}
                <span className="ml-auto text-xs text-evs-gray-lighter truncate">{server.ip}</span>
              </button>
            );
          })
        )}
      </div>
    </aside>
  );
}
