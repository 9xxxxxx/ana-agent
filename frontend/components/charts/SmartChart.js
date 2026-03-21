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
      'wordcloud', 'polar_bar', 'waterfall', 'sankey'
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
  { value: 'sankey', label: '桑基图', icon: '〰️', category: 'advanced' },
];

const colorThemesList = [
  { value: 'default', label: '默认配色', color: '#3b82f6' },
  { value: 'warm', label: '温润柔和', color: '#f46d43' },
  { value: 'cool', label: '酷炫科技', color: '#0ad59e' },
  { value: 'fresh', label: '清新简洁', color: '#a8e6cf' },
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
  const [selectedTheme, setSelectedTheme] = useState('default');

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
      <div className="flex flex-col items-center justify-center h-[200px] text-gray-400 bg-gray-50 border border-gray-100 rounded-xl my-4">
        <span className="text-4xl mb-2 opacity-50">📊</span>
        <span className="text-sm">暂无图表数据</span>
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
    colorTheme: selectedTheme,
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

    switch (effectiveLibrary) {
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
    <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm w-full">
      {/* 图表库选择器 */}
      {showLibrarySelector && (
        <div className="flex items-center gap-3 mb-4 pb-4 border-b border-gray-100 overflow-x-auto">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider shrink-0">引擎</span>
          <div className="flex gap-2 shrink-0">
            {chartLibraries.map((lib) => (
              <button
                key={lib.id}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                  selectedLibrary === lib.id 
                    ? 'bg-brand-50 border-brand-200 text-brand-700' 
                    : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
                }`}
                onClick={() => handleLibraryChange(lib.id)}
                title={lib.description}
              >
                <span>{lib.icon}</span>
                <span>{lib.name}</span>
              </button>
            ))}
          </div>
          
          {/* 配色方案选择器 */}
          <div className="flex items-center gap-1 border-l border-gray-100 pl-3 ml-1 shrink-0">
            {colorThemesList.map((theme) => (
              <button
                key={theme.value}
                className={`w-5 h-5 rounded-full border-2 transition-transform ${
                  selectedTheme === theme.value ? 'scale-110 shadow-sm' : 'scale-90 opacity-70 hover:opacity-100 hover:scale-100'
                }`}
                style={{
                  backgroundColor: theme.color,
                  borderColor: selectedTheme === theme.value ? '#374151' : 'transparent'
                }}
                onClick={() => setSelectedTheme(theme.value)}
                title={theme.label}
              />
            ))}
          </div>
        </div>
      )}

      {/* 图表类型选择器 */}
      {showTypeSelector && (
        <div className="flex flex-col gap-3 mb-5">
          <div className="flex flex-col gap-1.5">
            <span className="text-[0.65rem] text-gray-400 uppercase tracking-widest font-semibold px-1">基础图表</span>
            <div className="flex flex-wrap gap-1.5">
              {chartTypes.filter(t => t.category === 'basic').map((type) => {
                const isSupported = currentLibrary?.supportedTypes.includes(type.value);
                return (
                  <button
                    key={type.value}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs transition-colors border ${
                      inferredType === type.value 
                        ? 'bg-brand-500 border-brand-500 text-white shadow-sm' 
                        : isSupported 
                          ? 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300' 
                          : 'bg-gray-50 border-gray-100 text-gray-300 cursor-not-allowed hidden'
                    }`}
                    onClick={() => isSupported && handleTypeChange(type.value)}
                    title={isSupported ? type.label : `${type.label} (当前库不支持)`}
                    disabled={!isSupported}
                  >
                    <span>{type.icon}</span>
                    <span>{type.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
          
          <div className="flex flex-col gap-1.5">
            <span className="text-[0.65rem] text-gray-400 uppercase tracking-widest font-semibold px-1">高级图表</span>
            <div className="flex flex-wrap gap-1.5">
              {chartTypes.filter(t => t.category === 'advanced').map((type) => {
                const isSupported = currentLibrary?.supportedTypes.includes(type.value);
                return (
                  <button
                    key={type.value}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs transition-colors border ${
                      inferredType === type.value 
                        ? 'bg-brand-500 border-brand-500 text-white shadow-sm' 
                        : isSupported 
                          ? 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300' 
                          : 'bg-gray-50 border-gray-100 text-gray-300 cursor-not-allowed hidden'
                    }`}
                    onClick={() => isSupported && handleTypeChange(type.value)}
                    title={isSupported ? type.label : `${type.label} (当前库不支持)`}
                    disabled={!isSupported}
                  >
                    <span>{type.icon}</span>
                    <span>{type.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 当前配置显示 */}
      <div className="flex items-center gap-2 mb-4 px-3 py-2 bg-gray-50 rounded-lg text-xs border border-gray-100">
        <span className="font-semibold text-brand-600 flex items-center gap-1">
          {currentLibrary?.icon} {currentLibrary?.name}
        </span>
        <span className="text-gray-300">•</span>
        <span className="text-gray-600">{chartTypes.find((t) => t.value === inferredType)?.label}</span>
      </div>

      {/* 图表渲染 */}
      <div className="w-full relative z-0">
        {renderChart()}
      </div>

      {/* 数据统计 */}
      <div className="flex flex-wrap items-center gap-3 mt-5 pt-4 border-t border-gray-100 text-[0.7rem] text-gray-400">
        <span>共 <span className="font-medium text-gray-600">{Array.isArray(chartData) ? chartData.length : 0}</span> 条记录</span>
        <span className="text-gray-200">|</span>
        <span className="flex items-center gap-1">
          <span className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-500">X轴</span>
          <span className="truncate max-w-[100px]" title={inferredColumns.xCol}>{inferredColumns.xCol || '未定'}</span>
        </span>
        <span className="text-gray-200">|</span>
        <span className="flex items-center gap-1">
          <span className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-500">Y轴</span>
          <span className="truncate max-w-[100px]" title={inferredColumns.yCol}>{inferredColumns.yCol || '未定'}</span>
        </span>
      </div>
    </div>
  );
}

export {
  chartLibraries,
  chartTypes,
};
