import { useState, useEffect } from 'react';
import type { XeebraConfigServer, XeebraServerConfiguration } from '@/types';
import ShutdownModal from './ShutdownModal';
import RestartModal from './RestartModal';

interface Props {
  server: XeebraConfigServer | null;
  serverConfig: XeebraServerConfiguration | null;
  loading: boolean;
  error: string | null;
  apiServerIp: string;
  sshUser: string;
  sshPassword: string;
  isDemo: boolean;
  onRefresh: () => void;
  onConfigSaved?: (updated: Partial<XeebraServerConfiguration>) => void;
}

export default function ConfigTab({
  server,
  serverConfig,
  loading,
  error,
  apiServerIp,
  sshUser,
  sshPassword,
  isDemo,
  onRefresh,
  onConfigSaved,
}: Props) {
  const [isStartStopLoading, setIsStartStopLoading] = useState(false);
  const [shutdownOpen, setShutdownOpen] = useState(false);
  const [restartOpen, setRestartOpen] = useState(false);
  const [isModifyMode, setIsModifyMode] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState({
    videoFormat: '',
    sampleRate: '',
    hdrProfile: '',
    transport: '',
    audioChannels: '',
    numberOfInputs: '',
  });

  useEffect(() => {
    if (serverConfig?.commonConfiguration) {
      setFormData({
        videoFormat: serverConfig.commonConfiguration.videoFormat ?? '',
        sampleRate: serverConfig.commonConfiguration.sampleRate ?? '',
        hdrProfile: serverConfig.commonConfiguration.hdrProfile ?? '',
        transport: serverConfig.recordersConfiguration?.transport ?? '',
        audioChannels: String(serverConfig.recordersConfiguration?.audioChannelsCount ?? ''),
        numberOfInputs: String(serverConfig.recordersConfiguration?.recordersList?.length ?? ''),
      });
    }
  }, [serverConfig]);

  const handleStartStop = async () => {
    if (!server?.id) return;
    if (isDemo) return; // no-op in demo
    const isRunning = serverConfig?.status === 'RUNNING';
    const path = isRunning
      ? `/api/xeebra-config/servers/${server.id}/configuration/_stop`
      : `/api/xeebra-config/servers/${server.id}/configuration/_start`;

    setIsStartStopLoading(true);
    try {
      await fetch('/api/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip: apiServerIp, path }),
      });
      onRefresh();
    } finally {
      setIsStartStopLoading(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      if (isDemo) {
        // Apply locally in demo mode
        await new Promise(r => setTimeout(r, 500));
        onConfigSaved?.({
          commonConfiguration: {
            videoFormat: formData.videoFormat,
            sampleRate: formData.sampleRate,
            hdrProfile: formData.hdrProfile,
          },
          recordersConfiguration: {
            ...(serverConfig?.recordersConfiguration ?? {}),
            transport: formData.transport,
            audioChannelsCount: Number(formData.audioChannels),
          },
        });
      } else {
        await fetch('/api/proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ip: apiServerIp,
            path: `/api/xeebra-config/servers/${server?.id}/configuration`,
            body: {
              commonConfiguration: {
                videoFormat: formData.videoFormat,
                sampleRate: formData.sampleRate,
                hdrProfile: formData.hdrProfile,
              },
              recordersConfiguration: {
                transport: formData.transport,
                audioChannelsCount: Number(formData.audioChannels),
              },
            },
          }),
        });
        onRefresh();
      }
      setIsModifyMode(false);
    } finally {
      setIsSaving(false);
    }
  };

  if (loading && !serverConfig) {
    return <Centered>Loading configuration…</Centered>;
  }

  if (error && !serverConfig) {
    return (
      <Centered className="flex-col gap-3">
        <span className="text-evs-danger">{error}</span>
        <button onClick={onRefresh} className="px-4 py-1.5 bg-evs-primary text-white rounded-xs text-sm">
          Retry
        </button>
      </Centered>
    );
  }

  if (serverConfig?.status === 'NOT_CONNECTED' || server?.status === 'NOT_CONNECTED') {
    return <NotConnected />;
  }

  if (!serverConfig) return null;

  const characteristics = serverConfig.characteristics;
  const isRunning = serverConfig.status === 'RUNNING';
  const connectedClients = serverConfig.connectedClients ?? [];
  const canModify = !isRunning && connectedClients.length === 0;
  const fieldsDisabled = !isModifyMode || (!canModify && !isDemo);

  return (
    <div className="overflow-y-auto">
      {/* Server + Maintenance row */}
      <div className="grid grid-cols-2 gap-px bg-evs-gray">
        {/* Server info */}
        <div className="p-4 bg-evs-gray-darker">
          <h2 className="text-xs font-semibold tracking-widest text-evs-gray-lighter uppercase mb-3">Server</h2>
          <div className="bg-evs-gray-dark rounded-xs border border-evs-gray p-3 flex gap-4">
            <div className="flex-1 space-y-1">
              <div className="font-medium text-evs-contrast">{characteristics?.serverName}</div>
              <div className="text-sm text-evs-gray-lighter">{serverConfig.ip} · v{characteristics?.version}</div>
              <div className={`text-sm font-medium ${isRunning ? 'text-evs-success' : 'text-evs-warning'}`}>
                {serverConfig.status}
              </div>
              {serverConfig.ntpInfo && (
                <div className="text-xs text-evs-gray-lighter">
                  NTP:{' '}
                  {serverConfig.ntpInfo.ntpType === 'SERVER'
                    ? 'Leader'
                    : serverConfig.ntpInfo.ntpType === 'CLIENT'
                      ? `Follower · ${serverConfig.ntpInfo.ntpStatus}`
                      : 'Disabled'}
                </div>
              )}
              {connectedClients.length > 0 && (
                <div className="text-xs text-evs-gray-lighter">
                  Clients: {connectedClients.join(', ')}
                </div>
              )}
            </div>
            <div className="flex flex-col gap-2 items-end justify-center">
              <button
                onClick={handleStartStop}
                disabled={isStartStopLoading || isDemo}
                title={isDemo ? 'Not available in preview mode' : undefined}
                className={`px-4 py-1.5 rounded-xs text-sm font-medium transition-colors disabled:opacity-40 ${
                  isRunning
                    ? 'bg-evs-warning/20 text-evs-warning hover:bg-evs-warning/30'
                    : 'bg-evs-success/20 text-evs-success hover:bg-evs-success/30'
                }`}
              >
                {isStartStopLoading ? '…' : isRunning ? 'Stop' : 'Start'}
              </button>
            </div>
          </div>
        </div>

        {/* Maintenance */}
        <div className="p-4 bg-evs-gray-darker">
          <h2 className="text-xs font-semibold tracking-widest text-evs-gray-lighter uppercase mb-3">Maintenance</h2>
          <div className="bg-evs-gray-dark rounded-xs border border-evs-gray p-3 flex flex-wrap gap-2">
            {!isDemo && (
              <a
                href={`http://${serverConfig.ip}:9081/`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1.5 border border-evs-gray rounded-xs text-sm hover:border-evs-primary transition-colors"
              >
                Services Management
              </a>
            )}
            <button
              onClick={() => setRestartOpen(true)}
              disabled={isDemo}
              title={isDemo ? 'Not available in preview mode' : undefined}
              className="px-3 py-1.5 border border-evs-warning/60 text-evs-warning rounded-xs text-sm hover:bg-evs-warning hover:text-white transition-colors disabled:opacity-40"
            >
              Restart Machine
            </button>
            <button
              onClick={() => setShutdownOpen(true)}
              disabled={isDemo}
              title={isDemo ? 'Not available in preview mode' : undefined}
              className="px-3 py-1.5 border border-evs-danger/60 text-evs-danger rounded-xs text-sm hover:bg-evs-danger hover:text-white transition-colors disabled:opacity-40"
            >
              Shutdown Machine
            </button>
          </div>
        </div>
      </div>

      {/* Configuration */}
      <div className="p-4">
        <h2 className="text-xs font-semibold tracking-widest text-evs-gray-lighter uppercase mb-3">Configuration</h2>
        <div className="bg-evs-gray-dark rounded-xs border border-evs-gray p-4 space-y-5">
          {/* Common */}
          <div>
            <h3 className="text-sm font-medium text-evs-contrast mb-3">Common</h3>
            <div className="grid grid-cols-3 gap-4">
              <Field label="Video Format">
                <Select value={formData.videoFormat} disabled={fieldsDisabled}
                  onChange={v => setFormData(p => ({ ...p, videoFormat: v }))}
                  options={['1080i', '1080p', '720p', '4K']} />
              </Field>
              <Field label="Sample Rate">
                <Select value={formData.sampleRate} disabled={fieldsDisabled}
                  onChange={v => setFormData(p => ({ ...p, sampleRate: v }))}
                  options={['25', '50', '29.97', '59.94']} />
              </Field>
              <Field label="HDR Profile">
                <Select value={formData.hdrProfile} disabled={fieldsDisabled}
                  onChange={v => setFormData(p => ({ ...p, hdrProfile: v }))}
                  options={['SDR', 'HDR10', 'HLG']} />
              </Field>
            </div>
          </div>

          {/* Recorders */}
          <div>
            <h3 className="text-sm font-medium text-evs-contrast mb-3">Recorders</h3>
            <div className="grid grid-cols-3 gap-4">
              <Field label="Inputs">
                <input
                  type="number" value={formData.numberOfInputs} disabled={fieldsDisabled}
                  onChange={e => setFormData(p => ({ ...p, numberOfInputs: e.target.value }))}
                  className="w-full bg-evs-gray-darker border border-evs-gray rounded-xs px-3 py-1.5 text-sm text-evs-contrast disabled:opacity-50 focus:outline-none focus:border-evs-primary" />
              </Field>
              <Field label="Transport">
                <Select value={formData.transport} disabled={fieldsDisabled}
                  onChange={v => setFormData(p => ({ ...p, transport: v }))}
                  options={['SDI', 'IP', 'SRT', 'NDI']} />
              </Field>
              <Field label="Audio Channels">
                <Select value={formData.audioChannels} disabled={fieldsDisabled}
                  onChange={v => setFormData(p => ({ ...p, audioChannels: v }))}
                  options={['2', '4', '8', '16']} />
              </Field>
            </div>
          </div>

          {/* Modify hint when server is running */}
          {!isModifyMode && isRunning && !isDemo && (
            <p className="text-xs text-evs-gray-lighter">
              Stop the configuration before modifying.
            </p>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-1 border-t border-evs-gray">
            {!isModifyMode ? (
              <button
                onClick={() => setIsModifyMode(true)}
                disabled={!canModify && !isDemo}
                className="px-5 py-1.5 bg-evs-primary hover:bg-evs-primary/80 text-white rounded-xs text-sm disabled:opacity-40 transition-colors"
              >
                Modify
              </button>
            ) : (
              <>
                <button
                  onClick={() => { setIsModifyMode(false); }}
                  disabled={isSaving}
                  className="px-5 py-1.5 border border-evs-gray rounded-xs text-sm hover:border-evs-contrast transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="px-5 py-1.5 bg-evs-success hover:bg-evs-success/80 text-white rounded-xs text-sm disabled:opacity-50 transition-colors"
                >
                  {isSaving ? 'Saving…' : 'Save'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Recorders list */}
      {serverConfig.recordersConfiguration?.recordersList && serverConfig.recordersConfiguration.recordersList.length > 0 && (
        <div className="px-4 pb-4">
          <h2 className="text-xs font-semibold tracking-widest text-evs-gray-lighter uppercase mb-3">Recorder Inputs</h2>
          <div className="bg-evs-gray-dark rounded-xs border border-evs-gray overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-evs-gray text-xs text-evs-gray-lighter">
                  <th className="text-left px-4 py-2 font-medium">Name</th>
                  <th className="text-left px-4 py-2 font-medium">Board</th>
                  <th className="text-left px-4 py-2 font-medium">Port</th>
                </tr>
              </thead>
              <tbody>
                {serverConfig.recordersConfiguration.recordersList.map((r, i) => {
                  const bp = r.recorderSdiConfiguration?.boardPorts?.[0];
                  return (
                    <tr key={i} className="border-b border-evs-gray/50 last:border-0 hover:bg-evs-gray/30 transition-colors">
                      <td className="px-4 py-2 text-evs-contrast">{r.recorderName}</td>
                      <td className="px-4 py-2 text-evs-gray-lighter">{bp?.board ?? '—'}</td>
                      <td className="px-4 py-2 text-evs-gray-lighter">{bp?.port ?? '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {server && !isDemo && (
        <ShutdownModal
          isOpen={shutdownOpen}
          onClose={() => setShutdownOpen(false)}
          serverId={server.id}
          serverIp={serverConfig.ip}
          serverName={characteristics?.serverName}
          apiServerIp={apiServerIp}
          sshUser={sshUser}
          sshPassword={sshPassword}
        />
      )}
      {server && !isDemo && (
        <RestartModal
          isOpen={restartOpen}
          onClose={() => setRestartOpen(false)}
          serverId={server.id}
          serverIp={serverConfig.ip}
          serverName={characteristics?.serverName}
          apiServerIp={apiServerIp}
          sshUser={sshUser}
          sshPassword={sshPassword}
        />
      )}
    </div>
  );
}

function Centered({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`flex items-center justify-center h-64 text-evs-gray-lighter ${className}`}>{children}</div>
  );
}

function NotConnected() {
  return (
    <div className="flex flex-col items-center justify-center h-64 gap-2 text-evs-gray-lighter">
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
        <line x1="4" y1="4" x2="20" y2="20" />
      </svg>
      <span>Not connected</span>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs text-evs-gray-lighter mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function Select({ value, options, disabled, onChange }: {
  value: string; options: string[]; disabled: boolean; onChange: (v: string) => void;
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={e => onChange(e.target.value)}
      className="w-full bg-evs-gray-darker border border-evs-gray rounded-xs px-3 py-1.5 text-sm text-evs-contrast disabled:opacity-50 focus:outline-none focus:border-evs-primary"
    >
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}
