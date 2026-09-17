import React, { useEffect, useState } from 'react';

export interface MarkerHighlightProps {
  before?: string;
  highlight: string;
  after?: string;
  markerColor?: string;
  baseColor?: string;
  highlightedTextColor?: string;
  backgroundColor?: string;
  fontSize?: number;
  fontWeight?: number | string;
  speed?: number;
  className?: string;
  isRtl?: boolean;
  isActive?: boolean;
}

/**
 * Authentic Marker Pen Highlight component for reading focus.
 * Simulates a hand-drawn / digital marker stroke expanding behind the highlighted word
 * with spring animation, custom marker color, and high-contrast text rendering.
 */
export const MarkerHighlight: React.FC<MarkerHighlightProps> = ({
  before = '',
  highlight,
  after = '',
  markerColor = '#facc15',
  baseColor = 'currentColor',
  highlightedTextColor = '#0f172a',
  fontSize,
  fontWeight = 600,
  className = '',
  isRtl = false,
  isActive = true,
}) => {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Trigger marker expand animation when active
    setMounted(false);
    const raf = requestAnimationFrame(() => {
      setMounted(true);
    });
    return () => cancelAnimationFrame(raf);
  }, [highlight, isActive]);

  return (
    <span
      className={`inline-block select-text will-change-transform ${className}`}
      style={{
        fontSize: fontSize ? `${fontSize}px` : undefined,
        fontWeight,
        color: baseColor,
        letterSpacing: '-0.02em',
      }}
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      {before && <span>{before}</span>}
      <span className="relative inline-block px-1 mx-[1px]">
        {/* Animated Marker Pen Stroke */}
        <span
          aria-hidden="true"
          className="absolute inset-y-[-2px] inset-x-[-4px] rounded-[4px] pointer-events-none transition-transform duration-200"
          style={{
            background: markerColor,
            transformOrigin: isRtl ? 'right center' : 'left center',
            transform: mounted && isActive ? 'scaleX(1)' : 'scaleX(0.15)',
            transitionTimingFunction: 'cubic-bezier(0.175, 0.885, 0.32, 1.275)',
            boxShadow: `0 1px 6px ${markerColor}40`,
            zIndex: 0,
          }}
        />
        {/* Contrasting Text Content */}
        <span
          className="relative z-10 transition-colors duration-150 font-bold"
          style={{
            color: isActive ? highlightedTextColor : baseColor,
          }}
        >
          {highlight}
        </span>
      </span>
      {after && <span>{after}</span>}
    </span>
  );
};
