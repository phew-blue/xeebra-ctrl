import type { XeebraServerConfiguration } from '@/types';
import VideoCell from './VideoCell';

interface Props {
  serverConfig: XeebraServerConfiguration | null;
  loading: boolean;
  error: string | null;
}

export default function MonitoringTab({ serverConfig, loading, error }: Props) {
  if (loading && !serverConfig) {
    return <Centered>Loading...</Centered>;
  }

  if (error && !serverConfig) {
    return <Centered className="text-evs-danger">{error}</Centered>;
  }

  if (serverConfig?.status === 'NOT_CONNECTED') {
    return <NotConnected />;
  }

  const recorders = serverConfig?.recordersConfiguration?.recordersList ?? [];

  if (recorders.length === 0) {
    return <Centered className="text-evs-gray-lighter">No recorders configured</Centered>;
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 p-4">
      {recorders.map((recorder, i) => {
        const bp = recorder.recorderSdiConfiguration?.boardPorts?.[0];
        const board = bp?.board ?? 0;
        const port = bp?.port ?? 0;
        return (
          <div key={i} className="bg-evs-gray-dark border border-evs-gray rounded p-3 flex flex-col gap-1">
            <div className="text-sm font-medium text-evs-contrast">{recorder.recorderName}</div>
            <div className="text-xs text-evs-gray-lighter">Board {board}, Port {port}</div>
            <VideoCell
              ip={serverConfig!.ip}
              sdiBoard={board}
              sdiPort={port}
              className="rounded"
            />
          </div>
        );
      })}
    </div>
  );
}

function Centered({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`flex items-center justify-center h-64 ${className}`}>{children}</div>
  );
}

function NotConnected() {
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
