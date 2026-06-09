export function Badge({
  children,
  variant = 'neutral',  // 'neutral' | 'accent' | 'danger' | 'amber' | 'dark'
  size = 'md',          // 'sm' | 'md'
  style = {},
  ...rest
}) {
  const variants = {
    neutral: { background: 'var(--offwhite)', color: 'var(--text-muted)', border: '1px solid var(--line-strong)' },
    accent:  { background: 'var(--hop-100)', color: 'var(--hop-700)', border: '1px solid var(--hop-300)' },
    danger:  { background: 'var(--brick-100)', color: 'var(--brick-700)', border: '1px solid transparent' },
    amber:   { background: 'var(--amber-100)', color: 'var(--amber-600)', border: '1px solid transparent' },
    dark:    { background: 'var(--charcoal-900)', color: 'var(--offwhite)', border: '1px solid transparent' },
  };
  const v = variants[variant] || variants.neutral;
  const sz = size === 'sm'
    ? { font: 'var(--text-2xs)', pad: '2px 8px', minH: 20 }
    : { font: 'var(--text-xs)', pad: '4px 10px', minH: 26 };

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: sz.minH,
        padding: sz.pad,
        font: `var(--weight-bold) ${sz.font}/1 var(--font-sans)`,
        letterSpacing: 'var(--tracking-wide)',
        textTransform: 'uppercase',
        borderRadius: 'var(--radius-sm)',
        whiteSpace: 'nowrap',
        ...v,
        ...style,
      }}
      {...rest}
    >
      {children}
    </span>
  );
}
