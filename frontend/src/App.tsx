import { useState, useEffect, useCallback } from 'react';
import type { AppConfig, XeebraConfigServer, XeebraServerConfiguration } from '@/types';
import Sidebar from '@/components/Sidebar';
import MonitoringTab from '@/components/MonitoringTab';
import ConfigTab from '@/components/ConfigTab';

type Tab = 'monitoring' | 'config';

// ─── Demo data injected when apiServerIp === '0.0.0.0' ───────────────────────

const DEMO_SERVERS: XeebraConfigServer[] = [
  { id: 'xbr-01', ip: '192.168.1.101', name: 'XBR-01', status: 'RUNNING' },
  { id: 'xbr-02', ip: '192.168.1.102', name: 'XBR-02', status: 'STOPPED' },
  { id: 'xbr-03', ip: '192.168.1.103', name: 'XBR-03', status: 'OFFLINE' },
];

const DEMO_CONFIGS: Record<string, XeebraServerConfiguration> = {
  'xbr-01': {
    ip: '192.168.1.101',
    status: 'RUNNING',
    characteristics: { serverName: 'Xeebra XS-1', version: '23.4.1' },
    ntpInfo: { ntpType: 'SERVER', ntpStatus: 'OK' },
    connectedClients: ['192.168.1.50', '192.168.1.51'],
    commonConfiguration: { videoFormat: '1080i', sampleRate: '25', hdrProfile: 'SDR' },
    recordersConfiguration: {
      transport: 'SDI',
      audioChannelsCount: 16,
      recordersList: [
        { recorderName: 'REC-A', recorderSdiConfiguration: { boardPorts: [{ board: 1, port: 1 }] } },
        { recorderName: 'REC-B', recorderSdiConfiguration: { boardPorts: [{ board: 1, port: 2 }] } },
        { recorderName: 'REC-C', recorderSdiConfiguration: { boardPorts: [{ board: 1, port: 3 }] } },
        { recorderName: 'REC-D', recorderSdiConfiguration: { boardPorts: [{ board: 1, port: 4 }] } },
      ],
    },
  },
  'xbr-02': {
    ip: '192.168.1.102',
    status: 'STOPPED',
    characteristics: { serverName: 'Xeebra XS-2', version: '23.4.1' },
    ntpInfo: { ntpType: 'CLIENT', ntpStatus: 'SYNCHRONIZED' },
    connectedClients: [],
    commonConfiguration: { videoFormat: '1080p', sampleRate: '50', hdrProfile: 'HDR10' },
    recordersConfiguration: {
      transport: 'IP',
      audioChannelsCount: 8,
      recordersList: [
        { recorderName: 'REC-A', recorderSdiConfiguration: { boardPorts: [{ board: 1, port: 1 }] } },
        { recorderName: 'REC-B', recorderSdiConfiguration: { boardPorts: [{ board: 1, port: 2 }] } },
      ],
    },
  },
  'xbr-03': {
    ip: '192.168.1.103',
    status: 'OFFLINE',
    characteristics: { serverName: 'Xeebra XS-3', version: '23.3.0' },
    ntpInfo: { ntpType: 'CLIENT', ntpStatus: 'NOT_SYNCHRONIZED' },
    connectedClients: [],
    commonConfiguration: { videoFormat: '1080i', sampleRate: '25', hdrProfile: 'SDR' },
    recordersConfiguration: {
      transport: 'SDI',
      audioChannelsCount: 4,
      recordersList: [
        { recorderName: 'REC-A', recorderSdiConfiguration: { boardPorts: [{ board: 1, port: 1 }] } },
      ],
    },
  },
};

// ─────────────────────────────────────────────────────────────────────────────

export default function App() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);

  const [selectedGroupIdx, setSelectedGroupIdx] = useState<number | null>(null);
  const [serverList, setServerList] = useState<XeebraConfigServer[]>([]);
  const [serverListError, setServerListError] = useState<string | null>(null);

  const [selectedServerId, setSelectedServerId] = useState<string | null>(null);
  const [serverConfig, setServerConfig] = useState<XeebraServerConfiguration | null>(null);
  const [serverConfigLoading, setServerConfigLoading] = useState(false);
  const [serverConfigError, setServerConfigError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<Tab>('monitoring');

  // Load app config on mount
  useEffect(() => {
    fetch('/api/config')
      .then(r => r.json())
      .then((cfg: AppConfig) => {
        setConfig(cfg);
        if (cfg.groups.length > 0) setSelectedGroupIdx(0);
      })
      .catch(() => setConfigError('Failed to load config'));
  }, []);

  const isDemo = config !== null && selectedGroupIdx !== null &&
    config.groups[selectedGroupIdx]?.apiServerIp === '0.0.0.0';

  // Fetch server list when group changes
  const fetchServerList = useCallback(async () => {
    if (config === null || selectedGroupIdx === null) return;
    const group = config.groups[selectedGroupIdx];

    if (group.apiServerIp === '0.0.0.0') {
      setServerList(DEMO_SERVERS);
      setServerListError(null);
      return;
    }

    try {
      const data = await fetch(
        `/api/proxy?ip=${encodeURIComponent(group.apiServerIp)}&path=${encodeURIComponent('/api/xeebra-config/servers')}`
      ).then(r => r.json());
      setServerList(Array.isArray(data) ? data : []);
      setServerListError(null);
    } catch {
      setServerListError('Cannot reach Xeebra server');
    }
  }, [config, selectedGroupIdx]);

  useEffect(() => {
    setServerList([]);
    setSelectedServerId(null);
    fetchServerList();
    const id = setInterval(fetchServerList, 10_000);
    return () => clearInterval(id);
  }, [fetchServerList]);

  // Fetch selected server config
  const fetchServerConfig = useCallback(async () => {
    if (config === null || selectedGroupIdx === null || selectedServerId === null) return;
    const group = config.groups[selectedGroupIdx];

    if (group.apiServerIp === '0.0.0.0') {
      setServerConfig(DEMO_CONFIGS[selectedServerId] ?? null);
      setServerConfigError(null);
      return;
    }

    setServerConfigLoading(true);
    try {
      const data: XeebraServerConfiguration = await fetch(
        `/api/proxy?ip=${encodeURIComponent(group.apiServerIp)}&path=${encodeURIComponent(`/api/xeebra-config/servers/${selectedServerId}/configuration`)}`
      ).then(r => r.json());
      setServerConfig(data);
      setServerConfigError(null);
    } catch {
      setServerConfigError('Failed to load server configuration');
    } finally {
      setServerConfigLoading(false);
    }
  }, [config, selectedGroupIdx, selectedServerId]);

  useEffect(() => {
    setServerConfig(null);
    fetchServerConfig();
    const id = setInterval(fetchServerConfig, 10_000);
    return () => clearInterval(id);
  }, [fetchServerConfig]);

  const selectedGroup = config && selectedGroupIdx !== null ? config.groups[selectedGroupIdx] : null;
  const selectedServer = serverList.find(s => s.id === selectedServerId) ?? null;

  if (configError) {
    return (
      <div className="flex items-center justify-center h-screen bg-evs-gray-darker text-evs-danger">
        {configError} — ensure xeebra-ctrl.config.json exists next to the executable.
      </div>
    );
  }

  if (!config) {
    return (
      <div className="flex items-center justify-center h-screen bg-evs-gray-darker text-evs-gray-lighter">
        Loading...
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-evs-gray-darker overflow-hidden">
      {/* ── Top nav (Lexi-style) ─────────────────────────────────────────── */}
      <nav className="bg-evs-gray-dark shrink-0 h-14 flex items-center px-4 shadow border-b border-evs-gray z-50">
        <div className="flex items-center gap-2.5 min-w-0">
          <img src="/favicon.svg" alt="" className="h-5 w-5 opacity-80" />
          <span className="text-evs-contrast font-semibold tracking-wide text-sm">
            Xeebra CTRL
          </span>
        </div>
        {isDemo && (
          <span className="ml-4 text-xs bg-evs-warning/20 text-evs-warning px-2 py-0.5 rounded-xs">
            Preview mode
          </span>
        )}
        {/* Group selector (if multiple groups) */}
        {config.groups.length > 1 && (
          <div className="ml-6 flex items-center gap-1">
            {config.groups.map((g, i) => (
              <button
                key={i}
                onClick={() => { setSelectedGroupIdx(i); setSelectedServerId(null); }}
                className={`px-3 py-1.5 rounded-xs text-sm transition-colors ${
                  selectedGroupIdx === i
                    ? 'text-evs-primary'
                    : 'text-evs-contrast hover:text-evs-primary'
                }`}
              >
                {g.name}
              </button>
            ))}
          </div>
        )}
      </nav>

      {/* ── Body ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0">
        {/* Sidebar */}
        <Sidebar
          serverList={serverList}
          serverListError={serverListError}
          selectedServerId={selectedServerId}
          onSelectServer={id => { setSelectedServerId(id); setActiveTab('monitoring'); }}
        />

        {/* Main content */}
        <div className="flex flex-col flex-1 min-w-0">
          {/* Sub-header: server name + tab switcher */}
          <div className="flex items-center gap-4 px-4 h-11 bg-evs-gray-dark border-b border-evs-gray shrink-0">
            {selectedServer ? (
              <>
                <span className="font-medium text-evs-contrast">{selectedServer.name}</span>
                <span className="text-evs-gray-lighter text-sm">{selectedServer.ip}</span>
                <StatusBadge status={selectedServer.status} />
                <div className="ml-auto flex gap-1">
                  {(['monitoring', 'config'] as Tab[]).map(tab => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className={`px-3 py-1 rounded-xs text-sm capitalize transition-colors ${
                        activeTab === tab
                          ? 'bg-evs-primary text-white'
                          : 'text-evs-gray-lighter hover:text-evs-contrast'
                      }`}
                    >
                      {tab === 'config' ? 'Configuration' : 'Monitoring'}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <span className="text-evs-gray-lighter text-sm">
                {selectedGroup ? 'Select a server' : 'Select a group'}
              </span>
            )}
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto">
            {!selectedServerId ? (
              <div className="flex items-center justify-center h-full text-evs-gray-lighter">
                Select a server from the sidebar
              </div>
            ) : activeTab === 'monitoring' ? (
              <MonitoringTab
                serverConfig={serverConfig}
                loading={serverConfigLoading}
                error={serverConfigError}
                isDemo={isDemo}
              />
            ) : (
              <ConfigTab
                server={selectedServer}
                serverConfig={serverConfig}
                loading={serverConfigLoading}
                error={serverConfigError}
                apiServerIp={selectedGroup?.apiServerIp ?? ''}
                sshUser={selectedGroup?.sshUser ?? 'evs'}
                sshPassword={selectedGroup?.sshPassword ?? 'evs123'}
                isDemo={isDemo}
                onRefresh={fetchServerConfig}
                onConfigSaved={(updated) => {
                  if (isDemo && selectedServerId) {
                    DEMO_CONFIGS[selectedServerId] = { ...DEMO_CONFIGS[selectedServerId], ...updated };
                    setServerConfig(prev => prev ? { ...prev, ...updated } : prev);
                  }
                }}
              />
            )}
          </div>
        </div>
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
