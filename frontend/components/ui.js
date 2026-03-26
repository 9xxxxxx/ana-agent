export function cn(...values) {
  return values.filter(Boolean).join(' ');
}

export const ui = {
  surface: 'glass-panel rounded-[30px] border border-white/70 shadow-[0_28px_80px_rgba(30,41,59,0.10)]',
  surfaceMuted: 'rounded-[24px] border border-white/70 bg-white/60 backdrop-blur-xl',
  panel: 'rounded-[24px] border border-white/80 bg-white/80 shadow-[0_18px_50px_rgba(30,41,59,0.08)] backdrop-blur-xl',
  card: 'rounded-[24px] border border-brand-100/80 bg-brand-50/70',
  badge: 'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold',
  input:
    'w-full rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-100/70',
  inputMuted:
    'w-full rounded-2xl border border-slate-200 bg-slate-50/90 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-brand-500 focus:bg-white focus:ring-4 focus:ring-brand-100/70',
  textarea:
    'w-full min-h-[120px] resize-none rounded-[24px] border border-slate-200 bg-white/90 px-4 py-3 text-[15px] leading-8 text-slate-900 outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-100/70',
  textareaMuted:
    'w-full min-h-[120px] resize-none rounded-[24px] border border-slate-200 bg-slate-50/90 px-4 py-3 text-[15px] leading-8 text-slate-700 outline-none transition focus:border-brand-500 focus:bg-white focus:ring-4 focus:ring-brand-100/70',
  select:
    'w-full appearance-none rounded-2xl border border-slate-200 bg-white/90 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brand-500 focus:bg-white focus:ring-4 focus:ring-brand-100/70',
  buttonPrimary:
    'inline-flex items-center gap-2 rounded-full border border-brand-700 bg-brand-700 px-3 py-2 text-sm font-medium text-white transition hover:border-brand-600 hover:bg-brand-600',
  buttonSecondary:
    'inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-brand-200 hover:bg-brand-50',
  buttonGhost:
    'inline-flex items-center gap-2 rounded-full border border-transparent bg-slate-100/80 px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-brand-200 hover:bg-white',
  iconButton:
    'rounded-full p-2 text-slate-500 transition hover:bg-brand-50 hover:text-brand-700',
  headingEyebrow: 'text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500',
  headingLg: 'text-xl font-semibold text-slate-950',
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
            {title && <h3 className="mt-1 text-lg font-semibold text-slate-950">{title}</h3>}
            {description && <p className="mt-1 text-sm leading-6 text-slate-500">{description}</p>}
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
    neutral: 'border-white bg-white/80',
    success: 'border-emerald-200 bg-emerald-50/70',
    warning: 'border-amber-200 bg-amber-50/80',
    danger: 'border-rose-200 bg-rose-50/80',
    info: 'border-sky-200 bg-sky-50/80',
  };

  return (
    <div className={cn(ui.panel, 'p-5', toneMap[tone] || toneMap.neutral, className)}>
      <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{label}</div>
      <div className="mt-3 text-4xl font-semibold tracking-[-0.03em] text-slate-950">{value}</div>
      {hint && <div className="mt-2 text-sm text-slate-500">{hint}</div>}
    </div>
  );
}
