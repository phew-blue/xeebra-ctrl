import { useState, useEffect, useRef, useCallback } from 'react';
import type { XeebraSDIChannelPictureResponse } from '@/types';

interface Props {
  ip: string;
  sdiBoard: number;
  sdiPort: number;
  className?: string;
}

export default function VideoCell({ ip, sdiBoard, sdiPort, className = '' }: Props) {
  const [imgSrc, setImgSrc] = useState<string | undefined>(undefined);
  const [hasError, setHasError] = useState(false);
  const [isElementVisible, setIsElementVisible] = useState(false);
  const [isPageVisible, setIsPageVisible] = useState(!document.hidden);
  const containerRef = useRef<HTMLDivElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isVisible = isElementVisible && isPageVisible;

  const fetchImage = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/proxy-image?ip=${encodeURIComponent(ip)}&sdiboard=${sdiBoard}&sdiport=${sdiPort}`
      );
      const data: XeebraSDIChannelPictureResponse = await res.json();
      if (data.errormsg?.trim()) {
        setHasError(true);
        setImgSrc(undefined);
      } else if (data.img?.trim()) {
        setHasError(false);
        setImgSrc(data.img);
      } else {
        setHasError(true);
        setImgSrc(undefined);
      }
    } catch {
      setHasError(true);
      setImgSrc(undefined);
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

  // Intersection observer
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

  // Page visibility
  useEffect(() => {
    const handler = () => setIsPageVisible(!document.hidden);
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, []);

  // Start/stop based on visibility
  useEffect(() => {
    if (isVisible) startInterval();
    else stopInterval();
    return stopInterval;
  }, [isVisible, startInterval, stopInterval]);

  if (hasError) {
    return (
      <div ref={containerRef} className="text-xs p-2 bg-evs-danger/20 text-evs-danger rounded">
        SDI {sdiBoard}:{sdiPort} unavailable
      </div>
    );
  }

  if (!imgSrc) {
    return (
      <div ref={containerRef} className="text-xs p-2 text-evs-gray-lighter">
        {isVisible ? 'Loading...' : 'Inactive'}
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <img
        src={imgSrc}
        alt={`SDI ${sdiBoard}:${sdiPort}`}
        className={`w-full h-auto object-contain ${className}`}
      />
    </div>
  );
}
