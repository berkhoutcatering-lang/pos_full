export function ProductButton({
  name,
  price,                 // number, e.g. 9.5
  sublabel = null,       // optional, e.g. '+ topping'
  accent = 'var(--hop-600)', // FILL colour when filled/selected
  selected = false,      // tapped/active -> fully colour-filled
  filled = false,        // force the colour-filled style
  disabled = false,
  onClick,
  style = {},
  ...rest
}) {
  const fmt = (n) =>
    typeof n === 'number'
      ? '€ ' + n.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : n;

  const isFilled = filled || selected;

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      onMouseDown={(e) => { if (!disabled) e.currentTarget.style.boxShadow = 'var(--shadow-pressed)'; }}
      onMouseUp={(e) => { e.currentTarget.style.boxShadow = 'none'; }}
      onMouseLeave={(e) => { e.currentTarget.style.boxShadow = 'none'; }}
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        textAlign: 'left',
        minHeight: 'var(--tile-min-h)',
        padding: '14px 16px',
        /* Two states only: white + grey outline, OR fully colour-filled. */
        background: isFilled ? accent : 'var(--bg-tile)',
        color: isFilled ? 'var(--text-on-accent)' : 'var(--text-strong)',
        border: '1px solid ' + (isFilled ? accent : 'var(--line-strong)'),
        borderRadius: 'var(--radius-md)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        overflow: 'hidden',
        transition: 'background var(--dur-fast) var(--ease-out), border-color var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out)',
        WebkitTapHighlightColor: 'transparent',
        ...style,
      }}
      {...rest}
    >
      <span
        style={{
          font: `var(--weight-bold) var(--text-md)/1.15 var(--font-sans)`,
          color: 'inherit',
          textWrap: 'balance',
        }}
      >
        {name}
      </span>
      <span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span
          className="hb-tabular"
          style={{ font: `var(--weight-bold) var(--text-lg)/1 var(--font-sans)`, color: 'inherit' }}
        >
          {fmt(price)}
        </span>
        {sublabel ? (
          <span style={{ font: `var(--weight-medium) var(--text-xs)/1 var(--font-sans)`, color: isFilled ? 'var(--text-on-accent)' : 'var(--text-muted)', opacity: isFilled ? 0.85 : 1 }}>
            {sublabel}
          </span>
        ) : null}
      </span>
    </button>
  );
}
