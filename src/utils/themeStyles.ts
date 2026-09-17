import { FontFamily, HighlightColor, ThemeId } from '../types';

export type ThemeConfig = {
  name: string;
  bgClass: string;
  cardBgClass: string;
  borderClass: string;
  textPrimary: string;
  textMuted: string;
  accentSurface: string;
  inputBg: string;
  sliderTrack: string;
  hexBg: string;
};

export const THEME_CONFIGS: Record<ThemeId, ThemeConfig> = {
  midnight: {
    name: 'Midnight Dark',
    bgClass: 'bg-[#0b0f17]',
    cardBgClass: 'bg-[#151c28]',
    borderClass: 'border-[#263345]',
    textPrimary: 'text-slate-100',
    textMuted: 'text-slate-400',
    accentSurface: 'bg-[#1e293b]',
    inputBg: 'bg-[#0f172a]',
    sliderTrack: 'bg-slate-700',
    hexBg: '#0b0f17',
  },
  oled: {
    name: 'OLED Black',
    bgClass: 'bg-black',
    cardBgClass: 'bg-[#111111]',
    borderClass: 'border-[#27272a]',
    textPrimary: 'text-white',
    textMuted: 'text-zinc-400',
    accentSurface: 'bg-[#18181b]',
    inputBg: 'bg-[#09090b]',
    sliderTrack: 'bg-zinc-800',
    hexBg: '#000000',
  },
  sepia: {
    name: 'Warm Sepia',
    bgClass: 'bg-[#fbf6ec]',
    cardBgClass: 'bg-[#f3ebd9]',
    borderClass: 'border-[#decbb4]',
    textPrimary: 'text-[#2b2118]',
    textMuted: 'text-[#7d6b58]',
    accentSurface: 'bg-[#ebe0cb]',
    inputBg: 'bg-[#f7efe1]',
    sliderTrack: 'bg-[#d8c5ab]',
    hexBg: '#fbf6ec',
  },
  nordic: {
    name: 'Nordic Slate',
    bgClass: 'bg-[#181f2a]',
    cardBgClass: 'bg-[#222b3a]',
    borderClass: 'border-[#354359]',
    textPrimary: 'text-slate-100',
    textMuted: 'text-slate-400',
    accentSurface: 'bg-[#2b374a]',
    inputBg: 'bg-[#1b2330]',
    sliderTrack: 'bg-slate-700',
    hexBg: '#181f2a',
  },
  light: {
    name: 'Clean Light',
    bgClass: 'bg-[#f8fafc]',
    cardBgClass: 'bg-[#ffffff]',
    borderClass: 'border-[#e2e8f0]',
    textPrimary: 'text-slate-900',
    textMuted: 'text-slate-500',
    accentSurface: 'bg-slate-100',
    inputBg: 'bg-[#f1f5f9]',
    sliderTrack: 'bg-slate-200',
    hexBg: '#f8fafc',
  },
};

export const HIGHLIGHT_COLORS: Record<HighlightColor, {
  name: string;
  textClass: string;
  bgBadge: string;
  borderClass: string;
  dotClass: string;
  hex: string;
}> = {
  red: {
    name: 'Crimson Red',
    textClass: 'text-red-500 font-bold',
    bgBadge: 'bg-red-500/15 text-red-500 border-red-500/30',
    borderClass: 'border-red-500',
    dotClass: 'bg-red-500',
    hex: '#ef4444',
  },
  amber: {
    name: 'Amber Gold',
    textClass: 'text-amber-500 font-bold',
    bgBadge: 'bg-amber-500/15 text-amber-500 border-amber-500/30',
    borderClass: 'border-amber-500',
    dotClass: 'bg-amber-500',
    hex: '#f59e0b',
  },
  emerald: {
    name: 'Emerald Green',
    textClass: 'text-emerald-500 font-bold',
    bgBadge: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30',
    borderClass: 'border-emerald-500',
    dotClass: 'bg-emerald-500',
    hex: '#10b981',
  },
  blue: {
    name: 'Electric Blue',
    textClass: 'text-blue-500 font-bold',
    bgBadge: 'bg-blue-500/15 text-blue-500 border-blue-500/30',
    borderClass: 'border-blue-500',
    dotClass: 'bg-blue-500',
    hex: '#3b82f6',
  },
  purple: {
    name: 'Neon Violet',
    textClass: 'text-purple-500 font-bold',
    bgBadge: 'bg-purple-500/15 text-purple-500 border-purple-500/30',
    borderClass: 'border-purple-500',
    dotClass: 'bg-purple-500',
    hex: '#a855f7',
  },
  cyan: {
    name: 'Vivid Cyan',
    textClass: 'text-cyan-500 font-bold',
    bgBadge: 'bg-cyan-500/15 text-cyan-500 border-cyan-500/30',
    borderClass: 'border-cyan-500',
    dotClass: 'bg-cyan-500',
    hex: '#06b6d4',
  },
};

export const FONT_CONFIGS: Record<FontFamily, {
  name: string;
  description: string;
  className: string;
}> = {
  lexend: {
    name: 'Lexend',
    description: 'Scientifically designed for reading fluency',
    className: 'font-lexend',
  },
  atkinson: {
    name: 'Atkinson Hyperlegible',
    description: 'High character distinction by Braille Institute',
    className: 'font-atkinson',
  },
  jetbrains: {
    name: 'JetBrains Mono',
    description: 'Clean fixed-pitch monospace',
    className: 'font-jetbrains',
  },
  newsreader: {
    name: 'Newsreader Serif',
    description: 'Refined editorial typography',
    className: 'font-newsreader',
  },
  jakarta: {
    name: 'Plus Jakarta Sans',
    description: 'Crisp geometric modern sans',
    className: 'font-jakarta',
  },
  vazirmatn: {
    name: 'Vazirmatn (فارسی)',
    description: 'Premier typography designed for Persian & Arabic',
    className: 'font-vazirmatn',
  },
};

/**
 * Safe Theme Getter with fallback to 'midnight'
 */
export function getTheme(themeId?: string): typeof THEME_CONFIGS['midnight'] {
  if (themeId && themeId in THEME_CONFIGS) {
    return THEME_CONFIGS[themeId as ThemeId];
  }
  return THEME_CONFIGS.midnight;
}

/**
 * Safe Highlight Color Getter with fallback to 'red'
 */
export function getHighlight(colorId?: string): typeof HIGHLIGHT_COLORS['red'] {
  if (colorId && colorId in HIGHLIGHT_COLORS) {
    return HIGHLIGHT_COLORS[colorId as HighlightColor];
  }
  return HIGHLIGHT_COLORS.red;
}

/**
 * Check if the theme is dark
 */
export function isDarkTheme(themeId: ThemeId): boolean {
  return themeId !== 'light';
}

/**
 * Toggle between Dark and Light mode
 */
export function toggleDarkLightTheme(currentTheme: ThemeId): ThemeId {
  return currentTheme === 'light' ? 'midnight' : 'light';
}

export interface HighlightGradient {
  start: string;
  end: string;
  text: string;
  glow: string;
}

/**
 * Returns a rich colored gradient configuration for the floating highlight pill/oval
 */
export function getHighlightGradient(markerColor: string): HighlightGradient {
  const normalized = (markerColor || '').toLowerCase();

  if (normalized.includes('ef4444') || normalized.includes('red') || normalized.includes('crimson')) {
    return {
      start: '#ff4d6d',
      end: '#f43f5e',
      text: '#ffffff',
      glow: 'rgba(244, 63, 94, 0.45)',
    };
  }
  if (normalized.includes('f59e0b') || normalized.includes('amber') || normalized.includes('facc15') || normalized.includes('gold')) {
    return {
      start: '#fde047',
      end: '#f59e0b',
      text: '#0f172a',
      glow: 'rgba(245, 158, 11, 0.45)',
    };
  }
  if (normalized.includes('10b981') || normalized.includes('emerald') || normalized.includes('green')) {
    return {
      start: '#34d399',
      end: '#059669',
      text: '#ffffff',
      glow: 'rgba(16, 185, 129, 0.45)',
    };
  }
  if (normalized.includes('3b82f6') || normalized.includes('blue')) {
    return {
      start: '#60a5fa',
      end: '#2563eb',
      text: '#ffffff',
      glow: 'rgba(59, 130, 246, 0.45)',
    };
  }
  if (normalized.includes('a855f7') || normalized.includes('purple') || normalized.includes('violet')) {
    return {
      start: '#c084fc',
      end: '#7c3aed',
      text: '#ffffff',
      glow: 'rgba(168, 85, 247, 0.45)',
    };
  }
  if (normalized.includes('06b6d4') || normalized.includes('cyan')) {
    return {
      start: '#22d3ee',
      end: '#0891b2',
      text: '#0f172a',
      glow: 'rgba(6, 182, 212, 0.45)',
    };
  }

  return {
    start: markerColor,
    end: `${markerColor}dd`,
    text: '#ffffff',
    glow: `${markerColor}40`,
  };
}

