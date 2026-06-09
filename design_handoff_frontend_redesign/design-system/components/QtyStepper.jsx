export function QtyStepper({
  value = 1,
  min = 0,
  max = 99,
  size = 'md',           // 'sm' | 'md'
  onChange,              // (next:number) => void
  style = {},
  ...rest
}) {
  const dim = size === 'sm' ? 40 : 52;
  const set = (next) => {
    const clamped = Math.max(min, Math.min(max, next));
    if (clamped !== value && onChange) onChange(clamped);
  };
  const btn = (label, fn, disabled) => (
    <button
      type="button"
      disabled={disabled}
      onClick={fn}
      style={{
        width: dim,
        height: dim,
        flex: 'none',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--paper-bright)',
        color: disabled ? 'var(--text-disabled)' : 'var(--text-strong)',
        border: 'none',
        font: `var(--weight-bold) var(--text-xl)/1 var(--font-sans)`,
        cursor: disabled ? 'not-allowed' : 'pointer',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      {label}
    </button>
  );

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'stretch',
        border: '1px solid var(--line-strong)',
        borderRadius: 'var(--radius-md)',
        overflow: 'hidden',
        ...style,
      }}
      {...rest}
    >
      {btn('\u2212', () => set(value - 1), value <= min)}
      <span
        className="hb-tabular"
        style={{
          minWidth: dim,
          height: dim,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderLeft: '1px solid var(--line)',
          borderRight: '1px solid var(--line)',
          background: 'var(--offwhite)',
          font: `var(--weight-bold) var(--text-lg)/1 var(--font-sans)`,
          color: 'var(--text-strong)',
        }}
      >
        {value}
      </span>
      {btn('+', () => set(value + 1), value >= max)}
    </div>
  );
}
