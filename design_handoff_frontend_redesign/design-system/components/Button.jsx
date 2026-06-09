export function Button({
  children,
  variant = 'primary',   // 'primary' | 'secondary' | 'ghost' | 'danger'
  size = 'md',           // 'sm' | 'md' | 'lg'
  fullWidth = false,
  disabled = false,
  icon = null,           // optional leading node (e.g. an <svg>)
  iconRight = null,
  type = 'button',
  onClick,
  style = {},
  ...rest
}) {
  const sizes = {
    sm: { height: 40, padFont: '0 14px', font: 'var(--text-sm)', gap: 8, radius: 'var(--radius-sm)' },
    md: { height: 52, padFont: '0 20px', font: 'var(--text-base)', gap: 10, radius: 'var(--radius-md)' },
    lg: { height: 64, padFont: '0 28px', font: 'var(--text-lg)', gap: 12, radius: 'var(--radius-md)' },
  };
  const s = sizes[size] || sizes.md;

  const variants = {
    primary: {
      background: 'var(--hop-600)',
      color: 'var(--text-on-accent)',
      border: '1px solid var(--hop-600)',
    },
    secondary: {
      background: 'var(--paper-bright)',
      color: 'var(--text-strong)',
      border: '1px solid var(--line-strong)',
    },
    ghost: {
      background: 'transparent',
      color: 'var(--text-body)',
      border: '1px solid transparent',
    },
    danger: {
      background: 'var(--paper-bright)',
      color: 'var(--brick-600)',
      border: '1px solid var(--brick-600)',
    },
  };
  const v = variants[variant] || variants.primary;

  const base = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: s.gap,
    height: s.height,
    width: fullWidth ? '100%' : 'auto',
    padding: s.padFont,
    font: `var(--weight-bold) ${s.font}/1 var(--font-sans)`,
    letterSpacing: 'var(--tracking-normal)',
    borderRadius: s.radius,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.45 : 1,
    transition: 'background var(--dur-fast) var(--ease-out), transform var(--dur-fast) var(--ease-out), filter var(--dur-fast) var(--ease-out)',
    userSelect: 'none',
    WebkitTapHighlightColor: 'transparent',
    ...v,
    ...style,
  };

  const onDown = (e) => { if (!disabled) e.currentTarget.style.transform = 'scale(0.97)'; };
  const onUp = (e) => { e.currentTarget.style.transform = 'scale(1)'; };
  const onEnter = (e) => {
    if (disabled) return;
    if (variant === 'primary') e.currentTarget.style.background = 'var(--hop-700)';
    else if (variant === 'secondary') e.currentTarget.style.background = 'var(--offwhite)';
    else if (variant === 'ghost') e.currentTarget.style.background = 'var(--hop-50)';
    else if (variant === 'danger') e.currentTarget.style.background = 'var(--brick-100)';
  };
  const onLeave = (e) => {
    e.currentTarget.style.background = v.background;
    e.currentTarget.style.transform = 'scale(1)';
  };

  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onMouseDown={onDown}
      onMouseUp={onUp}
      style={base}
      {...rest}
    >
      {icon ? <span style={{ display: 'inline-flex' }}>{icon}</span> : null}
      {children ? <span>{children}</span> : null}
      {iconRight ? <span style={{ display: 'inline-flex' }}>{iconRight}</span> : null}
    </button>
  );
}
