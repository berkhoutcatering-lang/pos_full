export function OrderLine({
  qty = 1,
  name,
  unitPrice = null,      // optional per-unit price hint
  lineTotal,             // number
  note = null,           // optional modifier line, e.g. '+ extra kaas'
  selected = false,
  onClick,
  style = {},
  ...rest
}) {
  const fmt = (n) =>
    typeof n === 'number'
      ? n.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : n;

  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
        padding: '12px 14px',
        background: selected ? 'var(--hop-100)' : 'transparent',
        borderRadius: 'var(--radius-sm)',
        borderLeft: selected ? '3px solid var(--hop-600)' : '3px solid transparent',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'background var(--dur-fast) var(--ease-out)',
        ...style,
      }}
      {...rest}
    >
      <span
        className="hb-tabular"
        style={{
          flex: 'none',
          minWidth: 40,
          height: 34,
          padding: '0 8px',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--offwhite)',
          border: '1px solid var(--line-strong)',
          borderRadius: 'var(--radius-sm)',
          font: `var(--weight-bold) var(--text-base)/1 var(--font-sans)`,
          color: 'var(--text-strong)',
        }}
      >
        {qty}
      </span>

      <span style={{ flex: 1, minWidth: 0, paddingTop: 1 }}>
        <span
          style={{
            display: 'block',
            font: `var(--weight-semibold) var(--text-base)/1.25 var(--font-sans)`,
            color: 'var(--text-strong)',
          }}
        >
          {name}
        </span>
        {note ? (
          <span style={{ display: 'block', font: `var(--weight-medium) var(--text-xs)/1.3 var(--font-sans)`, color: 'var(--text-muted)', marginTop: 2 }}>
            {note}
          </span>
        ) : null}
        {unitPrice != null ? (
          <span className="hb-tabular" style={{ display: 'block', font: `var(--weight-regular) var(--text-xs)/1 var(--font-sans)`, color: 'var(--text-muted)', marginTop: 3 }}>
            {'à € ' + fmt(unitPrice)}
          </span>
        ) : null}
      </span>

      <span
        className="hb-tabular"
        style={{
          flex: 'none',
          font: `var(--weight-bold) var(--text-base)/1.4 var(--font-sans)`,
          color: 'var(--text-strong)',
        }}
      >
        {'€ ' + fmt(lineTotal)}
      </span>
    </div>
  );
}
