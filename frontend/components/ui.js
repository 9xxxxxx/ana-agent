export function cn(...values) {
  return values.filter(Boolean).join(' ');
}

export const ui = {
  surface: 'rounded-[28px] border border-zinc-200 bg-white shadow-sm',
  surfaceMuted: 'rounded-[24px] border border-zinc-200 bg-zinc-50',
  panel: 'rounded-2xl border border-zinc-200 bg-white shadow-sm',
  card: 'rounded-2xl border border-zinc-200 bg-zinc-50',
  badge: 'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold',
  input:
    'w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-800 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100',
  inputMuted:
    'w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-800 outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-100',
  textarea:
    'w-full min-h-[120px] resize-none rounded-[24px] border border-zinc-200 bg-white px-4 py-3 text-[15px] leading-8 text-zinc-800 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100',
  textareaMuted:
    'w-full min-h-[120px] resize-none rounded-[24px] border border-zinc-200 bg-zinc-50 px-4 py-3 text-[15px] leading-8 text-zinc-700 outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-100',
  select:
    'w-full appearance-none rounded-2xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-800 outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-100',
  buttonPrimary:
    'inline-flex items-center gap-2 rounded-full border border-zinc-900 bg-zinc-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-zinc-800',
  buttonSecondary:
    'inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition hover:border-zinc-300 hover:bg-zinc-50',
  buttonGhost:
    'inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm font-medium text-zinc-700 transition hover:border-zinc-300 hover:bg-zinc-100',
  iconButton:
    'rounded-full p-2 text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900',
  headingEyebrow: 'text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-500',
  headingLg: 'text-xl font-semibold text-zinc-900',
};

export function ToolbarButton({
  children,
  variant = 'secondary',
  className = '',
  ...props
}) {
  const variantClass = {
    primary: ui.buttonPrimary,
    secondary: ui.buttonSecondary,
    ghost: ui.buttonGhost,
    icon: ui.iconButton,
  };

  return (
    <button
      className={cn(variantClass[variant] || variantClass.secondary, className)}
      {...props}
    >
      {children}
    </button>
  );
}

export function SectionCard({
  children,
  title,
  description,
  eyebrow,
  actions,
  className = '',
  bodyClassName = '',
}) {
  return (
    <section className={cn(ui.surface, 'p-6', className)}>
      {(title || description || eyebrow || actions) && (
        <div className="mb-4 flex items-start justify-between gap-4">
          <div className="min-w-0">
            {eyebrow && <div className={ui.headingEyebrow}>{eyebrow}</div>}
            {title && <h3 className="mt-1 text-lg font-semibold text-zinc-950">{title}</h3>}
            {description && <p className="mt-1 text-sm leading-6 text-zinc-500">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

export function DataStatCard({
  label,
  value,
  tone = 'neutral',
  hint,
  className = '',
}) {
  const toneMap = {
    neutral: 'border-zinc-200 bg-white',
    success: 'border-emerald-200 bg-emerald-50/60',
    warning: 'border-amber-200 bg-amber-50/70',
    danger: 'border-rose-200 bg-rose-50/70',
    info: 'border-sky-200 bg-sky-50/70',
  };

  return (
    <div className={cn(ui.panel, 'p-5', toneMap[tone] || toneMap.neutral, className)}>
      <div className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">{label}</div>
      <div className="mt-3 text-4xl font-semibold tracking-[-0.03em] text-zinc-950">{value}</div>
      {hint && <div className="mt-2 text-sm text-zinc-500">{hint}</div>}
    </div>
  );
}
