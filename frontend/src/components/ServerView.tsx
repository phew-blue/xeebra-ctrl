import { useCallback, useEffect, useState } from 'react';
import type { Group, XeebraConfigServer, XeebraServerConfiguration } from '@/types';
import MonitoringTab from './MonitoringTab';
import ConfigTab from './ConfigTab';
import MetricsTab from './MetricsTab';

export type ServerTab = 'monitoring' | 'metrics' | 'config';

// Demo data is mirrored into ServerView so split-view + preview mode still
// renders something. Mirrors the maps in App.tsx — kept local to this
// component so each pane in split mode stays independent.
const DEMO_SERVERS: XeebraConfigServer[] = [
  { id: 'xbr-01', ip: '192.168.1.101', name: 'XBR-01', status: 'RUNNING' },
  { id: 'xbr-02', ip: '192.168.1.102', name: 'XBR-02', status: 'STOPPED' },
  { id: 'xbr-03', ip: '192.168.1.103', name: 'XBR-03', status: 'OFFLINE' },
];

const DEMO_CONFIGS: Record<string, XeebraServerConfiguration> = {
  'xbr-01': {
    ip: '192.168.1.101', status: 'RUNNING',
    characteristics: { serverName: 'Xeebra XS-1', version: '23.4.1' },
    ntpInfo: { ntpType: 'SERVER', ntpStatus: 'OK' },
    connectedClients: ['192.168.1.50'],
    commonConfiguration: { videoFormat: '1080i', sampleRate: '25', hdrProfile: 'SDR' },
    recordersConfiguration: { transport: 'SDI', audioChannelsCount: 16, recordersList: [
      { recorderName: 'REC-A', recorderSdiConfiguration: { boardPorts: [{ board: 1, port: 1 }] } },
      { recorderName: 'REC-B', recorderSdiConfiguration: { boardPorts: [{ board: 1, port: 2 }] } },
    ]},
  },
};

interface Props {
  group: Group;
  serverList: XeebraConfigServer[];
  /** Bay ids reserved by sibling panes — show a "•" marker but still allow selection. */
  reservedServerIds?: string[];
  selectedServerId: string | null;
  onSelectServer: (id: string | null) => void;
  /** Initial tab for first render — persisted state lives in caller. */
  initialTab?: ServerTab;
  onTabChange?: (tab: ServerTab) => void;
  /** Trailing controls in the sub-header (split toggle button etc.). */
  rightActions?: React.ReactNode;
  /** Hide the dropdown when there's only one valid choice / parent already chose. */
  hideServerPicker?: boolean;
  /** When the parent is in split-view: 'h' = side by side, 'v' = stacked.
   * Forwarded to MonitoringTab so the thumb grid adapts to the available
   * width / height of this pane. */
  splitMode?: 'h' | 'v' | null;
}

export default function ServerView({
  group,
  serverList,
  reservedServerIds = [],
  selectedServerId,
  onSelectServer,
  initialTab = 'monitoring',
  onTabChange,
  rightActions,
  hideServerPicker,
  splitMode,
}: Props) {
  const [activeTab, setActiveTab] = useState<ServerTab>(initialTab);
  const [serverConfig, setServerConfig] = useState<XeebraServerConfiguration | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isDemo = group.apiServerIp === '0.0.0.0';
  const apiServerIp = group.apiServerIp;

  const fetchConfig = useCallback(async () => {
    if (!selectedServerId) return;
    if (isDemo) {
      setServerConfig(DEMO_CONFIGS[selectedServerId] ?? null);
      setError(null);
      return;
    }
    setLoading(true);
    try {
      const data: XeebraServerConfiguration = await fetch(
        `/api/proxy?ip=${encodeURIComponent(apiServerIp)}&path=${encodeURIComponent(`/api/xeebra-config/servers/${selectedServerId}/configuration`)}`,
      ).then(r => r.json());
      setServerConfig(data);
      setError(null);
    } catch {
      setError('Failed to load server configuration');
    } finally {
      setLoading(false);
    }
  }, [apiServerIp, isDemo, selectedServerId]);

  useEffect(() => {
    setServerConfig(null);
    fetchConfig();
    if (!selectedServerId) return;
    const id = setInterval(fetchConfig, 10_000);
    return () => clearInterval(id);
  }, [fetchConfig, selectedServerId]);

  const updateTab = (t: ServerTab) => {
    setActiveTab(t);
    onTabChange?.(t);
  };

  // serverList may not have hydrated yet; show available servers + the
  // current selection even if it isn't in the list (e.g. between polls).
  const dropdownChoices = (() => {
    const list = serverList.length > 0 ? serverList : (isDemo ? DEMO_SERVERS : []);
    return list;
  })();
  const selectedServer = dropdownChoices.find(s => s.id === selectedServerId) ?? null;

  return (
    <div className="flex flex-col flex-1 min-w-0 min-h-0 border border-evs-gray rounded-xs overflow-hidden bg-evs-gray-darker">
      {/* Sub-header: server picker + status + tabs + actions */}
      <div className="flex items-center gap-3 px-3 h-11 bg-evs-gray-dark border-b border-evs-gray shrink-0">
        {hideServerPicker ? (
          <>
            {selectedServer ? (
              <>
                <span className="font-medium text-evs-contrast text-sm">{selectedServer.name}</span>
                <span className="text-evs-gray-lighter text-xs font-mono">{selectedServer.ip}</span>
              </>
            ) : (
              <span className="text-evs-gray-lighter text-sm">No server</span>
            )}
          </>
        ) : (
          <select
            value={selectedServerId ?? ''}
            onChange={e => onSelectServer(e.target.value || null)}
            className="bg-evs-gray-darker border border-evs-gray rounded-xs px-2 py-1 text-sm text-evs-contrast focus:outline-none focus:border-evs-primary"
          >
            <option value="">Select a server…</option>
            {dropdownChoices.map(s => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.ip}){reservedServerIds.includes(s.id) && s.id !== selectedServerId ? ' · in other pane' : ''}
              </option>
            ))}
          </select>
        )}
        {selectedServer && <StatusBadge status={selectedServer.status} />}
        {selectedServer && (
          <div className="ml-auto flex items-center gap-1">
            {(['monitoring', 'metrics', 'config'] as ServerTab[]).map(t => (
              <button
                key={t}
                onClick={() => updateTab(t)}
                className={`px-2.5 py-1 rounded-xs text-xs capitalize transition-colors ${
                  activeTab === t
                    ? 'bg-evs-primary text-white'
                    : 'text-evs-gray-lighter hover:text-evs-contrast'
                }`}
              >
                {t === 'config' ? 'Configuration' : t}
              </button>
            ))}
            {rightActions ? <span className="ml-1">{rightActions}</span> : null}
          </div>
        )}
        {!selectedServer && rightActions ? <span className="ml-auto">{rightActions}</span> : null}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {!selectedServerId ? (
          <div className="flex items-center justify-center h-full text-evs-gray-lighter text-sm">
            Select a server above
          </div>
        ) : activeTab === 'monitoring' ? (
          <MonitoringTab serverConfig={serverConfig} loading={loading} error={error} isDemo={isDemo} splitMode={splitMode ?? null} />
        ) : activeTab === 'metrics' ? (
          <MetricsTab ip={serverConfig?.ip ?? selectedServer?.ip ?? ''} isDemo={isDemo} />
        ) : (
          <ConfigTab
            server={selectedServer}
            serverConfig={serverConfig}
            loading={loading}
            error={error}
            apiServerIp={apiServerIp}
            sshUser={group.sshUser ?? 'evs'}
            sshPassword={group.sshPassword ?? 'evs123'}
            isDemo={isDemo}
            onRefresh={fetchConfig}
          />
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colours: Record<string, string> = {
    RUNNING: 'text-evs-success',
    STOPPED: 'text-evs-gray-lighter',
    ERROR: 'text-evs-danger',
    OFFLINE: 'text-evs-danger',
    NOT_CONNECTED: 'text-evs-gray-lighter',
  };
  return (
    <span className={`text-xs font-medium uppercase tracking-wide ${colours[status] ?? 'text-evs-gray-lighter'}`}>
      {status.replace('_', ' ')}
    </span>
  );
}
