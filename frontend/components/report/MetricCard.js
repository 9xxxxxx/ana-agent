'use client';

/**
 * 指标卡片组件
 * 展示关键业务指标，支持趋势指示和变化率
 */

export default function MetricCard({
  title,
  value,
  unit = '',
  change,
  changeType = 'neutral', // 'positive' | 'negative' | 'neutral'
  trend, // 'up' | 'down' | 'flat'
  description,
  size = 'medium', // 'small' | 'medium' | 'large'
  icon,
  color = 'blue', // 'blue' | 'green' | 'purple' | 'orange' | 'red'
}) {
  const getTrendIcon = () => {
    if (trend === 'up') return '↑';
    if (trend === 'down') return '↓';
    return '→';
  };

  const toneClass = (() => {
    if (changeType === 'positive') return 'text-emerald-600 bg-emerald-50';
    if (changeType === 'negative') return 'text-rose-600 bg-rose-50';
    return 'text-stone-600 bg-stone-100';
  })();

  const accentClass = (() => {
    if (color === 'green') return 'from-emerald-500/18 to-emerald-100';
    if (color === 'purple') return 'from-violet-500/18 to-violet-100';
    if (color === 'orange') return 'from-amber-500/18 to-amber-100';
    if (color === 'red') return 'from-rose-500/18 to-rose-100';
    return 'from-sky-500/18 to-sky-100';
  })();

  const sizeClass = size === 'small'
    ? 'p-4 rounded-[24px]'
    : size === 'large'
      ? 'p-6 rounded-[30px]'
      : 'p-5 rounded-[28px]';

  return (
    <div className={`border border-stone-200 bg-[linear-gradient(180deg,#ffffff_0%,#fbf7ef_100%)] shadow-sm ${sizeClass}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-stone-500">{title}</div>
          <div className="mt-3 flex items-end gap-2">
            <span className="truncate text-3xl font-semibold tracking-[-0.04em] text-stone-950">{value}</span>
            {unit && <span className="pb-1 text-sm text-stone-500">{unit}</span>}
          </div>
        </div>
        {icon && (
          <div className={`flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br ${accentClass} text-lg`}>
            {icon}
          </div>
        )}
      </div>

      {(change !== undefined || trend) && (
        <div className={`mt-4 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ${toneClass}`}>
          {trend && <span>{getTrendIcon()}</span>}
          {change !== undefined && (
            <span>
              {change > 0 ? '+' : ''}{change}%
            </span>
          )}
        </div>
      )}

      {description && (
        <p className="mt-4 text-sm leading-6 text-stone-600">{description}</p>
      )}
    </div>
  );
}
