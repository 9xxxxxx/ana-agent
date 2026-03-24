'use client';

import { AlertCircleIcon, CheckCircleIcon, InfoIcon, SpinnerIcon, XCircleIcon } from './Icons';
import { cn, ui } from './ui';

export function StatusBadge({ tone = 'neutral', children }) {
  const tones = {
    success: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    warning: 'bg-amber-50 text-amber-700 border-amber-100',
    danger: 'bg-rose-50 text-rose-700 border-rose-100',
    info: 'bg-sky-50 text-sky-700 border-sky-100',
    neutral: 'bg-zinc-100 text-zinc-700 border-zinc-200',
  };

  return (
    <span className={cn(ui.badge, 'border', tones[tone] || tones.neutral)}>
      {children}
    </span>
  );
}

export function EmptyState({ icon, title, description, compact = false }) {
  return (
    <div className={cn('flex flex-col items-center justify-center text-center text-muted-foreground', compact ? 'py-10' : 'py-16')}>
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-400">
        {icon || <InfoIcon size={24} />}
      </div>
      <div className="text-base font-semibold text-zinc-900">{title}</div>
      {description && <p className="mt-2 max-w-md text-sm leading-7 text-zinc-500">{description}</p>}
    </div>
  );
}

export function LoadingState({ title = '正在加载...', description }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-100 text-emerald-600">
        <SpinnerIcon size={22} className="animate-spin" />
      </div>
      <div className="text-base font-semibold text-zinc-900">{title}</div>
      {description && <p className="mt-2 max-w-md text-sm leading-7 text-zinc-500">{description}</p>}
    </div>
  );
}

export function InlineFeedback({ tone = 'info', title, message }) {
  const iconMap = {
    success: <CheckCircleIcon size={16} className="text-emerald-600" />,
    warning: <AlertCircleIcon size={16} className="text-amber-600" />,
    danger: <XCircleIcon size={16} className="text-rose-600" />,
    info: <InfoIcon size={16} className="text-sky-600" />,
  };
  const toneMap = {
    success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    warning: 'border-amber-200 bg-amber-50 text-amber-900',
    danger: 'border-rose-200 bg-rose-50 text-rose-900',
    info: 'border-sky-200 bg-sky-50 text-sky-900',
  };

  return (
    <div className={cn('rounded-2xl border px-4 py-3 text-sm', toneMap[tone] || toneMap.info)}>
      <div className="flex items-start gap-3">
        <div className="mt-0.5">{iconMap[tone] || iconMap.info}</div>
        <div className="min-w-0">
          {title && <div className="font-semibold">{title}</div>}
          <div className={title ? 'mt-1 leading-6' : 'leading-6'}>{message}</div>
        </div>
      </div>
    </div>
  );
}

export function SkeletonBlock({ className = '' }) {
  return <div className={cn('animate-pulse rounded-2xl bg-zinc-200/70', className)} />;
}

export function StatsSkeleton({ count = 3 }) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className={cn(ui.panel, 'p-5')}>
          <SkeletonBlock className="h-3 w-24" />
          <SkeletonBlock className="mt-4 h-10 w-20" />
          <SkeletonBlock className="mt-3 h-3 w-28" />
        </div>
      ))}
    </div>
  );
}

export function ListSkeleton({ count = 3 }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className={cn(ui.surface, 'p-5')}>
          <SkeletonBlock className="h-4 w-40" />
          <SkeletonBlock className="mt-3 h-3 w-full" />
          <SkeletonBlock className="mt-2 h-3 w-3/4" />
          <div className="mt-4 flex gap-2">
            <SkeletonBlock className="h-8 w-24 rounded-full" />
            <SkeletonBlock className="h-8 w-20 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}
