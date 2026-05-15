import { useState, useEffect, useCallback, useMemo } from 'react';
import { Columns2, Rows2, X } from 'lucide-react';
import { Toaster } from 'sonner';
import type { AppConfig, XeebraConfigServer } from '@/types';
import { loadJSON, storeJSON } from '@/utils/storage';
import { useHealthAlerts } from '@/hooks/useHealthAlerts';
import Sidebar from '@/components/Sidebar';
import SettingsTab from '@/components/SettingsTab';
import ServerView, { type ServerTab } from '@/components/ServerView';

type View = 'main' | 'settings';

// Demo servers used when the active group is configured with the
// 0.0.0.0 placeholder IP (preview mode in nginx mock).
const DEMO_SERVERS: XeebraConfigServer[] = [
  { id: 'xbr-01', ip: '192.168.1.101', name: 'XBR-01', status: 'RUNNING' },
  { id: 'xbr-02', ip: '192.168.1.102', name: 'XBR-02', status: 'STOPPED' },
  { id: 'xbr-03', ip: '192.168.1.103', name: 'XBR-03', status: 'OFFLINE' },
];

// Persisted-per-group UI state. Bumped via storage util's version arg if
// shape changes — old entries auto-invalidate.
const PERSIST_VERSION = '1';
type GroupUIState = {
  leftServerId: string | null;
  rightServerId: string | null;
  splitDir: 'h' | 'v' | null; // null = single pane
  leftTab: ServerTab;
  rightTab: ServerTab;
};
const emptyGroupState = (): GroupUIState => ({
  leftServerId: null,
  rightServerId: null,
  splitDir: null,
  leftTab: 'monitoring',
  rightTab: 'monitoring',
});
const groupStorageKey = (groupName: string) => `group:${groupName}`;

export default function App() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [view, setView] = useState<View>('main');

  const [selectedGroupIdx, setSelectedGroupIdx] = useState<number | null>(null);
  const [serverList, setServerList] = useState<XeebraConfigServer[]>([]);
  const [serverListError, setServerListError] = useState<string | null>(null);
  const [groupState, setGroupState] = useState<GroupUIState>(emptyGroupState());

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

  const selectedGroup = config && selectedGroupIdx !== null ? config.groups[selectedGroupIdx] : null;
  const isDemo = selectedGroup?.apiServerIp === '0.0.0.0';

  // Hydrate per-group UI state when group changes.
  useEffect(() => {
    if (!selectedGroup) {
      setGroupState(emptyGroupState());
      return;
    }
    const saved = loadJSON<GroupUIState>(groupStorageKey(selectedGroup.name), PERSIST_VERSION);
    setGroupState(saved ?? emptyGroupState());
  }, [selectedGroup?.name]);

  // Persist on every state change (only when we have a real group).
  useEffect(() => {
    if (!selectedGroup) return;
    storeJSON(groupStorageKey(selectedGroup.name), groupState, PERSIST_VERSION);
  }, [selectedGroup?.name, groupState]);

  // Fetch server list (real or demo) on group change + every 10s.
  const fetchServerList = useCallback(async () => {
    if (!selectedGroup) return;
    if (selectedGroup.apiServerIp === '0.0.0.0') {
      setServerList(DEMO_SERVERS);
      setServerListError(null);
      return;
    }
    try {
      const data = await fetch(
        `/api/proxy?ip=${encodeURIComponent(selectedGroup.apiServerIp)}&path=${encodeURIComponent('/api/xeebra-config/servers')}`,
      ).then(r => r.json());
      setServerList(Array.isArray(data) ? data : []);
      setServerListError(null);
    } catch {
      setServerListError('Cannot reach Xeebra server');
    }
  }, [selectedGroup]);

  useEffect(() => {
    setServerList([]);
    fetchServerList();
    const id = setInterval(fetchServerList, 10_000);
    return () => clearInterval(id);
  }, [fetchServerList]);

  // Health alerts polling — runs whenever we have a non-demo server list.
  // Drives the sidebar critical/warning badges + sonner toasts on
  // freshly-degraded entries.
  const alertServers = useMemo(
    () => serverList.map((s) => ({ id: s.id, ip: s.ip, name: s.name })),
    [serverList],
  );
  const { byServerId: alertCounts } = useHealthAlerts(alertServers, isDemo);

  // Validate persisted server ids against the live list — drop unknowns
  // so a deleted/renamed server doesn't render an empty pane forever.
  useEffect(() => {
    if (serverList.length === 0) return;
    const valid = new Set(serverList.map(s => s.id));
    setGroupState(prev => {
      let next = prev;
      if (prev.leftServerId && !valid.has(prev.leftServerId)) {
        next = { ...next, leftServerId: serverList[0]?.id ?? null };
      }
      if (prev.rightServerId && !valid.has(prev.rightServerId)) {
        next = { ...next, rightServerId: null, splitDir: null };
      }
      // Default left pane to first server on first hydration.
      if (next.leftServerId === null && serverList.length > 0) {
        next = { ...next, leftServerId: serverList[0].id };
      }
      return next === prev ? prev : next;
    });
  }, [serverList]);

  // Sidebar selection sets the LEFT pane.
  const handleSidebarSelect = useCallback((id: string) => {
    setGroupState(prev => {
      // If sidebar pick collides with right pane, move right to next free
      // server so we don't render the same one twice.
      if (prev.splitDir && prev.rightServerId === id) {
        const next = serverList.find(s => s.id !== id);
        return { ...prev, leftServerId: id, rightServerId: next?.id ?? null };
      }
      return { ...prev, leftServerId: id };
    });
    setView('main');
  }, [serverList]);

  const handleConfigChange = useCallback((updated: AppConfig) => {
    setConfig(updated);
    if (updated.groups.length > 0 && selectedGroupIdx === null) setSelectedGroupIdx(0);
    if (selectedGroupIdx !== null && selectedGroupIdx >= updated.groups.length) {
      setSelectedGroupIdx(updated.groups.length > 0 ? 0 : null);
    }
  }, [selectedGroupIdx]);

  // Split-view toggle helpers — same shape as lexi's xeebra subview, mirrored
  // here so both products behave identically.
  const canSplit = serverList.length >= 2;
  const splitActive = groupState.splitDir !== null && canSplit;

  const enableSplit = (dir: 'h' | 'v') => {
    setGroupState(prev => {
      if (prev.rightServerId && serverList.some(s => s.id === prev.rightServerId)) {
        return { ...prev, splitDir: dir };
      }
      const next = serverList.find(s => s.id !== prev.leftServerId);
      return { ...prev, splitDir: dir, rightServerId: next?.id ?? null };
    });
  };
  const disableSplit = () => setGroupState(prev => ({ ...prev, splitDir: null }));
  const flipSplit = () => setGroupState(prev => ({ ...prev, splitDir: prev.splitDir === 'h' ? 'v' : 'h' }));

  // Collision-avoidance handlers for the dropdowns.
  const handleLeftSelect = (id: string | null) => {
    setGroupState(prev => {
      if (id && id === prev.rightServerId) {
        const fallback = serverList.find(s => s.id !== id);
        return { ...prev, leftServerId: id, rightServerId: fallback?.id ?? null };
      }
      return { ...prev, leftServerId: id };
    });
  };
  const handleRightSelect = (id: string | null) => {
    setGroupState(prev => {
      if (id && id === prev.leftServerId) {
        const fallback = serverList.find(s => s.id !== id);
        return { ...prev, rightServerId: id, leftServerId: fallback?.id ?? prev.leftServerId };
      }
      return { ...prev, rightServerId: id };
    });
  };

  const splitButtons = useMemo(() => {
    if (!canSplit) return null;
    if (splitActive) {
      return (
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={flipSplit}
            title={groupState.splitDir === 'h' ? 'Switch to vertical split' : 'Switch to horizontal split'}
            className="p-1 rounded-xs text-evs-gray-lighter hover:text-evs-contrast hover:bg-evs-gray"
          >
            {groupState.splitDir === 'h' ? <Rows2 size={14} /> : <Columns2 size={14} />}
          </button>
          <button
            type="button"
            onClick={disableSplit}
            title="Close split view"
            className="p-1 rounded-xs text-evs-gray-lighter hover:text-evs-contrast hover:bg-evs-gray"
          >
            <X size={14} />
          </button>
        </div>
      );
    }
    return (
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => enableSplit('h')}
          title="Split — show two Xeebras side by side"
          className="p-1 rounded-xs text-evs-gray-lighter hover:text-evs-contrast hover:bg-evs-gray"
        >
          <Columns2 size={14} />
        </button>
        <button
          type="button"
          onClick={() => enableSplit('v')}
          title="Split — show two Xeebras stacked"
          className="p-1 rounded-xs text-evs-gray-lighter hover:text-evs-contrast hover:bg-evs-gray"
        >
          <Rows2 size={14} />
        </button>
      </div>
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canSplit, splitActive, groupState.splitDir, serverList, groupState.leftServerId]);

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
      {/* Toast layer for health-check alerts (and any future ad-hoc
          notifications). Theme-matches the app — dark background. */}
      <Toaster theme="dark" position="top-right" richColors closeButton />
      {/* ── Top nav ─────────────────────────────────────────────────────── */}
      <nav className="bg-evs-gray-dark shrink-0 h-14 flex items-center px-4 shadow border-b border-evs-gray z-50">
        <div className="flex items-center gap-2.5 min-w-0">
          <img src="/phew-blue-logo.svg" alt="" className="h-5 w-5 opacity-80" />
          <span className="text-evs-contrast font-semibold tracking-wide text-sm">Xeebra CTRL</span>
        </div>
        {isDemo && (
          <span className="ml-4 text-xs bg-evs-warning/20 text-evs-warning px-2 py-0.5 rounded-xs">
            Preview mode
          </span>
        )}
        {config.groups.length > 1 && (
          <div className="ml-6 flex items-center gap-1">
            {config.groups.map((g, i) => (
              <button
                key={i}
                onClick={() => { setSelectedGroupIdx(i); setView('main'); }}
                className={`px-3 py-1.5 rounded-xs text-sm transition-colors ${
                  selectedGroupIdx === i ? 'text-evs-primary' : 'text-evs-contrast hover:text-evs-primary'
                }`}
              >
                {g.name}
              </button>
            ))}
          </div>
        )}
        <button
          onClick={() => setView(view === 'settings' ? 'main' : 'settings')}
          title="Settings"
          className={`ml-auto p-2 rounded-xs transition-colors ${
            view === 'settings'
              ? 'text-evs-primary bg-evs-gray'
              : 'text-evs-gray-lighter hover:text-evs-contrast hover:bg-evs-gray/50'
          }`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
        </button>
      </nav>

      {/* ── Body ────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0">
        {view === 'settings' ? (
          <div className="flex-1 overflow-y-auto bg-evs-gray-darker">
            <SettingsTab config={config} onConfigChange={handleConfigChange} />
          </div>
        ) : !selectedGroup ? (
          <div className="flex-1 flex items-center justify-center text-evs-gray-lighter">
            No group selected — open Settings to add one.
          </div>
        ) : (
          <>
            <Sidebar
              serverList={serverList}
              serverListError={serverListError}
              selectedServerId={groupState.leftServerId}
              onSelectServer={handleSidebarSelect}
              alertCounts={alertCounts}
            />
            <div className={`flex-1 flex p-2 gap-2 min-h-0 ${splitActive && groupState.splitDir === 'v' ? 'flex-col' : 'flex-row'}`}>
              <ServerView
                group={selectedGroup}
                serverList={serverList}
                reservedServerIds={groupState.rightServerId ? [groupState.rightServerId] : []}
                selectedServerId={groupState.leftServerId}
                onSelectServer={handleLeftSelect}
                initialTab={groupState.leftTab}
                onTabChange={t => setGroupState(prev => ({ ...prev, leftTab: t }))}
                rightActions={splitActive ? null : splitButtons}
                hideServerPicker={!splitActive}
                splitMode={splitActive ? groupState.splitDir : null}
              />
              {splitActive && (
                <ServerView
                  group={selectedGroup}
                  serverList={serverList}
                  reservedServerIds={groupState.leftServerId ? [groupState.leftServerId] : []}
                  selectedServerId={groupState.rightServerId}
                  onSelectServer={handleRightSelect}
                  initialTab={groupState.rightTab}
                  onTabChange={t => setGroupState(prev => ({ ...prev, rightTab: t }))}
                  rightActions={splitButtons}
                  splitMode={groupState.splitDir}
                />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
