import { useState, useEffect } from 'react';
import type { XeebraConfigServer, XeebraServerConfiguration } from '@/types';
import ShutdownModal from './ShutdownModal';

interface Props {
  server: XeebraConfigServer | null;
  serverConfig: XeebraServerConfiguration | null;
  loading: boolean;
  error: string | null;
  apiServerIp: string;
  sshUser: string;
  sshPassword: string;
  onRefresh: () => void;
}

export default function ConfigTab({
  server,
  serverConfig,
  loading,
  error,
  apiServerIp,
  sshUser,
  sshPassword,
  onRefresh,
}: Props) {
  const [isStartStopLoading, setIsStartStopLoading] = useState(false);
  const [shutdownOpen, setShutdownOpen] = useState(false);
  const [isModifyMode, setIsModifyMode] = useState(false);
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

  if (loading && !serverConfig) {
    return <Centered>Loading configuration...</Centered>;
  }

  if (error && !serverConfig) {
    return (
      <Centered className="flex-col gap-3">
        <span className="text-evs-danger">{error}</span>
        <button onClick={onRefresh} className="px-4 py-1.5 bg-evs-primary text-white rounded text-sm">
          Retry
        </button>
      </Centered>
    );
  }

  if (serverConfig?.status === 'NOT_CONNECTED' || server?.status === 'NOT_CONNECTED') {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-2 text-evs-gray-lighter">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
          <line x1="4" y1="4" x2="20" y2="20" />
        </svg>
        <span>Not connected</span>
      </div>
    );
  }

  if (!serverConfig) return null;

  const characteristics = serverConfig.characteristics;
  const isRunning = serverConfig.status === 'RUNNING';
  const connectedClients = serverConfig.connectedClients ?? [];
  const canModify = !isRunning && connectedClients.length === 0;
  const fieldsDisabled = !isModifyMode || !canModify;

  return (
    <div className="overflow-y-auto">
      {/* Server + Maintenance row */}
      <div className="grid grid-cols-2 gap-0">
        {/* Server info */}
        <div className="p-4">
          <h2 className="text-sm font-medium text-evs-gray-lighter uppercase mb-2">Server</h2>
          <div className="bg-evs-gray-light rounded p-3 flex gap-4">
            <div className="flex-1 space-y-0.5">
              <div className="font-medium text-evs-contrast">{serverConfig.ip}</div>
              <div className="text-sm text-evs-gray-lighter">
                {characteristics?.serverName} · v{characteristics?.version}
              </div>
              <div className={`text-sm ${isRunning ? 'text-evs-success' : 'text-evs-warning'}`}>
                Configuration {serverConfig.status.toLowerCase()}
              </div>
              {serverConfig.ntpInfo && (
                <div className="text-xs text-evs-gray-lighter">
                  NTP: {serverConfig.ntpInfo.ntpType === 'SERVER' ? 'Leader' :
                    serverConfig.ntpInfo.ntpType === 'CLIENT' ? `Follower (${serverConfig.ntpInfo.ntpStatus.toLowerCase()})` :
                    'Disabled'}
                </div>
              )}
              {connectedClients.length > 0 && (
                <div className="text-xs text-evs-gray-lighter">
                  Connected: {connectedClients.join(', ')}
                </div>
              )}
            </div>
            <div className="flex items-center">
              <button
                onClick={handleStartStop}
                disabled={isStartStopLoading}
                className="px-4 py-2 bg-evs-primary hover:bg-evs-primary/80 text-white rounded text-sm disabled:opacity-50 min-w-[60px] flex flex-col items-center gap-1"
              >
                {isStartStopLoading ? (
                  <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <div className="w-2.5 h-2.5 bg-white rounded-sm" />
                    {isRunning ? 'Stop' : 'Start'}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Maintenance */}
        <div className="p-4">
          <h2 className="text-sm font-medium text-evs-gray-lighter uppercase mb-2">Maintenance</h2>
          <div className="bg-evs-gray-light rounded p-3 flex flex-wrap gap-2">
            <a
              href={`http://${serverConfig.ip}:9081/`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 border border-evs-gray-lighter rounded text-sm hover:border-evs-primary transition-colors"
            >
              Services Management
            </a>
            <button
              onClick={() => setShutdownOpen(true)}
              className="px-3 py-1.5 border border-red-400 text-red-400 rounded text-sm hover:bg-red-400 hover:text-white transition-colors"
            >
              Shutdown Machine
            </button>
          </div>
        </div>
      </div>

      {/* Configuration */}
      <div className="p-4">
        <h2 className="text-sm font-medium text-evs-gray-lighter uppercase mb-2">Configuration</h2>
        <div className="bg-evs-gray-light rounded p-4 space-y-4">
          {/* Common config */}
          <div>
            <h3 className="text-sm font-medium mb-3">Common</h3>
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
            <h3 className="text-sm font-medium mb-3">Recorders</h3>
            <div className="grid grid-cols-3 gap-4">
              <Field label="Inputs">
                <input type="number" value={formData.numberOfInputs} disabled={fieldsDisabled}
                  onChange={e => setFormData(p => ({ ...p, numberOfInputs: e.target.value }))}
                  className="w-full bg-evs-gray-dark border border-evs-gray-lighter rounded px-3 py-1.5 text-sm disabled:opacity-50" />
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

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            {!isModifyMode ? (
              <button
                onClick={() => setIsModifyMode(true)}
                disabled={!canModify}
                className="px-5 py-1.5 bg-evs-primary hover:bg-evs-primary/80 text-white rounded text-sm disabled:opacity-40"
              >
                Modify
              </button>
            ) : (
              <>
                <button onClick={() => setIsModifyMode(false)}
                  className="px-5 py-1.5 border border-evs-gray-lighter rounded text-sm hover:border-evs-contrast">
                  Cancel
                </button>
                <button onClick={() => setIsModifyMode(false)}
                  className="px-5 py-1.5 bg-evs-success hover:bg-green-600 text-white rounded text-sm">
                  Save
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {server && (
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
    </div>
  );
}

function Centered({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`flex items-center justify-center h-64 ${className}`}>{children}</div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs text-evs-gray-lighter mb-1">{label}</label>
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
      className="w-full bg-evs-gray-dark border border-evs-gray-lighter rounded px-3 py-1.5 text-sm disabled:opacity-50"
    >
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}
