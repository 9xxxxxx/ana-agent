'use client';

/**
 * 智能图表组件
 * 支持多图表库切换：ECharts、Nivo、Visx
 */

import { useState, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import EChartsRenderer, { inferChartType } from './EChartsRenderer';

// 动态导入 Nivo 和 Visx 渲染器，避免 SSR 问题
const NivoRenderer = dynamic(() => import('./NivoRenderer'), {
  ssr: false,
  loading: () => <div className="chart-loading"><div className="loading-spinner"></div></div>,
});

const VisxRenderer = dynamic(() => import('./VisxRenderer'), {
  ssr: false,
  loading: () => <div className="chart-loading"><div className="loading-spinner"></div></div>,
});

/**
 * 解析图表数据
 */
function parseChartData(rawData) {
  if (!rawData) return null;

  if (typeof rawData === 'string') {
    try {
      const parsed = JSON.parse(rawData);
      return parsed;
    } catch {
      return null;
    }
  }

  // 如果是完整的图表对象，直接返回
  if (typeof rawData === 'object' && rawData.type === 'chart_data') {
    return rawData;
  }

  return rawData;
}

/**
 * 从数据中推断列名
 */
function inferColumns(data) {
  if (!data || (Array.isArray(data) && data.length === 0)) return { xCol: null, yCol: null };

  // 如果是完整的图表对象，使用其指定的列
  if (typeof data === 'object' && data.type === 'chart_data') {
    return {
      xCol: data.xCol || null,
      yCol: data.yCol || null
    };
  }

  // 否则，从数据数组中推断
  if (Array.isArray(data) && data.length > 0) {
    const keys = Object.keys(data[0]);
    if (keys.length < 2) return { xCol: keys[0], yCol: null };

    const numericCol = keys.find((k) => {
      const val = data[0][k];
      return typeof val === 'number' || !isNaN(parseFloat(val));
    });

    const categoryCol = keys.find((k) => k !== numericCol);

    return {
      xCol: categoryCol || keys[0],
      yCol: numericCol || keys[1],
    };
  }

  return { xCol: null, yCol: null };
}

// 图表库配置
const chartLibraries = [
  {
    id: 'echarts',
    name: 'ECharts',
    icon: '✨',
    description: '功能强大，动画流畅',
    supportedTypes: [
      'bar', 'horizontal_bar', 'line', 'area', 'pie', 'scatter', 'radar',
      'funnel', 'gauge', 'heatmap', 'treemap', 'sunburst', 'boxplot',
      'wordcloud', 'polar_bar', 'waterfall'
    ],
  },
  {
    id: 'nivo',
    name: 'Nivo',
    icon: '🎨',
    description: '精美设计，响应式',
    supportedTypes: [
      'bar', 'line', 'area', 'pie', 'scatter', 'radar', 'funnel',
      'treemap', 'heatmap', 'sunburst', 'bullet'
    ],
  },
  {
    id: 'visx',
    name: 'Visx',
    icon: '🔧',
    description: '高度可定制',
    supportedTypes: ['bar', 'line', 'pie'],
  },
];

// 图表类型配置
const chartTypes = [
  { value: 'bar', label: '柱状图', icon: '📊', category: 'basic' },
  { value: 'horizontal_bar', label: '横向柱状图', icon: '📊', category: 'basic' },
  { value: 'line', label: '折线图', icon: '📈', category: 'basic' },
  { value: 'area', label: '面积图', icon: '📉', category: 'basic' },
  { value: 'pie', label: '饼图', icon: '🥧', category: 'basic' },
  { value: 'scatter', label: '散点图', icon: '⚬', category: 'basic' },
  { value: 'radar', label: '雷达图', icon: '🎯', category: 'advanced' },
  { value: 'funnel', label: '漏斗图', icon: '🔻', category: 'advanced' },
  { value: 'gauge', label: '仪表盘', icon: '⏱️', category: 'advanced' },
  { value: 'heatmap', label: '热力图', icon: '🔥', category: 'advanced' },
  { value: 'treemap', label: '树图', icon: '🌳', category: 'advanced' },
  { value: 'sunburst', label: '旭日图', icon: '☀️', category: 'advanced' },
  { value: 'boxplot', label: '箱线图', icon: '📦', category: 'advanced' },
  { value: 'wordcloud', label: '词云图', icon: '💬', category: 'advanced' },
  { value: 'polar_bar', label: '极坐标柱状图', icon: '🌀', category: 'advanced' },
  { value: 'waterfall', label: '瀑布图', icon: '💧', category: 'advanced' },
  { value: 'bullet', label: '子弹图', icon: '🎯', category: 'advanced' },
];

/**
 * 智能图表组件
 */
export default function SmartChart({
  data: rawData,
  chartType: explicitType,
  title,
  xCol: explicitXCol,
  yCol: explicitYCol,
  colorCol,
  sizeCol,
  height = 400,
  showTypeSelector = true,
  showLibrarySelector = true,
  defaultLibrary = 'echarts',
  onTypeChange,
  onLibraryChange,
}) {
  const [selectedType, setSelectedType] = useState(explicitType);
  const [selectedLibrary, setSelectedLibrary] = useState(defaultLibrary);

  const data = useMemo(() => parseChartData(rawData), [rawData]);

  // 提取实际数据数组和配置
  const chartData = useMemo(() => {
    if (typeof data === 'object' && data.type === 'chart_data') {
      return data.data || [];
    }
    return data;
  }, [data]);

  const chartConfig = useMemo(() => {
    if (typeof data === 'object' && data.type === 'chart_data') {
      return {
        chartType: data.chartType,
        xCol: data.xCol,
        yCol: data.yCol,
        title: data.title,
        colorCol: data.colorCol,
        sizeCol: data.sizeCol
      };
    }
    return null;
  }, [data]);

  const inferredColumns = useMemo(() => {
    if (explicitXCol && explicitYCol) {
      return { xCol: explicitXCol, yCol: explicitYCol };
    }
    if (chartConfig) {
      return { xCol: chartConfig.xCol, yCol: chartConfig.yCol };
    }
    return inferColumns(data);
  }, [data, explicitXCol, explicitYCol, chartConfig]);

  const inferredType = useMemo(() => {
    if (selectedType) return selectedType;
    if (explicitType) return explicitType;
    if (chartConfig && chartConfig.chartType) {
      return chartConfig.chartType;
    }
    if (chartData && inferredColumns.xCol && inferredColumns.yCol) {
      return inferChartType(chartData, inferredColumns.xCol, inferredColumns.yCol);
    }
    return 'bar';
  }, [chartData, inferredColumns, selectedType, explicitType, chartConfig]);

  const handleTypeChange = (type) => {
    setSelectedType(type);
    onTypeChange?.(type);
  };

  const handleLibraryChange = (library) => {
    setSelectedLibrary(library);
    onLibraryChange?.(library);
  };

  useEffect(() => {
    if (explicitType && explicitType !== selectedType) {
      setSelectedType(explicitType);
    }
  }, [explicitType, selectedType]);

  useEffect(() => {
    if (defaultLibrary && defaultLibrary !== selectedLibrary) {
      setSelectedLibrary(defaultLibrary);
    }
  }, [defaultLibrary, selectedLibrary]);

  if (!chartData || (Array.isArray(chartData) && chartData.length === 0)) {
    return (
      <div className="smart-chart-empty">
        <span className="empty-icon">📊</span>
        <span className="empty-text">暂无图表数据</span>
      </div>
    );
  }

  const config = {
    chartType: inferredType,
    xCol: inferredColumns.xCol,
    yCol: inferredColumns.yCol,
    title: chartConfig?.title || title,
    colorCol: chartConfig?.colorCol || colorCol,
    sizeCol: chartConfig?.sizeCol || sizeCol,
  };

  // 获取当前库支持的图表类型
  const currentLibrary = chartLibraries.find((lib) => lib.id === selectedLibrary);
  const supportedTypes = currentLibrary?.supportedTypes || [];
  const isTypeSupported = supportedTypes.includes(inferredType);

  // 如果当前类型不支持，自动切换到支持的库
  const effectiveLibrary = isTypeSupported ? selectedLibrary : 'echarts';

  // 渲染图表
  const renderChart = () => {
    const chartProps = {
      data: chartData,
      config,
      height,
    };

    switch (selectedLibrary) {
      case 'nivo':
        return <NivoRenderer {...chartProps} />;
      case 'visx':
        return <VisxRenderer {...chartProps} />;
      case 'echarts':
      default:
        return <EChartsRenderer {...chartProps} />;
    }
  };

  return (
    <div className="smart-chart-wrapper">
      {/* 图表库选择器 */}
      {showLibrarySelector && (
        <div className="chart-library-selector">
          <span className="selector-label">图表库:</span>
          <div className="library-buttons">
            {chartLibraries.map((lib) => (
              <button
                key={lib.id}
                className={`library-btn ${selectedLibrary === lib.id ? 'active' : ''}`}
                onClick={() => handleLibraryChange(lib.id)}
                title={lib.description}
              >
                <span className="library-icon">{lib.icon}</span>
                <span className="library-name">{lib.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 图表类型选择器 */}
      {showTypeSelector && (
        <div className="chart-type-selector-wrapper">
          <div className="chart-type-category">
            <span className="category-label">基础图表</span>
            <div className="chart-type-selector">
              {chartTypes.filter(t => t.category === 'basic').map((type) => {
                const isSupported = currentLibrary?.supportedTypes.includes(type.value);
                return (
                  <button
                    key={type.value}
                    className={`chart-type-btn ${inferredType === type.value ? 'active' : ''} ${!isSupported ? 'disabled' : ''}`}
                    onClick={() => isSupported && handleTypeChange(type.value)}
                    title={isSupported ? type.label : `${type.label} (当前库不支持)`}
                    disabled={!isSupported}
                  >
                    <span className="type-icon">{type.icon}</span>
                    <span className="type-label">{type.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="chart-type-category">
            <span className="category-label">高级图表</span>
            <div className="chart-type-selector">
              {chartTypes.filter(t => t.category === 'advanced').map((type) => {
                const isSupported = currentLibrary?.supportedTypes.includes(type.value);
                return (
                  <button
                    key={type.value}
                    className={`chart-type-btn ${inferredType === type.value ? 'active' : ''} ${!isSupported ? 'disabled' : ''}`}
                    onClick={() => isSupported && handleTypeChange(type.value)}
                    title={isSupported ? type.label : `${type.label} (当前库不支持)`}
                    disabled={!isSupported}
                  >
                    <span className="type-icon">{type.icon}</span>
                    <span className="type-label">{type.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 当前配置显示 */}
      <div className="chart-info-bar">
        <span className="info-item library-info">
          {currentLibrary?.icon} {currentLibrary?.name}
        </span>
        <span className="info-divider">•</span>
        <span className="info-item">{chartTypes.find((t) => t.value === inferredType)?.label}</span>
      </div>

      {/* 图表渲染 */}
      {renderChart()}

      {/* 数据统计 */}
      <div className="chart-stats">
        <span className="stat-item">共 {Array.isArray(chartData) ? chartData.length : 0} 条数据</span>
        <span className="stat-divider">|</span>
        <span className="stat-item">X轴: {inferredColumns.xCol}</span>
        <span className="stat-divider">|</span>
        <span className="stat-item">Y轴: {inferredColumns.yCol}</span>
      </div>

      <style jsx>{`
        .smart-chart-wrapper {
          background: var(--bg-secondary);
          border: 1px solid var(--border);
          border-radius: var(--radius-lg);
          padding: var(--space-md);
        }

        .chart-library-selector {
          display: flex;
          align-items: center;
          gap: var(--space-sm);
          margin-bottom: var(--space-md);
          padding-bottom: var(--space-md);
          border-bottom: 1px solid var(--border);
        }

        .selector-label {
          font-size: 0.85rem;
          color: var(--text-secondary);
        }

        .library-buttons {
          display: flex;
          gap: var(--space-xs);
        }

        .library-btn {
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 6px 12px;
          background: var(--bg-tertiary);
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          color: var(--text-secondary);
          font-size: 0.8rem;
          transition: all var(--transition-fast);
        }

        .library-btn:hover {
          background: var(--bg-hover);
          border-color: var(--accent);
          color: var(--text-primary);
        }

        .library-btn.active {
          background: var(--accent-glow);
          border-color: var(--accent);
          color: var(--accent);
        }

        .library-icon {
          font-size: 1rem;
        }

        .library-name {
          font-weight: 500;
        }

        .chart-type-selector-wrapper {
          display: flex;
          flex-direction: column;
          gap: var(--space-sm);
          margin-bottom: var(--space-md);
        }

        .chart-type-category {
          display: flex;
          flex-direction: column;
          gap: var(--space-xs);
        }

        .category-label {
          font-size: 0.75rem;
          color: var(--text-tertiary);
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .chart-type-selector {
          display: flex;
          flex-wrap: wrap;
          gap: var(--space-xs);
        }

        .chart-type-btn {
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 6px 10px;
          background: var(--bg-tertiary);
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          color: var(--text-secondary);
          font-size: 0.75rem;
          transition: all var(--transition-fast);
        }

        .chart-type-btn:hover:not(.disabled) {
          background: var(--bg-hover);
          border-color: var(--accent);
          color: var(--text-primary);
        }

        .chart-type-btn.active {
          background: var(--accent-glow);
          border-color: var(--accent);
          color: var(--accent);
        }

        .chart-type-btn.disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }

        .chart-info-bar {
          display: flex;
          align-items: center;
          gap: var(--space-sm);
          margin-bottom: var(--space-sm);
          padding: var(--space-xs) var(--space-sm);
          background: var(--bg-tertiary);
          border-radius: var(--radius-sm);
          font-size: 0.8rem;
        }

        .info-item {
          color: var(--text-secondary);
        }

        .library-info {
          color: var(--accent);
          font-weight: 500;
        }

        .info-divider {
          color: var(--text-tertiary);
        }

        .chart-stats {
          display: flex;
          align-items: center;
          gap: var(--space-sm);
          margin-top: var(--space-md);
          padding-top: var(--space-md);
          border-top: 1px solid var(--border);
          font-size: 0.8rem;
          color: var(--text-tertiary);
        }

        .stat-divider {
          color: var(--border);
        }

        .smart-chart-empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 200px;
          color: var(--text-tertiary);
        }

        .empty-icon {
          font-size: 3rem;
          margin-bottom: var(--space-sm);
        }

        .chart-loading {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 200px;
        }
      `}</style>
    </div>
  );
}

export {
  chartLibraries,
  chartTypes,
};
