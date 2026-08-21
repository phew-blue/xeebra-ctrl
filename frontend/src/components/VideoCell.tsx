import { useState, useEffect, useRef, useCallback } from 'react';
import type { XeebraSDIChannelPictureResponse } from '@/types';
import { loadJSON, storeJSON } from '@/utils/storage';

interface Props {
  ip: string;
  sdiBoard: number;
  sdiPort: number;
  className?: string;
}

// localStorage cache shape per (ip, board, port).
type CachedFrame = { img: string; t: number };

// Bumped if the cached shape changes; stale entries auto-invalidate
// rather than render as garbage.
const CACHE_VERSION = '1';
// Failures (consecutive) before we surface staleness in the UI. Three
// 1-second polls ≈ 3 s — covers a transient haproxy 502 / device blip
// without flickering empty cells.
const STALE_AFTER_FAILS = 3;
// Treat localStorage entries older than this as suggestive only — the
// thumbnail still shows on first paint so the grid isn't empty, but
// it's tagged "stale" until a fresh fetch lands. Avoids the "frame
// from yesterday looks live" trap on first load after a long break.
const FRESH_WINDOW_MS = 60_000;

const cacheKey = (ip: string, b: number, p: number) => `thumb:${ip}:${b}:${p}`;

export default function VideoCell({ ip, sdiBoard, sdiPort, className = '' }: Props) {
  // Hydrate imgSrc on first render directly from localStorage so
  // reopening the Monitoring tab paints last-known frames immediately
  // — no flash of empty cells while the first poll round trips.
  const [imgSrc, setImgSrc] = useState<string | undefined>(() => {
    const cached = loadJSON<CachedFrame>(cacheKey(ip, sdiBoard, sdiPort), CACHE_VERSION);
    return cached?.img;
  });
  const [lastFreshAt, setLastFreshAt] = useState<number | undefined>(() => {
    const cached = loadJSON<CachedFrame>(cacheKey(ip, sdiBoard, sdiPort), CACHE_VERSION);
    return cached?.t;
  });
  // Consecutive failed fetches. We don't clear imgSrc on failure — the
  // operator wants the *last good frame* on screen until a new one
  // arrives, not a blank cell flickering every blip.
  const [failCount, setFailCount] = useState(0);
  const [isElementVisible, setIsElementVisible] = useState(false);
  const [isPageVisible, setIsPageVisible] = useState(!document.hidden);
  const containerRef = useRef<HTMLDivElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isVisible = isElementVisible && isPageVisible;
  const failing = failCount >= STALE_AFTER_FAILS;
  const hasFreshFrame = !!imgSrc && lastFreshAt !== undefined && Date.now() - lastFreshAt < FRESH_WINDOW_MS;

  const fetchImage = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/proxy-image?ip=${encodeURIComponent(ip)}&sdiboard=${sdiBoard}&sdiport=${sdiPort}`
      );
      const data: XeebraSDIChannelPictureResponse = await res.json();
      if (data.img?.trim()) {
        const now = Date.now();
        setImgSrc(data.img);
        setLastFreshAt(now);
        setFailCount(0);
        // Persist so next page-load (or component remount on tab
        // switch) starts with the same frame instead of an empty cell.
        storeJSON<CachedFrame>(cacheKey(ip, sdiBoard, sdiPort), { img: data.img, t: now }, CACHE_VERSION);
      } else {
        // errormsg or empty img — bump fail counter but DON'T discard
        // the prior frame.
        setFailCount(c => c + 1);
      }
    } catch {
      setFailCount(c => c + 1);
    }
  }, [ip, sdiBoard, sdiPort]);

  const startInterval = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    fetchImage();
    intervalRef.current = setInterval(fetchImage, 1000);
  }, [fetchImage]);

  const stopInterval = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // Intersection observer — only poll while the cell is in the
  // viewport. Saves a chunk of bandwidth when half the grid is
  // scrolled off in a busy split view.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        const rect = entry.boundingClientRect;
        setIsElementVisible(
          entry.isIntersecting && rect.width > 0 && rect.height > 0
        );
      },
      { threshold: 0.1, rootMargin: '50px' }
    );
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Page visibility — pause polling when the tab is in the background.
  useEffect(() => {
    const handler = () => setIsPageVisible(!document.hidden);
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, []);

  useEffect(() => {
    if (isVisible) startInterval();
    else stopInterval();
    return stopInterval;
  }, [isVisible, startInterval, stopInterval]);

  // Render rules:
  //   - imgSrc set (live or cached) → show it; overlay a "stale" pill
  //     when consecutive failures cross the threshold or the cached
  //     frame is older than FRESH_WINDOW_MS.
  //   - no imgSrc + currently failing → "unavailable" message.
  //   - no imgSrc + not yet failing → "Loading..." (or "Inactive" when
  //     scrolled off / tab hidden).
  if (imgSrc) {
    const showStale = failing || !hasFreshFrame;
    return (
      <div ref={containerRef} className={`relative w-full h-full ${className}`}>
        <img
          src={imgSrc}
          alt={`SDI ${sdiBoard}:${sdiPort}`}
          className="w-full h-full object-contain"
        />
        {showStale && (
          <span
            className="absolute top-0.5 right-0.5 text-[9px] font-bold uppercase tracking-wider px-1 py-px rounded-xs bg-black/60 text-evs-warning leading-none"
            style={{ textShadow: '0 0 2px #000' }}
            title={lastFreshAt ? `Last frame: ${new Date(lastFreshAt).toLocaleTimeString()}` : 'cached'}
          >
            stale
          </span>
        )}
      </div>
    );
  }
  if (failing) {
    return (
      <div
        ref={containerRef}
        className={`w-full h-full flex items-center justify-center text-xs p-2 bg-evs-danger/20 text-evs-danger ${className}`}
      >
        SDI {sdiBoard}:{sdiPort} unavailable
      </div>
    );
  }
  return (
    <div
      ref={containerRef}
      className={`w-full h-full flex items-center justify-center text-xs p-2 text-evs-gray-lighter ${className}`}
    >
      {isVisible ? 'Loading...' : 'Inactive'}
    </div>
  );
}
