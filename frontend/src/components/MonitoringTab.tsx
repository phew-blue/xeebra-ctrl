import type { XeebraServerConfiguration } from '@/types';
import VideoCell from './VideoCell';

interface Props {
  serverConfig: XeebraServerConfiguration | null;
  loading: boolean;
  error: string | null;
  isDemo: boolean;
}

export default function MonitoringTab({ serverConfig, loading, error, isDemo }: Props) {
  if (loading && !serverConfig) {
    return <Centered>Loading…</Centered>;
  }

  if (error && !serverConfig) {
    return <Centered className="text-evs-danger">{error}</Centered>;
  }

  if (serverConfig?.status === 'NOT_CONNECTED') {
    return <NotConnected />;
  }

  if (serverConfig?.status === 'OFFLINE') {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-2 text-evs-gray-lighter">
        <OfflineIcon />
        <span>Server offline</span>
      </div>
    );
  }

  if (serverConfig?.status === 'STOPPED') {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-2 text-evs-gray-lighter">
        <StoppedIcon />
        <span>Configuration stopped — start it to enable monitoring</span>
      </div>
    );
  }

  const recorders = serverConfig?.recordersConfiguration?.recordersList ?? [];

  if (recorders.length === 0) {
    return <Centered className="text-evs-gray-lighter">No recorders configured</Centered>;
  }

  return (
    <div className="p-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
      {recorders.map((recorder, i) => {
        const bp = recorder.recorderSdiConfiguration?.boardPorts?.[0];
        const board = bp?.board ?? 0;
        const port = bp?.port ?? 0;
        return (
          <div key={i} className="bg-evs-gray-dark border border-evs-gray rounded-xs p-3 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-evs-contrast">{recorder.recorderName}</span>
              <span className="text-xs text-evs-gray-lighter">B{board}:P{port}</span>
            </div>
            {isDemo ? (
              <DemoVideoPlaceholder name={recorder.recorderName} />
            ) : (
              <VideoCell
                ip={serverConfig!.ip}
                sdiBoard={board}
                sdiPort={port}
                className="rounded-xs"
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function DemoVideoPlaceholder({ name }: { name: string }) {
  return (
    <div className="aspect-video bg-evs-gray rounded-xs flex flex-col items-center justify-center gap-1 text-evs-gray-lighter">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="7" width="20" height="15" rx="2" ry="2" />
        <polyline points="17 2 12 7 7 2" />
      </svg>
      <span className="text-xs">{name}</span>
      <span className="text-xs opacity-60">Preview mode</span>
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
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
        <line x1="4" y1="4" x2="20" y2="20" />
      </svg>
      <span>Not connected</span>
    </div>
  );
}

function OfflineIcon() {
  return (
    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
    </svg>
  );
}

function StoppedIcon() {
  return (
    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="6" y="6" width="12" height="12" rx="1" />
    </svg>
  );
}
