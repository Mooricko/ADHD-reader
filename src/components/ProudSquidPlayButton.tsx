import React from 'react';

interface ProudSquidPlayButtonProps {
  id?: string;
  isPlaying: boolean;
  onToggle: () => void;
  accentColor?: string;
  className?: string;
  title?: string;
  showShortcutHint?: boolean;
}

export const ProudSquidPlayButton: React.FC<ProudSquidPlayButtonProps> = ({
  id = 'proud-squid-play-btn',
  isPlaying,
  onToggle,
  accentColor = '#f43f5e',
  className = '',
  title,
  showShortcutHint = true,
}) => {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onToggle();
    }
  };

  return (
    <div className={`proud-squid-toggle ${className}`} id={`${id}-wrapper`}>
      <label
        id={id}
        htmlFor={`${id}-input`}
        data-checked={isPlaying}
        title={title || (isPlaying ? 'Pause reading (Space)' : 'Play reading (Space)')}
        aria-label={isPlaying ? 'Pause reading' : 'Play reading'}
        className="proud-squid-label"
        style={{
          ['--squid-accent' as any]: accentColor,
        }}
        tabIndex={0}
        onKeyDown={handleKeyDown}
      >
        <input
          id={`${id}-input`}
          type="checkbox"
          className="proud-squid-circle"
          checked={isPlaying}
          onChange={onToggle}
          aria-checked={isPlaying}
          role="switch"
          tabIndex={-1}
        />
      </label>

      {showShortcutHint && (
        <span className="text-[10px] uppercase font-mono tracking-widest text-neutral-400 select-none opacity-60 hover:opacity-100 transition-opacity">
          Space
        </span>
      )}
    </div>
  );
};
