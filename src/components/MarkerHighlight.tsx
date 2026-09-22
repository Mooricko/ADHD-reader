import React from 'react';
import { motion } from 'motion/react';

export interface MarkerHighlightProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** The text snippet or word to highlight */
  highlight?: React.ReactNode;
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
}

/**
 * MarkerHighlight - UI Component with vertical opacity gradient fill (100% -> 0% on Y-axis).
 * Designed for zero layout shift in continuous text flow.
 */
export const MarkerHighlight = React.forwardRef<HTMLSpanElement, MarkerHighlightProps>(
  (
    {
      highlight,
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
      ...rest
    },
    ref
  ) => {
    // Convert Hex color to RGBA helper
    const hexToRgba = (hex: string, alpha: number) => {
      let c = hex.replace('#', '');
      if (c.length === 3) {
        c = c.split('').map((char) => char + char).join('');
      }
      const num = parseInt(c, 16);
      return `rgba(${(num >> 16) & 255}, ${(num >> 8) & 255}, ${num & 255}, ${alpha})`;
    };

    const topColor = hexToRgba(markerColor, 1);
    const bottomColor = hexToRgba(markerColor, 0);
    const glowRgba = hexToRgba(markerColor, 0.35);
    const borderRgba = hexToRgba(markerColor, 0.5);

    const isHighlighted = isActive || isHovered;
    const content = children !== undefined ? children : highlight;

    return (
      <span
        ref={ref}
        onClick={onClick}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        title={title}
        dir={isRtl ? 'rtl' : 'ltr'}
        className={`relative inline-block align-baseline px-1.5 py-0.5 mx-[1px] cursor-pointer select-text rounded-lg transition-colors duration-150 ${className}`}
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
              scale: isHovered ? 1.04 : 1,
              opacity: 1,
            }}
            transition={{
              type: 'spring',
              stiffness: 400,
              damping: 30,
            }}
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
              transform: 'translateZ(0)',
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
          className={`relative z-10 font-medium transition-colors duration-150 ${
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

MarkerHighlight.displayName = 'MarkerHighlight';
