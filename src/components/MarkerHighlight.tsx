import React from 'react';
import { motion } from 'motion/react';
import { getHighlightGradient } from '../utils/themeStyles';

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
  layoutId?: string;
}

/**
 * Gradient Oval Floating Pill Highlight component for reading focus.
 * Renders a colored gradient oval with smooth animated transitions when moving between words.
 */
export const MarkerHighlight: React.FC<MarkerHighlightProps> = ({
  before = '',
  highlight,
  after = '',
  markerColor = '#ef4444',
  baseColor = 'currentColor',
  highlightedTextColor,
  fontSize,
  fontWeight = 600,
  className = '',
  isRtl = false,
  isActive = true,
  layoutId = 'flow-marker-floating-pill',
}) => {
  const gradient = getHighlightGradient(markerColor);
  const textColor = highlightedTextColor || gradient.text;

  return (
    <span
      className={`inline-block select-text ${className}`}
      style={{
        fontSize: fontSize ? `${fontSize}px` : undefined,
        fontWeight,
        color: baseColor,
        letterSpacing: '-0.01em',
      }}
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      {before && <span>{before}</span>}
      <span className="relative inline-block px-1.5 mx-[2px]">
        {/* Floating Pill: Colored Gradient Oval with Smooth Animated Transition */}
        {isActive && (
          <motion.span
            layoutId={layoutId}
            aria-hidden="true"
            className="absolute inset-y-[-3px] inset-x-[-8px] rounded-full pointer-events-none"
            style={{
              background: `linear-gradient(135deg, ${gradient.start} 0%, ${gradient.end} 100%)`,
              boxShadow: `0 3px 12px ${gradient.glow}, 0 1px 3px rgba(0, 0, 0, 0.18)`,
              border: '1px solid rgba(255, 255, 255, 0.4)',
              zIndex: 0,
            }}
            transition={{
              type: 'spring',
              stiffness: 420,
              damping: 30,
              mass: 0.65,
            }}
          />
        )}
        {/* Contrasting Text Content */}
        <span
          className="relative z-10 font-bold transition-colors duration-150"
          style={{
            color: isActive ? textColor : baseColor,
            textShadow: isActive && textColor === '#ffffff' ? '0 1px 2px rgba(0,0,0,0.3)' : undefined,
          }}
        >
          {highlight}
        </span>
      </span>
      {after && <span>{after}</span>}
    </span>
  );
};
