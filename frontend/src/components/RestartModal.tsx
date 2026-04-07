import { useState } from 'react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  serverId: string;
  serverIp: string;
  serverName?: string;
  apiServerIp: string;
  sshUser: string;
  sshPassword: string;
}

type Step = 'confirm' | 'stopping' | 'ssh' | 'success' | 'error';

export default function RestartModal({
  isOpen,
  onClose,
  serverId,
  serverIp,
  serverName,
  apiServerIp,
  sshUser,
  sshPassword,
}: Props) {
  const [step, setStep] = useState<Step>('confirm');
  const [errorMsg, setErrorMsg] = useState('');
  const [processing, setProcessing] = useState(false);

  const handleConfirm = async () => {
    setProcessing(true);
    try {
      setStep('stopping');
      await new Promise(r => setTimeout(r, 1000));
      setStep('ssh');

      const res = await fetch('/api/restart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serverId,
          serverIp,
          apiServerIp,
          credentials: { username: sshUser, password: sshPassword },
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error ?? 'Restart failed');

      setStep('success');
      setTimeout(handleClose, 4000);
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'Unknown error');
      setStep('error');
    } finally {
      setProcessing(false);
    }
  };

  const handleClose = () => {
    if (processing) return;
    setStep('confirm');
    setErrorMsg('');
    onClose();
  };

  if (!isOpen) return null;

  const stepColour: Record<Step, string> = {
    confirm: 'text-evs-warning',
    stopping: 'text-evs-primary',
    ssh: 'text-evs-primary',
    success: 'text-evs-success',
    error: 'text-evs-danger',
  };

  const stepLabel: Record<Step, string> = {
    confirm: 'Ready to restart',
    stopping: 'Stopping configuration...',
    ssh: 'Connecting via SSH...',
    success: 'Restart initiated successfully',
    error: 'Restart failed',
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={e => { if (e.target === e.currentTarget) handleClose(); }}
    >
      <div className="bg-evs-gray-dark border border-evs-gray rounded shadow-xl w-full max-w-md mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-evs-gray">
          <h2 className="font-medium text-evs-contrast">Restart Server</h2>
          {!processing && (
            <button onClick={handleClose} className="text-evs-gray-lighter hover:text-evs-contrast">✕</button>
          )}
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          <div>
            <div className="text-xs text-evs-gray-lighter mb-0.5">Server</div>
            <div className="font-medium text-evs-contrast">{serverIp}</div>
            {serverName && <div className="text-sm text-evs-gray-lighter">{serverName}</div>}
          </div>

          <div className={`font-medium ${stepColour[step]}`}>{stepLabel[step]}</div>

          {(step === 'stopping' || step === 'ssh') && (
            <div className="flex justify-center py-2">
              <div className="w-5 h-5 border-2 border-evs-primary border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {step === 'confirm' && (
            <div className="p-3 bg-evs-warning/10 border border-evs-warning/30 rounded text-sm text-evs-gray-lighter">
              This will stop the server configuration if running, then reboot the physical machine.
              The server will come back online automatically.
            </div>
          )}

          {step === 'error' && errorMsg && (
            <div className="text-sm text-evs-danger">Error: {errorMsg}</div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-5 border-t border-evs-gray">
          {step === 'confirm' && (
            <>
              <button onClick={handleClose} className="px-4 py-2 text-evs-gray-lighter hover:text-evs-contrast text-sm">
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                className="px-5 py-2 bg-evs-warning hover:bg-amber-500 text-white rounded text-sm"
              >
                Restart
              </button>
            </>
          )}
          {step === 'error' && (
            <>
              <button onClick={handleClose} className="px-4 py-2 text-evs-gray-lighter hover:text-evs-contrast text-sm">Close</button>
              <button onClick={handleConfirm} className="px-5 py-2 bg-evs-warning hover:bg-amber-500 text-white rounded text-sm">Retry</button>
            </>
          )}
          {step === 'success' && (
            <button onClick={handleClose} className="px-5 py-2 bg-evs-success hover:bg-green-600 text-white rounded text-sm">Close</button>
          )}
          {(step === 'stopping' || step === 'ssh') && (
            <span className="text-sm text-evs-gray-lighter py-2">Restart in progress...</span>
          )}
        </div>
      </div>
    </div>
  );
}
