import { useState, useEffect, createElement, type ReactNode } from 'react';

/**
 * useStaggeredLoading — delays rendering of sections one-by-one for a
 * perceived-performance improvement on initial page load.
 */
export function useStaggeredLoading(count: number, delayMs = 80) {
  const [visible, setVisible] = useState(0);

  useEffect(() => {
    if (visible >= count) return;
    const timer = setTimeout(() => setVisible(v => v + 1), delayMs);
    return () => clearTimeout(timer);
  }, [visible, count, delayMs]);

  return visible;
}

interface SectionSkeletonProps {
  children?: ReactNode;
  className?: string;
}

/**
 * SectionSkeleton — placeholder shown while a section is still loading /
 * waiting for its staggered slot.
 */
export function SectionSkeleton({ children, className }: SectionSkeletonProps) {
  return createElement(
    'div',
    { className: `animate-pulse rounded-lg bg-slate-700/40 ${className ?? ''}` },
    children ?? null,
  );
}
