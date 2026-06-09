export function CategoryTab({
  label,
  count = null,          // optional item count
  accent = 'var(--hop-600)', // FILL colour when active
  icon = null,           // optional icon node (used in vertical/group rail)
  active = false,
  orientation = 'horizontal', // 'horizontal' | 'vertical'
  onClick,
  style = {},
  ...rest
}) {
  const vertical = orientation === 'vertical';

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'flex',
        flexDirection: vertical ? 'column' : 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: vertical ? 6 : 10,
        width: vertical ? '100%' : 'auto',
        height: vertical ? '100%' : 'var(--cattab-h)',
        minHeight: vertical ? 'var(--rail-item-h)' : 'var(--cattab-h)',
        padding: vertical ? '8px 6px' : '0 22px',
        /* Two states only: white + grey outline, OR fully colour-filled. */
        background: active ? accent : 'var(--paper-bright)',
        color: active ? 'var(--text-on-accent)' : 'var(--text-body)',
        border: active ? '1px solid ' + accent : '1px solid var(--line-strong)',
        borderRadius: 'var(--radius-md)',
        font: `var(--weight-bold) ${vertical ? 'var(--text-sm)' : 'var(--text-md)'}/1.05 var(--font-sans)`,
        whiteSpace: vertical ? 'normal' : 'nowrap',
        textAlign: 'center',
        cursor: 'pointer',
        transition: 'background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out), border-color var(--dur-fast) var(--ease-out)',
        WebkitTapHighlightColor: 'transparent',
        ...style,
      }}
      {...rest}
    >
      {icon ? (
        <span style={{ display: 'inline-flex', color: 'currentColor' }}>{icon}</span>
      ) : null}

      <span>{label}</span>

      {count != null ? (
        <span
          className="hb-tabular"
          style={{
            font: `var(--weight-bold) var(--text-xs)/1 var(--font-sans)`,
            opacity: 0.72,
          }}
        >
          {count}
        </span>
      ) : null}
    </button>
  );
}
