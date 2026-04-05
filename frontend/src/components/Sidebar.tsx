import type { AppConfig, XeebraConfigServer } from '@/types';

interface Props {
  config: AppConfig;
  selectedGroupIdx: number | null;
  serverList: XeebraConfigServer[];
  serverListError: string | null;
  selectedServerId: string | null;
  onSelectGroup: (idx: number) => void;
  onSelectServer: (id: string) => void;
}

const STATUS_DOT: Record<string, string> = {
  RUNNING: 'bg-evs-success',
  STOPPED: 'bg-evs-gray-lighter',
  ERROR: 'bg-evs-danger',
  OFFLINE: 'bg-evs-danger',
};

export default function Sidebar({
  config,
  selectedGroupIdx,
  serverList,
  serverListError,
  selectedServerId,
  onSelectGroup,
  onSelectServer,
}: Props) {
  return (
    <div className="w-52 shrink-0 bg-evs-gray-dark border-r border-evs-gray flex flex-col overflow-y-auto">
      {/* App title */}
      <div className="px-3 py-3 border-b border-evs-gray">
        <div className="text-xs font-semibold tracking-widest text-evs-gray-lighter uppercase">
          xeebra-ctrl
        </div>
      </div>

      {/* Groups */}
      <div className="flex-1 py-2">
        {config.groups.map((group, idx) => (
          <div key={idx}>
            {/* Group header */}
            <button
              onClick={() => onSelectGroup(idx)}
              className={`w-full text-left px-3 py-2 text-sm font-medium transition-colors ${
                selectedGroupIdx === idx
                  ? 'text-evs-contrast'
                  : 'text-evs-gray-lighter hover:text-evs-contrast'
              }`}
            >
              {group.name}
            </button>

            {/* Server list for selected group */}
            {selectedGroupIdx === idx && (
              <div className="mb-1">
                {serverListError ? (
                  <div className="px-5 py-1 text-xs text-evs-danger">{serverListError}</div>
                ) : serverList.length === 0 ? (
                  <div className="px-5 py-1 text-xs text-evs-gray-lighter">Connecting...</div>
                ) : (
                  serverList.map(server => (
                    <button
                      key={server.id}
                      onClick={() => onSelectServer(server.id)}
                      className={`w-full text-left flex items-center gap-2 px-5 py-1.5 text-sm transition-colors ${
                        selectedServerId === server.id
                          ? 'bg-evs-gray text-evs-contrast'
                          : 'text-evs-gray-lighter hover:text-evs-contrast hover:bg-evs-gray/50'
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                          STATUS_DOT[server.status] ?? 'bg-evs-gray-lighter'
                        }`}
                      />
                      <span className="truncate">{server.name}</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
