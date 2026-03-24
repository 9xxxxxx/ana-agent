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
