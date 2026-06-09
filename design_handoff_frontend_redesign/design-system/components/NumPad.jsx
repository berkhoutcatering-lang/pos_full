export function NumPad({
  value = '',            // current entry string
  onChange,             // (next:string) => void
  onClear,              // optional explicit clear handler
  keyHeight = 64,
  style = {},
  ...rest
}) {
  const press = (k) => {
    if (!onChange) return;
    if (k === 'back') return onChange(value.slice(0, -1));
    if (k === 'clear') { if (onClear) onClear(); return onChange(''); }
    const next = (value === '0' ? '' : value) + k;
    onChange(next.slice(0, 4));
  };

  const keys = ['7', '8', '9', '4', '5', '6', '1', '2', '3', 'clear', '0', 'back'];

  const keyStyle = (k) => {
    const isAction = k === 'clear' || k === 'back';
    return {
      height: keyHeight,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: isAction ? 'var(--offwhite)' : 'var(--paper-bright)',
      color: k === 'clear' ? 'var(--brick-600)' : 'var(--text-strong)',
      border: '1px solid var(--line-strong)',
      borderRadius: 'var(--radius-md)',
      font: `var(--weight-bold) var(--text-xl)/1 var(--font-sans)`,
      cursor: 'pointer',
      WebkitTapHighlightColor: 'transparent',
    };
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, ...style }} {...rest}>
      <div
        className="hb-tabular"
        style={{
          height: 56,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          padding: '0 14px',
          background: 'var(--paper-bright)',
          border: '1px solid var(--line-strong)',
          borderRadius: 'var(--radius-md)',
          font: `var(--weight-black) var(--text-2xl)/1 var(--font-sans)`,
          color: value ? 'var(--text-strong)' : 'var(--text-disabled)',
        }}
      >
        {value || '0'}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        {keys.map((k) => (
          <button key={k} type="button" style={keyStyle(k)} onClick={() => press(k)}>
            {k === 'back' ? '\u232B' : k === 'clear' ? 'C' : k}
          </button>
        ))}
      </div>
    </div>
  );
}
