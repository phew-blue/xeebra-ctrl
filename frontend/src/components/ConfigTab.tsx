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
  // Each maintenance action is independently spinnered so a slow one
  // doesn't lock the others.
  type MaintenanceAction = 'clearDisk' | 'clearConfiguration' | 'restartPlayouts';
  const [maintenanceBusy, setMaintenanceBusy] = useState<MaintenanceAction | null>(null);
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

  // Generic POST to /api/xeebra-config/servers/{id}/configuration/_<action>.
  // Mirrors what the source XR-Neo Xeebra Configuration page does for its
  // Maintenance row buttons. Each action is destructive in its own way
  // (clear disk wipes recorded media, clear configuration drops the
  // server config, restart playouts interrupts output) so each prompts.
  const handleMaintenance = async (
    action: MaintenanceAction,
    label: string,
    confirmMsg: string,
  ) => {
    if (!server?.id || isDemo) return;
    if (!window.confirm(confirmMsg)) return;
    setMaintenanceBusy(action);
    try {
      await fetch('/api/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ip: apiServerIp,
          path: `/api/xeebra-config/servers/${server.id}/configuration/_${action}`,
        }),
      });
      onRefresh();
    } catch (e) {
      // Surface to the operator — the source UI shows a banner; we use
      // a simple alert until we add a toast layer here.
      alert(`${label} failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setMaintenanceBusy(null);
    }
  };

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
        {/* Server info — layout mirrors the source XR-Neo Xeebra
            Configuration page: IP large on top, then "<host> - <hw>
            v<ver>", then "Configuration running/stopped" colour-coded,
            then NTP / connected applications / playout controller. Big
            square Start/Stop button on the right. */}
        <div className="p-4 bg-evs-gray-darker">
          <h2 className="text-xs font-semibold tracking-widest text-evs-gray-lighter uppercase mb-3">Server</h2>
          <div className="bg-evs-gray-dark rounded-xs border border-evs-gray p-4 flex gap-4 items-stretch">
            <div className="flex-1 space-y-1 min-w-0">
              <div className="text-base font-mono text-evs-contrast">{serverConfig.ip}</div>
              <div className="text-sm text-evs-contrast/85">
                {characteristics?.serverName}
                {characteristics?.hardwareType ? ` - ${characteristics.hardwareType}` : ''}
                {characteristics?.version ? ` v${characteristics.version}` : ''}
              </div>
              <div className={`text-sm font-medium ${isRunning ? 'text-evs-success' : 'text-evs-warning'}`}>
                {isRunning ? 'Configuration running' : `Configuration ${(serverConfig.status ?? 'stopped').toLowerCase()}`}
              </div>
              {serverConfig.ntpInfo && (
                <div className="text-xs text-evs-gray-lighter">
                  NTP {serverConfig.ntpInfo.ntpType === 'SERVER'
                    ? 'leader'
                    : serverConfig.ntpInfo.ntpType === 'CLIENT'
                      ? `follower · ${serverConfig.ntpInfo.ntpStatus}`
                      : 'disabled'}
                </div>
              )}
              <div className="text-xs text-evs-gray-lighter truncate">
                Connected applications: {connectedClients.length > 0 ? connectedClients.join(', ') : '—'}
              </div>
              <div className="text-xs text-evs-gray-lighter truncate">
                Playout controller: {serverConfig.playoutController || '—'}
              </div>
            </div>
            {/* Big square Start/Stop button — primary-blue, hollow icon
                + "Start"/"Stop" text label underneath. Same colour in
                both states; the icon + label communicate the action. */}
            <button
              onClick={handleStartStop}
              disabled={isStartStopLoading || isDemo}
              title={isDemo ? 'Not available in preview mode' : isRunning ? 'Stop configuration' : 'Start configuration'}
              className="shrink-0 self-center w-20 h-20 rounded-xs flex flex-col items-center justify-center gap-1 transition-colors disabled:opacity-40 bg-evs-primary/15 text-evs-primary hover:bg-evs-primary/25"
            >
              {isStartStopLoading ? (
                <span className="text-2xl leading-none">…</span>
              ) : isRunning ? (
                <>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="6" y="6" width="12" height="12" rx="1" />
                  </svg>
                  <span className="text-[11px] font-medium leading-none">Stop</span>
                </>
              ) : (
                <>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                  <span className="text-[11px] font-medium leading-none">Start</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Maintenance — mirrors the source XR-Neo Xeebra Configuration page:
            Clear disk, Clear configuration, Restart playouts, Services
            Management Tool. Restart/Shutdown Machine are kept here too
            because xeebra-ctrl is the only place an operator can do
            those without SSHing in. Maintenance actions can't be run
            while a Modify session is open — the source UI has the same
            restriction. */}
        <div className="p-4 bg-evs-gray-darker">
          <h2 className="text-xs font-semibold tracking-widest text-evs-gray-lighter uppercase mb-3">Maintenance</h2>
          <div className="bg-evs-gray-dark rounded-xs border border-evs-gray p-3 space-y-2">
            {/* Standard maintenance actions — same set as the source UI. */}
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => handleMaintenance(
                  'clearDisk',
                  'Clear disk',
                  'Clear disk: protected events and recorded data will be erased. Current configuration is kept but no more data will be available. Continue?',
                )}
                disabled={isDemo || isModifyMode || maintenanceBusy !== null}
                title={isModifyMode ? 'Apply configuration first, or cancel your modification' : isDemo ? 'Not available in preview mode' : undefined}
                className="px-3 py-1.5 border border-evs-gray rounded-xs text-sm hover:border-evs-primary transition-colors disabled:opacity-40"
              >
                {maintenanceBusy === 'clearDisk' ? 'Clearing disk…' : 'Clear disk'}
              </button>
              <button
                onClick={() => handleMaintenance(
                  'clearConfiguration',
                  'Clear configuration',
                  'Clear configuration: server configuration will be removed. Recordings stay intact. Continue?',
                )}
                disabled={isDemo || isModifyMode || maintenanceBusy !== null}
                title={isModifyMode ? 'Apply configuration first, or cancel your modification' : isDemo ? 'Not available in preview mode' : undefined}
                className="px-3 py-1.5 border border-evs-gray rounded-xs text-sm hover:border-evs-primary transition-colors disabled:opacity-40"
              >
                {maintenanceBusy === 'clearConfiguration' ? 'Clearing config…' : 'Clear configuration'}
              </button>
              <button
                onClick={() => handleMaintenance(
                  'restartPlayouts',
                  'Restart playouts',
                  'Restart playouts: outputs will be unavailable for a few seconds. Continue?',
                )}
                disabled={isDemo || isModifyMode || maintenanceBusy !== null}
                title={isModifyMode ? 'Apply configuration first, or cancel your modification' : isDemo ? 'Not available in preview mode' : undefined}
                className="px-3 py-1.5 border border-evs-gray rounded-xs text-sm hover:border-evs-primary transition-colors disabled:opacity-40"
              >
                {maintenanceBusy === 'restartPlayouts' ? 'Restarting playouts…' : 'Restart playouts'}
              </button>
              {!isDemo && (
                <a
                  href={`http://${serverConfig.ip}/xrneo-maintenance`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 border border-evs-gray rounded-xs text-sm hover:border-evs-primary transition-colors"
                >
                  Services Management Tool
                </a>
              )}
            </div>
            {/* Host-level actions — separated onto their own row so the
                colour-coded destructive buttons don't visually crowd the
                in-app maintenance row above. */}
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setRestartOpen(true)}
                disabled={isDemo}
                title={isDemo ? 'Not available in preview mode' : undefined}
                className="px-3 py-1.5 border border-evs-warning/60 text-evs-warning rounded-xs text-sm hover:bg-evs-warning hover:text-white transition-colors disabled:opacity-40"
              >
                Restart
              </button>
              <button
                onClick={() => setShutdownOpen(true)}
                disabled={isDemo}
                title={isDemo ? 'Not available in preview mode' : undefined}
                className="px-3 py-1.5 border border-evs-danger/60 text-evs-danger rounded-xs text-sm hover:bg-evs-danger hover:text-white transition-colors disabled:opacity-40"
              >
                Shutdown
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Configuration — section layout mirrors the source XR-Neo Xeebra
          Configuration page: Common configuration / Recorders configuration
          (with per-recorder table) / Playouts configuration. Modify button
          sits at the bottom and gates editing of every field above. */}
      <div className="p-4">
        <h2 className="text-xs font-semibold tracking-widest text-evs-gray-lighter uppercase mb-3">Configuration</h2>
        <div className="bg-evs-gray-dark rounded-xs border border-evs-gray p-4 space-y-6">
          {/* Common configuration */}
          <div>
            <h3 className="text-sm font-medium text-evs-contrast mb-3">Common configuration</h3>
            <div className="grid grid-cols-3 gap-4">
              <Field label="Video format *">
                <Select value={formData.videoFormat} disabled={fieldsDisabled}
                  onChange={v => setFormData(p => ({ ...p, videoFormat: v }))}
                  options={['1080i', '1080p', '720p', '4K']} />
              </Field>
              <Field label="Sample rate *">
                <Select value={formData.sampleRate} disabled={fieldsDisabled}
                  onChange={v => setFormData(p => ({ ...p, sampleRate: v }))}
                  options={['25', '50', '29.97', '59.94']} />
              </Field>
              <Field label="HDR profile *">
                <Select value={formData.hdrProfile} disabled={fieldsDisabled}
                  onChange={v => setFormData(p => ({ ...p, hdrProfile: v }))}
                  options={['SDR', 'HDR10', 'HLG']} />
              </Field>
            </div>
          </div>

          {/* Recorders configuration — header row + per-recorder list. */}
          <div>
            <h3 className="text-sm font-medium text-evs-contrast mb-3">Recorders configuration</h3>
            <div className="grid grid-cols-3 gap-4 mb-4">
              <Field label="Number of inputs *">
                <NumberStepper
                  value={Number(formData.numberOfInputs) || 0}
                  disabled={fieldsDisabled}
                  onChange={n => setFormData(p => ({ ...p, numberOfInputs: String(n) }))}
                />
              </Field>
              <Field label="Transport *">
                <Select value={formData.transport} disabled={fieldsDisabled}
                  onChange={v => setFormData(p => ({ ...p, transport: v }))}
                  options={['SDI', 'IP', 'SRT', 'NDI']} />
              </Field>
              <Field label="Audio channels *">
                <Select value={formData.audioChannels} disabled={fieldsDisabled}
                  onChange={v => setFormData(p => ({ ...p, audioChannels: v }))}
                  options={['2', '4', '8', '16']} />
              </Field>
            </div>
            {/* Per-recorder list with name / SLSM / SDI port — same shape
                as the source UI's recorders table. Rendered read-only
                here; row editing comes in a later pass. */}
            {serverConfig.recordersConfiguration?.recordersList && serverConfig.recordersConfiguration.recordersList.length > 0 && (
              <div className="border border-evs-gray rounded-xs overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-evs-gray-lighter border-b border-evs-gray bg-evs-gray-darker">
                      <th className="text-left px-3 py-2 font-medium">SDI Recorder name *</th>
                      <th className="text-left px-3 py-2 font-medium w-24">SLSM *</th>
                      <th className="text-left px-3 py-2 font-medium w-32">SDI port *</th>
                      <th className="w-10" />
                    </tr>
                  </thead>
                  <tbody>
                    {serverConfig.recordersConfiguration.recordersList.map((r, i) => {
                      const bp = r.recorderSdiConfiguration?.boardPorts?.[0];
                      const portLabel = bp ? `SDI port I${(bp.port ?? 0) + 1}` : '—';
                      return (
                        <tr key={i} className="border-b border-evs-gray/50 last:border-0">
                          <td className="px-3 py-2 text-evs-contrast">{r.recorderName}</td>
                          <td className="px-3 py-2 text-evs-gray-lighter">{r.slsmType ?? 'NO'}</td>
                          <td className="px-3 py-2 text-evs-gray-lighter">{portLabel}</td>
                          {/* Per-row edit pencil — visual parity with the
                              source UI's recorder list. Disabled until
                              Modify is active; row-edit modal will hook
                              in here later. */}
                          <td className="px-2 py-2">
                            <button
                              type="button"
                              disabled={fieldsDisabled}
                              title={fieldsDisabled ? 'Click Modify to edit recorder rows' : `Edit ${r.recorderName}`}
                              className="w-7 h-7 flex items-center justify-center rounded-xs border border-evs-gray text-evs-gray-lighter hover:text-evs-contrast hover:border-evs-primary transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                              </svg>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Playouts configuration — separate section in the source UI.
              On an SDI-only deployment (most current Xeebras) this is
              empty / zero outputs, but keep the section visible so the
              field shape matches the source. */}
          <div>
            <h3 className="text-sm font-medium text-evs-contrast mb-3">Playouts configuration</h3>
            <div className="grid grid-cols-3 gap-4">
              <Field label="Number of outputs *">
                <NumberStepper
                  value={serverConfig.playoutsConfiguration?.playoutsList?.length ?? 0}
                  disabled
                  onChange={() => {}}
                />
              </Field>
              <Field label="Transport *">
                <Select
                  value={serverConfig.playoutsConfiguration?.transport ?? 'SDI'}
                  disabled
                  onChange={() => {}}
                  options={['SDI', 'IP', 'SRT', 'NDI']}
                />
              </Field>
            </div>
          </div>

          {/* Modify hint when server is running */}
          {!isModifyMode && isRunning && !isDemo && (
            <p className="text-xs text-evs-gray-lighter">
              Stop the configuration before modifying.
            </p>
          )}

          {/* Actions — bottom-left aligned to match the source UI's
              Modify / Cancel / Save row position. */}
          <div className="flex justify-start gap-3 pt-1 border-t border-evs-gray">
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

// NumberStepper: −/+ buttons either side of a centred read-only display.
// Mirrors the source UI's "Number of inputs / outputs" control. Clamps at
// 0 — the source caps at the licence-allowed maximum but we don't have
// that figure here so leave the upper bound open.
function NumberStepper({ value, disabled, onChange }: {
  value: number; disabled: boolean; onChange: (n: number) => void;
}) {
  const dec = () => { if (!disabled) onChange(Math.max(0, value - 1)); };
  const inc = () => { if (!disabled) onChange(value + 1); };
  return (
    <div className="flex items-stretch border border-evs-gray rounded-xs overflow-hidden bg-evs-gray-darker">
      <button
        type="button" onClick={dec} disabled={disabled || value <= 0}
        className="px-3 text-evs-contrast hover:bg-evs-gray disabled:opacity-30 disabled:cursor-not-allowed"
      >−</button>
      <div className="flex-1 text-center px-2 py-1.5 text-sm text-evs-contrast tabular-nums">{value}</div>
      <button
        type="button" onClick={inc} disabled={disabled}
        className="px-3 text-evs-contrast hover:bg-evs-gray disabled:opacity-30 disabled:cursor-not-allowed"
      >+</button>
    </div>
  );
}
