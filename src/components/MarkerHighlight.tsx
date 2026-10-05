import React, { useCallback } from 'react';
import { motion } from 'motion/react';
import { HighlightedWordParts } from '../types';

export interface MarkerHighlightProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** The text snippet or word to highlight */
  highlight?: React.ReactNode;
  /** Optional pre-parsed word parts for Bionic rendering without inline JSX allocations */
  wordParts?: HighlightedWordParts;
  /** Primary accent color in hex format (defaults to custom red #FF3B3F) */
  markerColor?: string;
  /** Active state vs. dormant/inactive state */
  isActive?: boolean;
  /** Hover state override */
  isHovered?: boolean;
  /** RTL text support */
  isRtl?: boolean;
  /** Additional CSS class names */
  className?: string;
  /** Click handler */
  onClick?: () => void;
  /** Mouse enter handler */
  onMouseEnter?: () => void;
  /** Mouse leave handler */
  onMouseLeave?: () => void;
  /** Tooltip or title text */
  title?: string;
  /** Optional layoutId override */
  layoutId?: string;
  /** Optional prefix text */
  before?: string;
  /** Optional suffix text */
  after?: string;
  /** Optional children fallback */
  children?: React.ReactNode;
  /** Optional global word index for memoized event handling */
  wordIndex?: number;
  /** Optional paragraph index for memoized event handling */
  paragraphIndex?: number;
  /** Stable callback for word click by index */
  onWordSelect?: (wordIndex: number) => void;
  /** Stable callback for word hover by index */
  onWordHover?: (wordIndex: number, paragraphIndex?: number) => void;
}

// Convert Hex color to RGBA helper (defined outside component to avoid reallocation)
function hexToRgba(hex: string, alpha: number): string {
  let c = hex.replace('#', '');
  if (c.length === 3) {
    c = c
      .split('')
      .map((char) => char + char)
      .join('');
  }
  const num = parseInt(c, 16);
  return `rgba(${(num >> 16) & 255}, ${(num >> 8) & 255}, ${num & 255}, ${alpha})`;
}

// High-speed, low-mass spring so the marker snaps tightly to the cursor without lagging
const FAST_MARKER_TRANSITION = {
  type: 'spring' as const,
  stiffness: 1800,
  damping: 42,
  mass: 0.15,
  layout: {
    type: 'spring' as const,
    stiffness: 1800,
    damping: 42,
    mass: 0.15,
  },
};

/**
 * MarkerHighlight - UI Component with vertical opacity gradient fill (100% -> 0% on Y-axis).
 * Designed for zero layout shift and ultra-responsive cursor tracking in continuous text flow.
 */
const MarkerHighlightBase = React.forwardRef<HTMLSpanElement, MarkerHighlightProps>(
  (
    {
      highlight,
      wordParts,
      children,
      markerColor = '#FF3B3F',
      isActive = true,
      isHovered = false,
      isRtl = false,
      className = '',
      onClick,
      onMouseEnter,
      onMouseLeave,
      title,
      layoutId = 'highlighter-pillow-bg',
      before,
      after,
      wordIndex,
      paragraphIndex,
      onWordSelect,
      onWordHover,
      ...rest
    },
    ref
  ) => {
    const topColor = hexToRgba(markerColor, 1);
    const bottomColor = hexToRgba(markerColor, 0);
    const glowRgba = hexToRgba(markerColor, 0.35);
    const borderRgba = hexToRgba(markerColor, 0.5);

    const isHighlighted = isActive || isHovered;

    const handleClick = useCallback(() => {
      if (onWordSelect && wordIndex !== undefined) {
        onWordSelect(wordIndex);
      }
      onClick?.();
    }, [onWordSelect, wordIndex, onClick]);

    const handleMouseEnter = useCallback(() => {
      if (onWordHover && wordIndex !== undefined) {
        onWordHover(wordIndex, paragraphIndex);
      }
      onMouseEnter?.();
    }, [onWordHover, wordIndex, paragraphIndex, onMouseEnter]);

    const handleMouseMove = useCallback(() => {
      if (!isHighlighted && onWordHover && wordIndex !== undefined) {
        onWordHover(wordIndex, paragraphIndex);
      }
    }, [isHighlighted, onWordHover, wordIndex, paragraphIndex]);

    const content =
      children !== undefined ? (
        children
      ) : wordParts ? (
        <>
          {wordParts.prefixPunct}
          {wordParts.beforeHighlight}
          <span className="font-bold text-white opacity-95">{wordParts.highlightedText}</span>
          {wordParts.afterHighlight}
          {wordParts.suffixPunct}
        </>
      ) : (
        highlight
      );

    return (
      <span
        ref={ref}
        onClick={handleClick}
        onMouseEnter={handleMouseEnter}
        onMouseMove={handleMouseMove}
        onMouseLeave={onMouseLeave}
        title={title}
        dir={isRtl ? 'rtl' : 'ltr'}
        className={`relative inline-block align-baseline px-1.5 py-0.5 cursor-pointer select-text rounded-lg transition-colors duration-75 ${className}`}
        style={{
          position: 'relative',
          lineHeight: '1.2',
        }}
        {...rest}
      >
        {before && <span className="mr-0.5">{before}</span>}

        {/* Animated Marker Background Layer with Vertical Opacity Gradient */}
        {isHighlighted && (
          <motion.span
            layoutId={layoutId}
            initial={false}
            animate={{
              scale: isHovered ? 1.03 : 1,
              opacity: 1,
            }}
            transition={FAST_MARKER_TRANSITION}
            className="absolute inset-0 rounded-lg pointer-events-none [will-change:transform]"
            style={{
              position: 'absolute',
              willChange: 'transform',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              width: '100%',
              height: '100%',
              borderRadius: '8px',
              border: `1px solid ${borderRgba}`,
              // Vertical linear gradient along the Y axis from 100% opacity to 0% opacity
              backgroundImage: `linear-gradient(180deg, ${topColor} 0%, ${bottomColor} 100%)`,
              backgroundColor: 'transparent',
              boxShadow: `0 4px 14px ${glowRgba}, inset 0 1px 1px rgba(255, 255, 255, 0.4)`,
            }}
          />
        )}

        {/* Foreground Text Layer - maintains exact font-metrics for zero layout shift */}
        <span
          className={`relative z-10 font-medium transition-colors duration-75 ${
            isHighlighted ? 'text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.5)]' : ''
          }`}
        >
          {content}
        </span>

        {after && <span className="ml-0.5">{after}</span>}
      </span>
    );
  }
);

MarkerHighlightBase.displayName = 'MarkerHighlight';

export const MarkerHighlight = React.memo(MarkerHighlightBase);

