export function FunctionButton({
  label,
  icon = null,           // icon node (e.g. Lucide svg)
  variant = 'neutral',   // 'neutral' | 'primary' | 'danger' | 'amber'
  layout = 'stack',      // 'stack' (icon over label) | 'inline'
  amount = null,         // optional trailing amount, e.g. '€ 37,50' (primary)
  disabled = false,
  onClick,
  style = {},
  ...rest
}) {
  const variants = {
    neutral: { background: 'var(--paper-bright)', color: 'var(--text-body)', border: '1px solid var(--line-strong)', icon: 'var(--charcoal-600)' },
    primary: { background: 'var(--hop-600)', color: 'var(--text-on-accent)', border: '1px solid var(--hop-600)', icon: 'var(--text-on-accent)' },
    danger:  { background: 'var(--paper-bright)', color: 'var(--brick-600)', border: '1px solid var(--brick-600)', icon: 'var(--brick-600)' },
    amber:   { background: 'var(--paper-bright)', color: 'var(--amber-600)', border: '1px solid var(--amber-600)', icon: 'var(--amber-600)' },
  };
  const v = variants[variant] || variants.neutral;
  const isStack = layout === 'stack';

  const hoverBg = {
    neutral: 'var(--offwhite)',
    primary: 'var(--hop-700)',
    danger: 'var(--brick-100)',
    amber: 'var(--amber-100)',
  }[variant];

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.background = hoverBg; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = v.background; }}
      onMouseDown={(e) => { if (!disabled) e.currentTarget.style.transform = 'scale(0.98)'; }}
      onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
      style={{
        display: 'flex',
        flexDirection: isStack ? 'column' : 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: isStack ? 6 : 10,
        minHeight: 'var(--touch-fn)',
        padding: isStack ? '10px 12px' : '0 18px',
        background: v.background,
        color: v.color,
        border: v.border,
        borderRadius: 'var(--radius-md)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        transition: 'background var(--dur-fast) var(--ease-out), transform var(--dur-fast) var(--ease-out)',
        WebkitTapHighlightColor: 'transparent',
        ...style,
      }}
      {...rest}
    >
      {icon ? (
        <span style={{ display: 'inline-flex', color: v.icon, flex: 'none' }}>{icon}</span>
      ) : null}
      <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: isStack ? 'center' : 'flex-start', flex: layout === 'inline' && amount ? 1 : 'none' }}>
        <span style={{ font: `var(--weight-bold) ${isStack ? 'var(--text-sm)' : 'var(--text-lg)'}/1 var(--font-sans)`, whiteSpace: 'nowrap' }}>{label}</span>
      </span>
      {amount ? (
        <span className="hb-tabular" style={{ font: `var(--weight-black) var(--text-xl)/1 var(--font-sans)`, whiteSpace: 'nowrap' }}>{amount}</span>
      ) : null}
    </button>
  );
}
