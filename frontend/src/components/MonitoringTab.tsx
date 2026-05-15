import type { XeebraServerConfiguration } from '@/types';
import VideoCell from './VideoCell';

interface Props {
  serverConfig: XeebraServerConfiguration | null;
  loading: boolean;
  error: string | null;
  isDemo: boolean;
  /** Parent split-view mode: 'h' = side by side (cap at 2 cols), 'v' or
   * null = full-width pane (4 cols, centered). */
  splitMode?: 'h' | 'v' | null;
}

export default function MonitoringTab({ serverConfig, loading, error, isDemo, splitMode }: Props) {
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

  // Grid layout:
  //   - horizontal split (side by side): 2 cols per pane — operator wants
  //     two readable thumbs per row.
  //   - everything else (single pane, vertical split): 4 cols, centered.
  // Cells are aspect-video so the 16:9 video fills the tile edge-to-edge
  // with no top/bottom letterbox bands. The `grid-auto-rows: 1fr` trick
  // we tried made cells non-aspect — 16:9 video inside object-contain
  // ended up letterboxed. The honest trade-off is that 8 thumbs at 2
  // cols × 4 rows may overflow on horizontal split — the parent pane
  // scrolls if needed.
  const gridCols = splitMode === 'h' ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-4';
  const wrapperWidth = splitMode === 'h' ? 'max-w-3xl' : 'max-w-6xl';

  return (
    <div className={`p-3 grid ${gridCols} gap-3 mx-auto w-full ${wrapperWidth}`}>
      {recorders.map((recorder, i) => {
        const bp = recorder.recorderSdiConfiguration?.boardPorts?.[0];
        const board = bp?.board ?? 0;
        const port = bp?.port ?? 0;
        // Lexi-style tile: video fills the entire cell; board/port + recorder
        // name are overlaid in tiny white text with a black shadow so they
        // stay legible over either dark or bright video. Faint Phew-Blue
        // watermark sits behind so empty/loading cells don't look broken.
        return (
          <div
            key={i}
            className="relative aspect-video overflow-hidden rounded-xs border border-evs-gray bg-evs-gray-dark"
          >
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <img src="/phew-blue-logo.svg" alt="" className="w-3/5 opacity-[0.07]" />
            </div>
            {isDemo ? (
              <DemoVideoPlaceholder name={recorder.recorderName} />
            ) : (
              <VideoCell
                ip={serverConfig!.ip}
                sdiBoard={board}
                sdiPort={port}
                className="absolute inset-0"
              />
            )}
            <span
              className="absolute top-0.5 left-0.5 text-[9px] font-bold font-mono text-white leading-none"
              style={{ textShadow: '0 0 2px #000, 1px 1px 0 #000' }}
            >
              B{board}/P{port}
            </span>
            <div className="absolute bottom-0.5 left-0 right-0">
              <span
                className="block text-center text-[9px] font-bold text-white leading-none truncate px-1"
                style={{ textShadow: '0 0 2px #000, 1px 1px 0 #000' }}
              >
                {recorder.recorderName || ' '}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DemoVideoPlaceholder({ name }: { name: string }) {
  // Outer aspect-video lives in MonitoringTab; this just fills it.
  return (
    <div className="w-full h-full flex flex-col items-center justify-center gap-1 text-evs-gray-lighter">
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
