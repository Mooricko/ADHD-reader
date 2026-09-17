import React, { useState } from 'react';
import { 
  X, 
  Play, 
  Pause, 
  RotateCcw, 
  Plus, 
  Minus, 
  BellOff, 
  Bell, 
  Timer as TimerIcon,
  CheckCircle2,
  VolumeX,
  Sparkles
} from 'lucide-react';
import { ThemeConfig } from '../utils/themeStyles';

interface FocusTimerModalProps {
  isOpen: boolean;
  onClose: () => void;
  secondsRemaining: number;
  initialDurationSeconds: number;
  isRunning: boolean;
  isSet: boolean;
  onStart: (durationMinutes?: number) => void;
  onPause: () => void;
  onResume: () => void;
  onReset: () => void;
  onAdjustTime: (deltaSeconds: number) => void;
  doNotDisturb: boolean;
  onToggleDoNotDisturb: (enabled: boolean) => void;
  theme: ThemeConfig;
  highlightHex: string;
}

const PRESETS = [
  { label: '5m', minutes: 5, desc: 'Quick Sprint' },
  { label: '10m', minutes: 10, desc: 'Focus Block' },
  { label: '15m', minutes: 15, desc: 'Standard' },
  { label: '20m', minutes: 20, desc: 'Deep Flow' },
  { label: '25m', minutes: 25, desc: 'Pomodoro' },
  { label: '30m', minutes: 30, desc: 'Long Read' },
];

export const FocusTimerModal: React.FC<FocusTimerModalProps> = ({
  isOpen,
  onClose,
  secondsRemaining,
  initialDurationSeconds,
  isRunning,
  isSet,
  onStart,
  onPause,
  onResume,
  onReset,
  onAdjustTime,
  doNotDisturb,
  onToggleDoNotDisturb,
  theme,
  highlightHex,
}) => {
  const [customMinutes, setCustomMinutes] = useState<number>(15);

  if (!isOpen) return null;

  const mins = Math.floor(secondsRemaining / 60);
  const secs = secondsRemaining % 60;
  const formattedTime = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

  const progressPercent = initialDurationSeconds > 0
    ? Math.max(0, Math.min(100, Math.round(((initialDurationSeconds - secondsRemaining) / initialDurationSeconds) * 100)))
    : 0;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div 
        id="focus-timer-modal"
        className={`w-full max-w-md ${theme.cardBgClass} border ${theme.borderClass} rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200`}
      >
        {/* Modal Header */}
        <div className={`flex items-center justify-between px-5 py-4 border-b ${theme.borderClass}`}>
          <div className="flex items-center gap-2.5">
            <div 
              className="p-2 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: `${highlightHex}15`, color: highlightHex }}
            >
              <TimerIcon className="w-5 h-5" />
            </div>
            <div>
              <h3 className={`text-base font-bold ${theme.textPrimary}`}>
                Reading Focus Timer
              </h3>
              <p className={`text-xs ${theme.textMuted}`}>
                Structured ADHD focus sessions with Do Not Disturb
              </p>
            </div>
          </div>

          <button
            id="close-timer-modal-btn"
            type="button"
            onClick={onClose}
            aria-label="Close Timer Modal"
            className={`p-1.5 rounded-lg border ${theme.borderClass} ${theme.textMuted} hover:${theme.textPrimary} hover:${theme.accentSurface} transition-colors`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 flex flex-col items-center gap-5">
          {/* Main Time Display */}
          <div className="relative flex flex-col items-center justify-center py-2">
            <div 
              className="text-5xl sm:text-6xl font-mono font-black tracking-tight"
              style={{ color: highlightHex }}
            >
              {formattedTime}
            </div>

            {/* Progress indicator bar */}
            <div className={`w-48 h-1.5 rounded-full ${theme.sliderTrack} mt-3 overflow-hidden`}>
              <div 
                className="h-full rounded-full transition-all duration-300"
                style={{
                  width: `${progressPercent}%`,
                  backgroundColor: highlightHex,
                }}
              />
            </div>

            <div className={`text-xs font-medium ${theme.textMuted} mt-2`}>
              {isSet ? (
                isRunning ? (
                  <span className="flex items-center gap-1.5 text-emerald-400 font-semibold">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    Session in progress ({progressPercent}% done)
                  </span>
                ) : (
                  <span className="text-amber-400 font-semibold">
                    Session paused
                  </span>
                )
              ) : (
                'Choose a focus duration below to begin'
              )}
            </div>
          </div>

          {/* Quick Adjust Buttons (+1m / -1m) */}
          {isSet && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onAdjustTime(-60)}
                title="Subtract 1 minute"
                disabled={secondsRemaining <= 60}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-lg border ${theme.borderClass} ${theme.accentSurface} ${theme.textMuted} hover:${theme.textPrimary} disabled:opacity-30 text-xs font-semibold`}
              >
                <Minus className="w-3.5 h-3.5" />
                <span>1 min</span>
              </button>
              <button
                type="button"
                onClick={() => onAdjustTime(60)}
                title="Add 1 minute"
                className={`flex items-center gap-1 px-3 py-1.5 rounded-lg border ${theme.borderClass} ${theme.accentSurface} ${theme.textMuted} hover:${theme.textPrimary} text-xs font-semibold`}
              >
                <Plus className="w-3.5 h-3.5" />
                <span>1 min</span>
              </button>
            </div>
          )}

          {/* Primary Timer Controls (Play / Pause / Reset) */}
          <div className="flex items-center gap-3 w-full justify-center">
            {isSet ? (
              <>
                <button
                  id="timer-play-pause-btn"
                  type="button"
                  onClick={isRunning ? onPause : onResume}
                  className="flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl font-bold text-white shadow-md transition-all active:scale-95 text-sm"
                  style={{ backgroundColor: highlightHex }}
                >
                  {isRunning ? (
                    <>
                      <Pause className="w-4 h-4" />
                      <span>Pause Timer</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4 fill-current" />
                      <span>Resume Timer</span>
                    </>
                  )}
                </button>

                <button
                  id="timer-reset-btn"
                  type="button"
                  onClick={onReset}
                  title="Reset Timer"
                  className={`flex items-center justify-center p-2.5 rounded-xl border ${theme.borderClass} ${theme.textMuted} hover:${theme.textPrimary} hover:${theme.accentSurface} transition-colors`}
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
              </>
            ) : (
              <button
                id="timer-start-default-btn"
                type="button"
                onClick={() => onStart(customMinutes)}
                className="flex items-center justify-center gap-2 px-8 py-2.5 rounded-xl font-bold text-white shadow-md transition-all active:scale-95 text-sm"
                style={{ backgroundColor: highlightHex }}
              >
                <Play className="w-4 h-4 fill-current" />
                <span>Start {customMinutes} min Session</span>
              </button>
            )}
          </div>

          {/* Preset Buttons Grid */}
          <div className="w-full space-y-2">
            <span className={`block text-xs font-bold uppercase tracking-wider ${theme.textMuted}`}>
              Session Presets
            </span>
            <div className="grid grid-cols-3 gap-2">
              {PRESETS.map((p) => {
                const isActive = initialDurationSeconds === p.minutes * 60 && isSet;
                return (
                  <button
                    key={p.minutes}
                    type="button"
                    onClick={() => {
                      setCustomMinutes(p.minutes);
                      onStart(p.minutes);
                    }}
                    className={`flex flex-col items-center justify-center py-2 px-1 rounded-xl border text-xs transition-all ${
                      isActive
                        ? 'border-red-500 font-bold shadow-xs'
                        : `${theme.borderClass} ${theme.accentSurface} ${theme.textMuted} hover:${theme.textPrimary}`
                    }`}
                    style={
                      isActive
                        ? {
                            borderColor: highlightHex,
                            color: highlightHex,
                            backgroundColor: `${highlightHex}15`,
                          }
                        : undefined
                    }
                  >
                    <span className="font-bold text-sm">{p.label}</span>
                    <span className="text-[10px] opacity-75">{p.desc}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Do Not Disturb Toggle Card (Requirement 5) */}
          <div className={`w-full p-3.5 rounded-xl border ${theme.borderClass} ${theme.accentSurface} flex items-center justify-between gap-3`}>
            <div className="flex items-center gap-3">
              <div 
                className="p-2 rounded-lg flex items-center justify-center"
                style={{
                  backgroundColor: doNotDisturb ? `${highlightHex}25` : 'rgba(100,116,139,0.15)',
                  color: doNotDisturb ? highlightHex : '#94a3b8',
                }}
              >
                {doNotDisturb ? <BellOff className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
              </div>
              <div className="min-w-0">
                <div className={`text-xs font-bold ${theme.textPrimary} flex items-center gap-1.5`}>
                  <span>Do Not Disturb</span>
                  {doNotDisturb && (
                    <span className="px-1.5 py-0.2 rounded text-[10px] bg-red-500/20 text-red-400 font-mono font-bold">
                      ACTIVE
                    </span>
                  )}
                </div>
                <div className={`text-[11px] ${theme.textMuted} leading-tight`}>
                  Mutes all notification toasts and sound alerts while timer is set
                </div>
              </div>
            </div>

            <label className="relative inline-flex items-center cursor-pointer shrink-0">
              <input
                id="timer-dnd-toggle-checkbox"
                type="checkbox"
                checked={doNotDisturb}
                onChange={(e) => onToggleDoNotDisturb(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-red-500"></div>
            </label>
          </div>
        </div>

        {/* Footer info */}
        <div className={`px-5 py-3 border-t ${theme.borderClass} ${theme.accentSurface} flex items-center justify-between text-xs`}>
          <span className={theme.textMuted}>
            Auto-pauses reader when session finishes
          </span>
          <button
            type="button"
            onClick={onClose}
            className={`font-semibold hover:underline ${theme.textPrimary}`}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
