import { useEffect, useRef } from 'react';

export type AutoPauseReason = 'mouse' | 'blur' | 'visibility';

interface UseSmartAutoPauseOptions {
  isPlaying: boolean;
  enabled: boolean;
  onAutoPause: (reason: AutoPauseReason) => void;
}

/**
 * Smart Auto-Pause Hook
 * Monitors user presence and automatically pauses RSVP playback when:
 * 1. The cursor leaves the document/browser viewport
 * 2. The window or iframe loses focus (tab switch, alt-tab, application switch)
 * 3. The document becomes hidden (background tab)
 *
 * Prevents the RSVP reader from running unattended so ADHD readers never lose their place.
 */
export function useSmartAutoPause({
  isPlaying,
  enabled,
  onAutoPause,
}: UseSmartAutoPauseOptions) {
  const isPlayingRef = useRef(isPlaying);
  const enabledRef = useRef(enabled);
  const onAutoPauseRef = useRef(onAutoPause);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
    enabledRef.current = enabled;
    onAutoPauseRef.current = onAutoPause;
  }, [isPlaying, enabled, onAutoPause]);

  useEffect(() => {
    if (!enabled) return;

    // 1. Mouse leaving the document window
    const handleMouseLeave = (e: MouseEvent) => {
      if (!isPlayingRef.current || !enabledRef.current) return;
      
      // Verify cursor has crossed outside the document boundaries
      const isOutside = 
        !e.relatedTarget &&
        (e.clientY <= 0 ||
          e.clientX <= 0 ||
          e.clientX >= window.innerWidth ||
          e.clientY >= window.innerHeight);

      if (isOutside) {
        onAutoPauseRef.current('mouse');
      }
    };

    // Cross-browser mouseout verification
    const handleMouseOut = (e: MouseEvent) => {
      if (!isPlayingRef.current || !enabledRef.current) return;
      if (!e.relatedTarget && !(e as any).toElement) {
        onAutoPauseRef.current('mouse');
      }
    };

    // 2. Window blur (tab switch, window minimization, external app focus)
    const handleWindowBlur = () => {
      if (!isPlayingRef.current || !enabledRef.current) return;
      onAutoPauseRef.current('blur');
    };

    // 3. Document visibility change (e.g. background tab)
    const handleVisibilityChange = () => {
      if (!isPlayingRef.current || !enabledRef.current) return;
      if (document.hidden) {
        onAutoPauseRef.current('visibility');
      }
    };

    document.documentElement.addEventListener('mouseleave', handleMouseLeave);
    window.addEventListener('mouseout', handleMouseOut);
    window.addEventListener('blur', handleWindowBlur);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.documentElement.removeEventListener('mouseleave', handleMouseLeave);
      window.removeEventListener('mouseout', handleMouseOut);
      window.removeEventListener('blur', handleWindowBlur);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [enabled]);
}
