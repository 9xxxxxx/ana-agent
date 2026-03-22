'use client';

/**
 * 智能图表容器组件
 * 核心逻辑：
 * 1. 接收通用数据格式和配置参数
 * 2. 如果缺少图表类型、X轴、Y轴定义，使用内部规则智能推断
 * 3. 将标准配置传递给 EChartsRenderer 进行渲染
 * 4. 提供图表类型手动切换 UI，以及丰富的色彩主题切换
 */

import { useState, useMemo, useEffect, useRef } from 'react';
import EChartsRenderer, { inferChartType } from './EChartsRenderer';
import { DatabaseIcon, BarChartIcon, SettingsIcon, SparklesIcon, ChevronDownIcon, CheckIcon } from '../Icons';

// 图表类型字典 (仅用于 UI 显示和切换器)
const chartTypes = [
  { value: 'table', label: '数据表格', icon: '📋', category: 'basic' },
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
  { value: 'polar_bar', label: '圆环柱图', icon: '🌀', category: 'advanced' },
  { value: 'waterfall', label: '瀑布图', icon: '💧', category: 'advanced' },
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
  readonly = false,
}) {
  const [selectedType, setSelectedType] = useState(explicitType);
  const [selectedTheme, setSelectedTheme] = useState('default');
  const [activeTab, setActiveTab] = useState(null); // 'type' | 'color' | null

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
    const renderChart = () => {
    if (!actualData || actualData.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center p-8 bg-gray-50 border border-gray-200 rounded-xl text-gray-400">
          <DatabaseIcon size={32} className="mb-2 opacity-50" />
          <span className="text-sm">暂无有效格式的图表数据</span>
        </div>
      );
    }

    // 表格视图渲染逻辑
    if (inferredType === 'table') {
      const columns = Object.keys(actualData[0] || {});
      return (
        <div className="w-full overflow-x-auto">
          <table className="w-full text-sm text-left border-collapse">
            <thead className="bg-gray-50 text-gray-600 font-medium border-b border-gray-200">
              <tr>
                {columns.map(col => (
                  <th key={col} className="px-4 py-2 whitespace-nowrap">{col}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {actualData.slice(0, 500).map((row, i) => (
                <tr key={i} className="hover:bg-gray-50/50 transition-colors">
                  {columns.map(col => (
                    <td key={col} className="px-4 py-2 text-gray-700 whitespace-nowrap">{String(row[col] ?? '')}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {actualData.length > 500 && (
            <div className="text-center py-2 text-xs text-gray-400">仅显示前 500 行，完整数据请导出</div>
          )}
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

    return <EChartsRenderer {...chartProps} />;
  };

  const currentTypeMeta = chartTypes.find((t) => t.value === inferredType) || chartTypes[0];

  return (
    <div className="w-full bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100 transition-all font-sans">
      
      {/* 极简顶栏 */}
      {config.xCol && config.yCol && !readonly && (
        <div className="flex flex-col border-b border-gray-100 bg-gray-50/30">
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="text-gray-500">{currentTypeMeta?.icon}</span>
              <span className="font-semibold text-[13px] text-gray-800 tracking-wide">{config.title || currentTypeMeta?.label || '数据可视化'}</span>
            </div>
            
            <div className="flex items-center gap-2">
              <button
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors border ${activeTab === 'type' ? 'bg-white border-gray-200 text-brand-600 shadow-sm' : 'border-transparent text-gray-600 hover:bg-gray-200/50'}`}
                onClick={() => setActiveTab(activeTab === 'type' ? null : 'type')}
              >
                <BarChartIcon size={14} />
                图表类型
              </button>
              <button
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors border ${activeTab === 'color' ? 'bg-white border-gray-200 text-brand-600 shadow-sm' : 'border-transparent text-gray-600 hover:bg-gray-200/50'}`}
                onClick={() => setActiveTab(activeTab === 'color' ? null : 'color')}
                disabled={inferredType === 'table'}
              >
                <SparklesIcon size={14} />
                配色方案
              </button>
            </div>
          </div>

          {/* 展开的平铺格栅内容 */}
          {activeTab === 'type' && (
            <div className="px-4 py-4 bg-white border-t border-gray-100 animate-in fade-in slide-in-from-top-1 duration-200">
              <div className="text-xs font-bold text-gray-400 mb-2.5">基本数据与图表</div>
              <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2 mb-5">
                {chartTypes.filter(t => t.category === 'basic').map(t => (
                  <button
                    key={t.value}
                    onClick={() => setSelectedType(t.value)}
                    className={`flex flex-col items-center justify-center p-2 rounded-xl border transition-all ${
                      inferredType === t.value 
                        ? 'bg-brand-50 border-brand-200 text-brand-700 shadow-sm' 
                        : 'bg-gray-50/50 border-gray-100 hover:bg-gray-100 hover:border-gray-200 text-gray-600'
                    }`}
                  >
                    <span className="text-[1.2rem] mb-1">{t.icon}</span>
                    <span className="text-[10px] font-medium leading-tight">{t.label}</span>
                  </button>
                ))}
              </div>
              <div className="text-xs font-bold text-gray-400 mb-2.5">高级复杂图表</div>
              <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
                {chartTypes.filter(t => t.category === 'advanced').map(t => (
                  <button
                    key={t.value}
                    onClick={() => { setSelectedType(t.value); if(t.value !== 'table' && !selectedTheme) setSelectedTheme('default'); }}
                    className={`flex flex-col items-center justify-center p-2 rounded-xl border transition-all ${
                      inferredType === t.value 
                        ? 'bg-brand-50 border-brand-200 text-brand-700 shadow-sm' 
                        : 'bg-gray-50/50 border-gray-100 hover:bg-gray-100 hover:border-gray-200 text-gray-600'
                    }`}
                  >
                    <span className="text-[1.2rem] mb-1">{t.icon}</span>
                    <span className="text-[10px] font-medium leading-tight text-center">{t.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'color' && (
            <div className="px-4 py-4 bg-white border-t border-gray-100 animate-in fade-in slide-in-from-top-1 duration-200">
              <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-9 gap-2">
                {colorThemesList.map(t => (
                  <button
                    key={t.value}
                    onClick={() => setSelectedTheme(t.value)}
                    className={`flex flex-col items-center justify-center p-2.5 rounded-xl border transition-all ${
                      selectedTheme === t.value 
                        ? 'bg-gray-50 border-gray-300 shadow-sm text-gray-800' 
                        : 'border-transparent hover:bg-gray-50 hover:border-gray-200 text-gray-500'
                    }`}
                  >
                    <div className="w-6 h-6 rounded-full mb-1.5 shadow-sm ring-1 ring-black/5" style={{ backgroundColor: t.color }} />
                    <span className="text-[10px] font-medium leading-tight text-center">{t.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 渲染区域 */}
      <div className={`relative bg-white ${inferredType !== 'table' ? 'p-3' : 'p-0'}`}>
        {renderChart()}
      </div>
    </div>
  );
}
