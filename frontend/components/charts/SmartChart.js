'use client';

/**
 * 智能图表容器组件
 * 核心逻辑：
 * 1. 接收通用数据格式和配置参数
 * 2. 如果缺少图表类型、X轴、Y轴定义，使用内部规则智能推断
 * 3. 将标准配置传递给 EChartsRenderer 进行渲染
 * 4. 提供图表类型手动切换 UI，以及丰富的色彩主题切换
 */

import { useState, useMemo, useEffect } from 'react';
import EChartsRenderer, { inferChartType } from './EChartsRenderer';
import { DatabaseIcon, BarChartIcon, SettingsIcon } from '../Icons';

// 图表类型字典 (仅用于 UI 显示和切换器)
const chartTypes = [
  { value: 'bar', label: '柱状图', icon: '📊', category: 'basic' },
  { value: 'horizontal_bar', label: '条形图', icon: '📈', category: 'basic' },
  { value: 'line', label: '折线图', icon: '📉', category: 'basic' },
  { value: 'area', label: '面积图', icon: '⛰️', category: 'basic' },
  { value: 'pie', label: '饼图', icon: '🥧', category: 'basic' },
  { value: 'scatter', label: '散点图', icon: '⏺️', category: 'advanced' },
  { value: 'radar', label: '雷达图', icon: '🕸️', category: 'advanced' },
  { value: 'funnel', label: '漏斗图', icon: '🔻', category: 'advanced' },
  { value: 'gauge', label: '仪表盘', icon: '⏱️', category: 'advanced' },
  { value: 'heatmap', label: '热力图', icon: '🌡️', category: 'advanced' },
  { value: 'treemap', label: '树图', icon: '🌳', category: 'advanced' },
  { value: 'sunburst', label: '旭日图', icon: '☀️', category: 'advanced' },
  { value: 'boxplot', label: '箱线图', icon: '📦', category: 'advanced' },
  { value: 'wordcloud', label: '词云', icon: '☁️', category: 'advanced' },
  { value: 'polar_bar', label: '极坐标柱状图', icon: '🌀', category: 'advanced' },
  { value: 'waterfall', label: '瀑布图', icon: '💧', category: 'advanced' },
  { value: 'bullet', label: '子弹图', icon: '🎯', category: 'advanced' },
  { value: 'sankey', label: '桑基图', icon: '〰️', category: 'advanced' },
];

const colorThemesList = [
  { value: 'default', label: '默认蓝调', color: '#3b82f6' },
  { value: 'tableau', label: 'Tableau经典', color: '#4e79a7' },
  { value: 'material', label: 'Material质感', color: '#4285F4' },
  { value: 'antv', label: 'AntV商务', color: '#5B8FF9' },
  { value: 'warm', label: '暖色晚霞', color: '#f46d43' },
  { value: 'cool', label: '酷炫霓虹', color: '#00d2fc' },
  { value: 'fresh', label: '清新马卡龙', color: '#a8e6cf' },
  { value: 'forest', label: '青葱森林', color: '#2a9d8f' },
  { value: 'sunset', label: '日落余晖', color: '#f3722c' },
];

/**
 * 简单的 JSON 类型判断和解析
 */
function parseChartData(data) {
  if (typeof data === 'string') {
    try {
      return JSON.parse(data);
    } catch {
      return [];
    }
  }
  return data || [];
}

export default function SmartChart({
  data: rawData,
  chartType: explicitType,
  title,
  xCol,
  yCol,
  colorCol,
  sizeCol,
  height = 400,
}) {
  const [selectedType, setSelectedType] = useState(explicitType);
  const [selectedTheme, setSelectedTheme] = useState('default');

  const data = useMemo(() => parseChartData(rawData), [rawData]);

  // 监听外部推断类型如果发生了变化
  useEffect(() => {
    if (explicitType) {
      setSelectedType(explicitType);
    }
  }, [explicitType]);

  // 智能推断配置
  const chartConfig = useMemo(() => {
    if (data.type === 'chart_data' && data.data) {
      const actualData = data.data;
      if (!actualData || actualData.length === 0) return null;

      const keys = Object.keys(actualData[0] || {});
      const inferredXCol = data.xAxis || keys[0] || 'x';
      const inferredYCol = data.yAxis || keys[1] || 'y';

      return {
        chartType: data.chartType || inferChartType(actualData, inferredXCol, inferredYCol),
        xCol: inferredXCol,
        yCol: inferredYCol,
        title: data.title || '',
        colorCol: keys.length > 2 ? keys[2] : undefined,
      };
    }
    return null;
  }, [data]);

  // 最终使用的属性
  const actualData = data.type === 'chart_data' ? data.data : data;
  const inferredType =
    selectedType ||
    chartConfig?.chartType ||
    inferChartType(actualData, chartConfig?.xCol || xCol, chartConfig?.yCol || yCol);

  const config = {
    chartType: inferredType,
    xCol: chartConfig?.xCol || xCol || Object.keys(actualData[0] || {})[0],
    yCol: chartConfig?.yCol || yCol || Object.keys(actualData[0] || {})[1],
    title: chartConfig?.title || title,
    colorCol: chartConfig?.colorCol || colorCol,
    sizeCol: chartConfig?.sizeCol || sizeCol,
    colorTheme: selectedTheme,
  };

  const renderChart = () => {
    if (!actualData || actualData.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center p-8 bg-gray-50 border border-gray-200 rounded-xl text-gray-400">
          <DatabaseIcon size={32} className="mb-2 opacity-50" />
          <span className="text-sm">暂无有效格式的图表数据</span>
        </div>
      );
    }

    // 限制最大渲染条数，防止性能问题
    const limitedData = actualData.slice(0, 5000);

    const chartProps = {
      data: limitedData,
      config,
      height,
    };

    // 专注于一个稳定的高级图表引擎 ECharts
    return <EChartsRenderer {...chartProps} />;
  };

  const currentTypeMeta = chartTypes.find((t) => t.value === inferredType) || chartTypes[0];

  return (
    <div className="w-full bg-white rounded-xl overflow-hidden shadow-sm border border-gray-200 translate-z-0 transition-shadow hover:shadow-md group">
      {/* 智能工具栏：悬浮时显示或者默认置顶 */}
      {config.xCol && config.yCol && (
        <div className="flex items-center justify-between px-3 py-2 bg-gray-50/80 border-b border-gray-200 text-xs shadow-[inset_0_1px_0_rgba(255,255,255,0.5)]">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="flex items-center gap-1.5 shrink-0 bg-white px-2 py-1.5 rounded-md border border-gray-200 shadow-sm text-gray-700 font-medium hover:border-brand-300 transition-colors">
              <span>{currentTypeMeta?.icon}</span>
              <select
                value={inferredType}
                onChange={(e) => setSelectedType(e.target.value)}
                className="text-xs bg-transparent border-none focus:ring-0 cursor-pointer font-medium p-0 pr-4 truncate max-w-[100px]"
              >
                {chartTypes.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center text-gray-400 gap-1.5 truncate">
              <span className="shrink-0 bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded font-mono text-[10px]">X</span>
              <span className="truncate max-w-[80px]" title={config.xCol}>{config.xCol}</span>
              <span className="text-gray-300">|</span>
              <span className="shrink-0 bg-green-50 text-green-600 px-1.5 py-0.5 rounded font-mono text-[10px]">Y</span>
              <span className="truncate max-w-[80px]" title={config.yCol}>{config.yCol}</span>
            </div>
          </div>
          
          {/* 配色方案选择器 */}
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide shrink-0 ml-4 max-w-[200px]">
            {colorThemesList.map((theme) => (
              <button
                key={theme.value}
                className={`w-[18px] h-[18px] rounded-full border-2 transition-all ${
                  selectedTheme === theme.value ? 'scale-110 shadow-sm' : 'scale-90 opacity-60 hover:opacity-100 hover:scale-100'
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

      {/* 渲染区域 */}
      <div className="p-4 relative">
        {renderChart()}
      </div>
    </div>
  );
}
