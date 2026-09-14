import React, { useRef, useCallback } from 'react';
import { Minus, Plus, Gauge } from 'lucide-react';
import { ThemeConfig } from '../utils/themeStyles';

interface SpeedSliderToggleProps {
  wpm: number;
  onWpmChange: (wpm: number) => void;
  highlightHex: string;
  theme: ThemeConfig;
  minWpm?: number;
  maxWpm?: number;
}

export const SPEED_PRESETS = [180, 250, 320, 420, 550, 700];

export const SpeedSliderToggle: React.FC<SpeedSliderToggleProps> = ({
  wpm,
  onWpmChange,
  highlightHex,
  theme,
  minWpm = 100,
  maxWpm = 800,
}) => {
  const trackRef = useRef<HTMLDivElement>(null);

  // Clamp helper
  const clampWpm = useCallback(
    (val: number) => Math.min(maxWpm, Math.max(minWpm, Math.round(val))),
    [minWpm, maxWpm]
  );

  // Compute percentage along track (0% - 100%)
  const getPercentForWpm = useCallback(
    (value: number) => {
      const clamped = Math.min(maxWpm, Math.max(minWpm, value));
      return ((clamped - minWpm) / (maxWpm - minWpm)) * 100;
    },
    [minWpm, maxWpm]
  );

  const activePercent = getPercentForWpm(wpm);

  // Handle click or drag on the track
  const handleTrackPointer = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const clientX = e.clientX;
    const clickRatio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const targetWpm = minWpm + clickRatio * (maxWpm - minWpm);

    // Find if close to a preset (within 25 WPM), snap to it for delightful feel
    const nearestPreset = SPEED_PRESETS.find((p) => Math.abs(p - targetWpm) <= 25);
    if (nearestPreset !== undefined) {
      onWpmChange(nearestPreset);
    } else {
      // Step by 10 WPM
      const stepped = Math.round(targetWpm / 10) * 10;
      onWpmChange(clampWpm(stepped));
    }
  };

  const handleStep = (delta: number) => {
    onWpmChange(clampWpm(wpm + delta));
  };

  return (
    <div className="w-full flex flex-col gap-2 select-none">
      {/* Header bar: Label & Fine-tune steppers */}
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-1.5 font-medium">
          <Gauge className="w-3.5 h-3.5 text-slate-400" />
          <span className={theme.textMuted}>Speed (WPM):</span>
          <span 
            className="font-mono font-bold px-2 py-0.5 rounded-md text-xs border border-white/10"
            style={{ color: highlightHex, backgroundColor: `${highlightHex}15` }}
          >
            {wpm} WPM
          </span>
        </div>

        {/* Nudge - / + buttons for micro-adjustments */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => handleStep(-25)}
            title="Decrease speed by 25 WPM"
            aria-label="Decrease speed"
            className={`p-1 rounded-md border ${theme.borderClass} ${theme.textMuted} hover:${theme.textPrimary} hover:${theme.accentSurface} transition-colors`}
          >
            <Minus className="w-3 h-3" />
          </button>
          <button
            type="button"
            onClick={() => handleStep(25)}
            title="Increase speed by 25 WPM"
            aria-label="Increase speed"
            className={`p-1 rounded-md border ${theme.borderClass} ${theme.textMuted} hover:${theme.textPrimary} hover:${theme.accentSurface} transition-colors`}
          >
            <Plus className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Stepped Slider Toggle matching the user reference */}
      <div className="relative pt-6 pb-2 px-3">
        {/* Preset labels above the track */}
        <div className="absolute top-0 left-3 right-3 flex justify-between pointer-events-none">
          {SPEED_PRESETS.map((preset) => {
            const isClosest = Math.abs(preset - wpm) < 20;
            const presetPercent = getPercentForWpm(preset);
            return (
              <div
                key={preset}
                className="absolute -translate-x-1/2 text-[11px] font-mono font-semibold transition-colors duration-150"
                style={{
                  left: `${presetPercent}%`,
                  color: isClosest ? highlightHex : '#94a3b8',
                }}
              >
                {preset}
              </div>
            );
          })}
        </div>

        {/* Interactive Track Area */}
        <div
          ref={trackRef}
          onPointerDown={handleTrackPointer}
          className="relative h-7 flex items-center cursor-pointer touch-none group"
          role="slider"
          aria-valuenow={wpm}
          aria-valuemin={minWpm}
          aria-valuemax={maxWpm}
          aria-label="Reading Speed Controller"
        >
          {/* Subtle Background Track Line */}
          <div className="w-full h-1.5 rounded-full bg-slate-700/60 relative overflow-hidden">
            {/* Active filled track */}
            <div
              className="h-full rounded-full transition-all duration-150"
              style={{
                width: `${activePercent}%`,
                backgroundColor: highlightHex,
                opacity: 0.6,
              }}
            />
          </div>

          {/* Stepped Stops / Dots along the track */}
          {SPEED_PRESETS.map((preset) => {
            const stopPercent = getPercentForWpm(preset);
            const isPassed = wpm >= preset;
            const isCurrent = Math.abs(wpm - preset) < 20;

            return (
              <button
                key={preset}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onWpmChange(preset);
                }}
                title={`Set speed to ${preset} WPM`}
                className="absolute -translate-x-1/2 w-4 h-4 rounded-full flex items-center justify-center transition-transform hover:scale-125 focus:outline-none"
                style={{ left: `${stopPercent}%` }}
              >
                <div
                  className={`w-2 h-2 rounded-full transition-all duration-150 ${
                    isCurrent
                      ? 'w-2.5 h-2.5 shadow-xs'
                      : isPassed
                      ? 'bg-slate-400'
                      : 'bg-slate-600'
                  }`}
                  style={{
                    backgroundColor: isCurrent ? highlightHex : undefined,
                  }}
                />
              </button>
            );
          })}

          {/* Sliding Pill Thumb (Matching provided reference image) */}
          <div
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 flex items-center justify-center px-2.5 py-1 rounded-full shadow-lg pointer-events-none transition-all duration-150 ring-2 ring-white/20"
            style={{
              left: `${activePercent}%`,
              backgroundColor: highlightHex,
            }}
          >
            <span className="text-[11px] font-mono font-bold text-white leading-none whitespace-nowrap drop-shadow-xs">
              {wpm}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
