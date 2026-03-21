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

  const getTrendClass = () => {
    if (changeType === 'positive') return 'trend-positive';
    if (changeType === 'negative') return 'trend-negative';
    return 'trend-neutral';
  };

  const getColorClass = () => `metric-color-${color}`;

  return (
    <div className={`metric-card metric-${size} ${getColorClass()}`}>
      <div className="metric-header">
        {icon && <span className="metric-icon">{icon}</span>}
        <span className="metric-title">{title}</span>
      </div>
      
      <div className="metric-value-wrapper">
        <span className="metric-value">{value}</span>
        {unit && <span className="metric-unit">{unit}</span>}
      </div>

      {(change !== undefined || trend) && (
        <div className={`metric-trend ${getTrendClass()}`}>
          {trend && <span className="trend-icon">{getTrendIcon()}</span>}
          {change !== undefined && (
            <span className="trend-value">
              {change > 0 ? '+' : ''}{change}%
            </span>
          )}
        </div>
      )}

      {description && (
        <p className="metric-description">{description}</p>
      )}
    </div>
  );
}
