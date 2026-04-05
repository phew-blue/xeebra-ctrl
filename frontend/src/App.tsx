import { useState, useEffect, useCallback } from 'react';
import type { AppConfig, XeebraConfigServer, XeebraServerConfiguration } from '@/types';
import Sidebar from '@/components/Sidebar';
import MonitoringTab from '@/components/MonitoringTab';
import ConfigTab from '@/components/ConfigTab';

type Tab = 'monitoring' | 'config';

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

  // Fetch server list when group changes
  const fetchServerList = useCallback(async () => {
    if (config === null || selectedGroupIdx === null) return;
    const group = config.groups[selectedGroupIdx];
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
      <div className="flex items-center justify-center h-screen bg-evs-base text-evs-danger">
        {configError} — ensure xeebra-ctrl.config.json exists next to the executable.
      </div>
    );
  }

  if (!config) {
    return (
      <div className="flex items-center justify-center h-screen bg-evs-base text-evs-gray-lighter">
        Loading...
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-evs-base overflow-hidden">
      {/* Sidebar */}
      <Sidebar
        config={config}
        selectedGroupIdx={selectedGroupIdx}
        serverList={serverList}
        serverListError={serverListError}
        selectedServerId={selectedServerId}
        onSelectGroup={idx => { setSelectedGroupIdx(idx); setSelectedServerId(null); }}
        onSelectServer={setSelectedServerId}
      />

      {/* Main content */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Header */}
        <div className="flex items-center gap-4 px-4 h-12 bg-evs-gray-dark border-b border-evs-gray shrink-0">
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
                    className={`px-3 py-1 rounded text-sm capitalize transition-colors ${
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
              onRefresh={fetchServerConfig}
            />
          )}
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
  };
  return (
    <span className={`text-xs font-medium ${colours[status] ?? 'text-evs-gray-lighter'}`}>
      {status}
    </span>
  );
}
