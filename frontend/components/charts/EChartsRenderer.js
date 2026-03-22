'use client';

/**
 * ECharts 图表生成器
 * 支持智能图表类型推断、酷炫动画和精美主题
 */

import { useEffect, useRef } from 'react';
import * as echarts from 'echarts';

// 内置多套图表超级配色方案 (Color Themes) 结合业界 BI 最佳实践
const colorThemes = {
  default: ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899', '#14b8a6'],
  tableau: ['#4e79a7', '#f28e2c', '#e15759', '#76b7b2', '#59a14f', '#edc949', '#af7aa1', '#ff9da7', '#9c755f', '#bab0ab'],
  material: ['#4285F4', '#DB4437', '#F4B400', '#0F9D58', '#AB47BC', '#00ACC1', '#FF7043', '#9E9D24'],
  antv: ['#5B8FF9', '#5AD8A6', '#5D7092', '#F6BD16', '#E8684A', '#6DC8EC', '#9270CA', '#FF9D4D', '#269A99', '#FF99C3'],
  warm: ['#fc8d62', '#e78ac3', '#ffd92f', '#e5c494', '#f46d43', '#fdae61', '#fee08b', '#abdda4'], // 温润柔和
  cool: ['#00b8a9', '#f6416c', '#3fc1c9', '#364f6b', '#7a42f4', '#00d2fc', '#0ad59e', '#fc5185'],  // 酷炫科技
  fresh: ['#a8e6cf', '#dcedc1', '#ffd3b6', '#ffaaa5', '#76b4bd', '#5c969e', '#f3e8cb', '#c5e3f6'], // 清新简洁
  forest: ['#2a9d8f', '#e9c46a', '#f4a261', '#e76f51', '#386641', '#6a994e', '#a7c957', '#bc4749'],  // 青葱森林
  sunset: ['#f94144', '#f3722c', '#f8961e', '#f9c74f', '#90be6d', '#43aa8b', '#577590', '#277da1']   // 晚霞余晖
};

// 亮色主题配置（适配白色背景）
const chartTheme = {
  backgroundColor: 'transparent',
  textStyle: {
    color: '#374151',
    fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  title: {
    textStyle: {
      color: '#111827',
      fontSize: 16,
      fontWeight: 600,
    },
    left: 'center',
    top: 10,
  },
  legend: {
    textStyle: {
      color: '#6b7280',
    },
    pageTextStyle: {
      color: '#6b7280',
    },
  },
  tooltip: {
    backgroundColor: 'rgba(255, 255, 255, 0.96)',
    borderColor: '#e5e7eb',
    borderWidth: 1,
    textStyle: {
      color: '#374151',
    },
    extraCssText: 'box-shadow: 0 4px 20px rgba(0, 0, 0, 0.12); border-radius: 8px;',
  },
  grid: {
    left: '3%',
    right: '4%',
    bottom: '3%',
    top: 60,
    containLabel: true,
  },
  xAxis: {
    axisLine: {
      lineStyle: { color: '#d1d5db' },
    },
    axisLabel: {
      color: '#6b7280',
    },
    splitLine: {
      lineStyle: { color: '#f3f4f6' },
    },
  },
  yAxis: {
    axisLine: {
      lineStyle: { color: '#d1d5db' },
    },
    axisLabel: {
      color: '#6b7280',
    },
    splitLine: {
      lineStyle: { color: '#f3f4f6' },
    },
  },
};

// 渐变色配置
const gradientColors = [
  ['#3b82f6', '#8b5cf6'], // 蓝紫渐变
  ['#10b981', '#34d399'], // 绿色渐变
  ['#f59e0b', '#fbbf24'], // 橙色渐变
  ['#ef4444', '#f87171'], // 红色渐变
  ['#8b5cf6', '#a78bfa'], // 紫色渐变
  ['#06b6d4', '#22d3ee'], // 青色渐变
  ['#ec4899', '#f472b6'], // 粉色渐变
  ['#14b8a6', '#2dd4bf'], // 青绿渐变
];

// 动画配置
const animationConfig = {
  animation: true,
  animationDuration: 1000,
  animationEasing: 'cubicOut',
  animationDelay: (idx) => idx * 100,
};

/**
 * 智能推断图表类型
 */
export function inferChartType(data, xCol, yCol) {
  if (!data || data.length === 0) return 'bar';

  // 检测是否为特定的图表格式（如桑基图的节点-连线特性）
  if (data[0].source && data[0].target && data[0].value !== undefined) {
    return 'sankey';
  }

  const xValues = data.map((d) => d[xCol]);
  const yValues = data.map((d) => d[yCol]);

  // 检查是否是时间序列
  const isTimeSeries = xValues.every((v) => {
    const date = new Date(v);
    return !isNaN(date.getTime());
  });

  // 检查数据量
  const dataCount = data.length;

  // 检查 Y 值类型
  const isAllPositive = yValues.every((v) => v >= 0);
  const hasNegative = yValues.some((v) => v < 0);

  // 推断逻辑
  if (isTimeSeries && dataCount > 10) {
    return 'line'; // 时间序列用折线图
  }

  if (dataCount <= 6 && isAllPositive && !hasNegative) {
    return 'pie'; // 少量数据且全正数用饼图
  }

  if (dataCount > 20) {
    return 'line'; // 大量数据用折线图
  }

  return 'bar'; // 默认柱状图
}

/**
 * 数据按 X 轴分类对齐辅助函数
 */
function alignDataToCategories(items, xCategories, xCol, yCol, emptyValue = 0) {
  return xCategories.map(xCat => {
    // 注意：转为字符串进行比对
    const match = items.find(d => String(d[xCol]) === String(xCat));
    return match ? match[yCol] : emptyValue;
  });
}

/**
 * 智能判断是否进行分组
 */
function getGroupedData(data, colorCol, title) {
  if (!colorCol) return { [title || 'Value']: data };
  const uniqueColors = new Set(data.map(d => d[colorCol]));
  // 如果用作颜色的列其唯一值数量等于数据总量，或者大于20，则没有分组意义（例如误用了 ID、销量数值作为色标）
  if (uniqueColors.size === data.length || uniqueColors.size > 20) {
    return { [title || 'Value']: data };
  }
  return data.reduce((acc, d) => {
    const key = d[colorCol];
    if (!acc[key]) acc[key] = [];
    acc[key].push(d);
    return acc;
  }, {});
}

/**
 * 生成柱状图配置
 */
function generateBarOption(data, xCol, yCol, title, colorCol, defaultColors) {
  const grouped = getGroupedData(data, colorCol, title);
  const xCategories = [...new Set(data.map((d) => d[xCol]))];
  const isSingleSeries = Object.keys(grouped).length === 1;

  const series = Object.entries(grouped).map(([key, items], idx) => ({
    name: key,
    type: 'bar',
    data: alignDataToCategories(items, xCategories, xCol, yCol, 0),
    barMaxWidth: 50,
    itemStyle: {
      borderRadius: [6, 6, 0, 0],
      color: isSingleSeries 
        ? (params) => {
            // 单一系列时，让每根柱子五颜六色
            const colorIdx = params.dataIndex % defaultColors.length;
            return new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: defaultColors[colorIdx] },
              { offset: 1, color: defaultColors[colorIdx] + '80' },
            ]);
          }
        : new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: defaultColors[idx % defaultColors.length] },
            { offset: 1, color: defaultColors[idx % defaultColors.length] + '80' },
          ]),
    },
    emphasis: {
      itemStyle: {
        shadowBlur: 20,
        shadowColor: 'rgba(0, 0, 0, 0.5)',
      },
    },
    ...animationConfig,
  }));

  return {
    ...chartTheme,
    title: { ...chartTheme.title, text: title },
    tooltip: {
      ...chartTheme.tooltip,
      trigger: 'axis',
      axisPointer: {
        type: 'shadow',
        shadowStyle: {
          color: 'rgba(59, 130, 246, 0.1)',
        },
      },
    },
    legend: { ...chartTheme.legend, top: 35 },
    xAxis: {
      ...chartTheme.xAxis,
      type: 'category',
      data: xCategories,
      axisLabel: {
        ...chartTheme.xAxis.axisLabel,
        rotate: data.length > 8 ? 30 : 0,
      },
    },
    yAxis: {
      ...chartTheme.yAxis,
      type: 'value',
    },
    series,
    grid: { ...chartTheme.grid, bottom: data.length > 8 ? 60 : 40 },
  };
}

/**
 * 生成折线图配置
 */
function generateLineOption(data, xCol, yCol, title, colorCol, defaultColors) {
  const grouped = getGroupedData(data, colorCol, title);
  const xCategories = [...new Set(data.map((d) => d[xCol]))];

  const series = Object.entries(grouped).map(([key, items], idx) => ({
    name: key,
    type: 'line',
    data: alignDataToCategories(items, xCategories, xCol, yCol, null),
    smooth: true,
    symbol: 'circle',
    symbolSize: 8,
    lineStyle: {
      width: 3,
      color: defaultColors[idx % defaultColors.length],
    },
    itemStyle: {
      color: defaultColors[idx % defaultColors.length],
      borderWidth: 2,
      borderColor: '#fff',
    },
    areaStyle: {
      color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
        { offset: 0, color: `${defaultColors[idx % defaultColors.length]}40` },
        { offset: 1, color: `${defaultColors[idx % defaultColors.length]}05` },
      ]),
    },
    emphasis: {
      focus: 'series',
      itemStyle: {
        shadowBlur: 10,
        shadowColor: defaultColors[idx % defaultColors.length],
      },
    },
    ...animationConfig,
  }));

  return {
    ...chartTheme,
    title: { ...chartTheme.title, text: title },
    tooltip: {
      ...chartTheme.tooltip,
      trigger: 'axis',
      axisPointer: {
        type: 'cross',
        lineStyle: {
          color: '#3b82f6',
          width: 1,
          type: 'dashed',
        },
      },
    },
    legend: { ...chartTheme.legend, top: 35 },
    xAxis: {
      ...chartTheme.xAxis,
      type: 'category',
      data: xCategories,
      boundaryGap: false,
    },
    yAxis: {
      ...chartTheme.yAxis,
      type: 'value',
    },
    series,
  };
}

/**
 * 生成饼图配置
 */
function generatePieOption(data, xCol, yCol, title, defaultColors) {
  const pieData = data.map((d, idx) => ({
    name: d[xCol],
    value: d[yCol],
    itemStyle: {
      color: new echarts.graphic.LinearGradient(0, 0, 1, 1, [
        { offset: 0, color: defaultColors[idx % defaultColors.length] },
        { offset: 1, color: defaultColors[idx % defaultColors.length] + '80' },
      ]),
    },
  }));

  return {
    ...chartTheme,
    title: { ...chartTheme.title, text: title },
    tooltip: {
      ...chartTheme.tooltip,
      trigger: 'item',
      formatter: '{b}: {c} ({d}%)',
    },
    legend: {
      ...chartTheme.legend,
      orient: 'vertical',
      right: 20,
      top: 'center',
    },
    series: [
      {
        name: title,
        type: 'pie',
        radius: ['40%', '70%'],
        center: ['40%', '50%'],
        avoidLabelOverlap: true,
        itemStyle: {
          borderRadius: 8,
          borderColor: '#e5e7eb',
          borderWidth: 2,
        },
        label: {
          show: true,
          position: 'outside',
          formatter: '{b}\n{d}%',
          color: '#6b7280',
        },
        labelLine: {
          show: true,
          lineStyle: {
            color: '#9ca3af',
          },
        },
        emphasis: {
          label: {
            show: true,
            fontSize: 14,
            fontWeight: 'bold',
          },
          itemStyle: {
            shadowBlur: 20,
            shadowOffsetX: 0,
            shadowColor: 'rgba(0, 0, 0, 0.5)',
          },
        },
        data: pieData,
        ...animationConfig,
      },
    ],
  };
}

/**
 * 生成散点图配置
 */
function generateScatterOption(data, xCol, yCol, title, colorCol, sizeCol, defaultColors) {
  const grouped = getGroupedData(data, colorCol, title);

  const series = Object.entries(grouped).map(([key, items], idx) => ({
    name: key,
    type: 'scatter',
    data: items.map((d) => [d[xCol], d[yCol], sizeCol ? d[sizeCol] : 20]),
    symbolSize: sizeCol ? (val) => Math.sqrt(val[2]) * 2 : 15,
    itemStyle: {
      color: defaultColors[idx % defaultColors.length],
      opacity: 0.8,
    },
    emphasis: {
      itemStyle: {
        shadowBlur: 15,
        shadowColor: defaultColors[idx % defaultColors.length],
      },
    },
    ...animationConfig,
  }));

  return {
    ...chartTheme,
    title: { ...chartTheme.title, text: title },
    tooltip: {
      ...chartTheme.tooltip,
      trigger: 'item',
      formatter: (params) => `${xCol}: ${params.data[0]}<br/>${yCol}: ${params.data[1]}`,
    },
    legend: { ...chartTheme.legend, top: 35 },
    xAxis: {
      ...chartTheme.xAxis,
      type: 'value',
      name: xCol,
      nameTextStyle: { color: '#6b7280' },
    },
    yAxis: {
      ...chartTheme.yAxis,
      type: 'value',
      name: yCol,
      nameTextStyle: { color: '#6b7280' },
    },
    series,
  };
}

/**
 * 生成雷达图配置
 */
function generateRadarOption(data, xCol, yCol, title, defaultColors) {
  const indicators = data.map((d) => ({
    name: d[xCol],
    max: Math.max(...data.map((item) => item[yCol])) * 1.2,
  }));

  return {
    ...chartTheme,
    title: { ...chartTheme.title, text: title },
    tooltip: { ...chartTheme.tooltip },
    radar: {
      indicator: indicators,
      shape: 'polygon',
      splitNumber: 5,
      axisName: {
        color: '#6b7280',
      },
      splitLine: {
        lineStyle: {
          color: '#334155',
        },
      },
      splitArea: {
        areaStyle: {
          color: ['rgba(59, 130, 246, 0.05)', 'rgba(59, 130, 246, 0.1)'],
        },
      },
      axisLine: {
        lineStyle: {
          color: '#334155',
        },
      },
    },
    series: [
      {
        name: title,
        type: 'radar',
        data: [
          {
            value: data.map((d) => d[yCol]),
            name: title,
            areaStyle: {
              color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                { offset: 0, color: `${defaultColors[0]}60` },
                { offset: 1, color: `${defaultColors[0]}20` },
              ]),
            },
            lineStyle: {
              color: defaultColors[0],
              width: 2,
            },
            itemStyle: {
              color: defaultColors[0],
            },
          },
        ],
        ...animationConfig,
      },
    ],
  };
}

/**
 * 生成漏斗图配置
 */
function generateFunnelOption(data, xCol, yCol, title, defaultColors) {
  const funnelData = data.map((d, idx) => ({
    name: d[xCol],
    value: d[yCol],
    itemStyle: {
      color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
        { offset: 0, color: defaultColors[idx % defaultColors.length] },
        { offset: 1, color: defaultColors[idx % defaultColors.length] + '80' },
      ]),
    },
  }));

  return {
    ...chartTheme,
    title: { ...chartTheme.title, text: title },
    tooltip: {
      ...chartTheme.tooltip,
      trigger: 'item',
      formatter: '{b}: {c}',
    },
    series: [
      {
        name: title,
        type: 'funnel',
        left: '10%',
        top: 60,
        bottom: 20,
        width: '80%',
        min: 0,
        max: Math.max(...data.map((d) => d[yCol])),
        minSize: '20%',
        maxSize: '100%',
        sort: 'descending',
        gap: 4,
        label: {
          show: true,
          position: 'inside',
          color: '#fff',
          formatter: '{b}',
        },
        labelLine: {
          length: 10,
          lineStyle: {
            width: 1,
            type: 'solid',
          },
        },
        itemStyle: {
          borderColor: '#e5e7eb',
          borderWidth: 1,
        },
        emphasis: {
          label: {
            fontSize: 14,
          },
        },
        data: funnelData,
        ...animationConfig,
      },
    ],
  };
}

/**
 * 生成仪表盘配置
 */
function generateGaugeOption(data, xCol, yCol, title, defaultColors) {
  const value = data[0]?.[yCol] || 0;

  return {
    ...chartTheme,
    title: { ...chartTheme.title, text: title },
    series: [
      {
        type: 'gauge',
        center: ['50%', '60%'],
        radius: '80%',
        startAngle: 200,
        endAngle: -20,
        min: 0,
        max: 100,
        splitNumber: 10,
        itemStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
            { offset: 0, color: defaultColors[2] },
            { offset: 0.5, color: defaultColors[3] },
            { offset: 1, color: defaultColors[4] },
          ]),
        },
        progress: {
          show: true,
          width: 20,
        },
        pointer: {
          show: true,
          length: '60%',
          width: 8,
          itemStyle: {
            color: defaultColors[0],
          },
        },
        axisLine: {
          lineStyle: {
            width: 20,
            color: [[1, '#1e293b']],
          },
        },
        axisTick: {
          show: false,
        },
        splitLine: {
          length: 12,
          lineStyle: {
            width: 2,
            color: '#9ca3af',
          },
        },
        axisLabel: {
          distance: 30,
          color: '#6b7280',
          fontSize: 12,
        },
        anchor: {
          show: true,
          showAbove: true,
          size: 20,
          itemStyle: {
            borderWidth: 8,
            borderColor: defaultColors[0],
            color: '#e5e7eb',
          },
        },
        title: {
          show: true,
          offsetCenter: [0, '80%'],
          color: '#6b7280',
          fontSize: 14,
        },
        detail: {
          valueAnimation: true,
          fontSize: 36,
          fontWeight: 'bold',
          offsetCenter: [0, '50%'],
          color: '#374151',
          formatter: '{value}',
        },
        data: [{ value: Math.round(value), name: data[0]?.[xCol] || '' }],
        ...animationConfig,
      },
    ],
  };
}

/**
 * 生成热力图配置
 */
function generateHeatmapOption(data, xCol, yCol, title, colorCol, defaultColors) {
  const xCategories = [...new Set(data.map((d) => d[xCol]))];
  const yCategories = colorCol ? [...new Set(data.map((d) => d[colorCol]))] : [yCol];
  
  const heatmapData = data.map((d) => {
    const xIdx = xCategories.indexOf(d[xCol]);
    const yIdx = colorCol ? yCategories.indexOf(d[colorCol]) : 0;
    return [xIdx, yIdx, d[yCol]];
  });

  const maxValue = Math.max(...data.map((d) => d[yCol]));

  return {
    ...chartTheme,
    title: { ...chartTheme.title, text: title },
    tooltip: {
      ...chartTheme.tooltip,
      position: 'top',
      formatter: (params) => {
        return `${xCategories[params.data[0]]}<br/>${yCategories[params.data[1]]}: ${params.data[2]}`;
      },
    },
    grid: { ...chartTheme.grid, top: 60, right: 80 },
    xAxis: {
      ...chartTheme.xAxis,
      type: 'category',
      data: xCategories,
      splitArea: { show: true },
    },
    yAxis: {
      ...chartTheme.yAxis,
      type: 'category',
      data: yCategories,
      splitArea: { show: true },
    },
    visualMap: {
      min: 0,
      max: maxValue,
      calculable: true,
      orient: 'vertical',
      right: 10,
      top: 'center',
      inRange: {
        color: defaultColors,
      },
      textStyle: {
        color: '#6b7280',
      },
    },
    series: [
      {
        name: title,
        type: 'heatmap',
        data: heatmapData,
        label: {
          show: true,
          color: '#374151',
          fontSize: 10,
        },
        emphasis: {
          itemStyle: {
            shadowBlur: 10,
            shadowColor: 'rgba(0, 0, 0, 0.5)',
          },
        },
        ...animationConfig,
      },
    ],
  };
}

/**
 * 生成树图配置
 */
function generateTreemapOption(data, xCol, yCol, title, defaultColors) {
  const treemapData = data.map((d, idx) => ({
    name: d[xCol],
    value: d[yCol],
    itemStyle: {
      color: defaultColors[idx % defaultColors.length],
    },
  }));

  return {
    ...chartTheme,
    title: { ...chartTheme.title, text: title },
    tooltip: {
      ...chartTheme.tooltip,
      trigger: 'item',
      formatter: '{b}: {c}',
    },
    series: [
      {
        name: title,
        type: 'treemap',
        width: '90%',
        height: '80%',
        top: 60,
        roam: false,
        nodeClick: 'link',
        breadcrumb: {
          show: true,
          itemStyle: {
            color: defaultColors[0],
            borderColor: defaultColors[0],
          },
        },
        label: {
          show: true,
          formatter: '{b}\n{c}',
          color: '#fff',
          fontSize: 12,
        },
        upperLabel: {
          show: true,
          height: 30,
          color: '#fff',
        },
        itemStyle: {
          borderColor: '#e5e7eb',
          borderWidth: 2,
          gapWidth: 2,
        },
        levels: [
          {
            itemStyle: {
              borderWidth: 0,
              borderColor: '#334155',
            },
          },
          {
            itemStyle: {
              borderWidth: 2,
              borderColor: '#334155',
              gapWidth: 2,
            },
          },
        ],
        data: treemapData,
        ...animationConfig,
      },
    ],
  };
}

/**
 * 生成旭日图配置
 */
function generateSunburstOption(data, xCol, yCol, title, defaultColors) {
  const sunburstData = data.map((d, idx) => ({
    name: d[xCol],
    value: d[yCol],
    itemStyle: {
      color: defaultColors[idx % defaultColors.length],
    },
  }));

  return {
    ...chartTheme,
    title: { ...chartTheme.title, text: title },
    tooltip: {
      ...chartTheme.tooltip,
      trigger: 'item',
      formatter: '{b}: {c} ({d}%)',
    },
    series: [
      {
        type: 'sunburst',
        data: sunburstData,
        radius: ['15%', '90%'],
        center: ['50%', '55%'],
        sort: 'desc',
        emphasis: {
          focus: 'ancestor',
          itemStyle: {
            shadowBlur: 20,
            shadowColor: 'rgba(0, 0, 0, 0.5)',
          },
        },
        levels: [
          {},
          {
            r0: '15%',
            r: '45%',
            itemStyle: {
              borderWidth: 2,
              borderColor: '#e5e7eb',
            },
            label: {
              rotate: 'tangential',
              color: '#fff',
            },
          },
          {
            r0: '45%',
            r: '90%',
            itemStyle: {
              borderWidth: 2,
              borderColor: '#e5e7eb',
            },
            label: {
              position: 'outside',
              padding: 3,
              silent: false,
              color: '#6b7280',
            },
          },
        ],
        ...animationConfig,
      },
    ],
  };
}

/**
 * 生成箱线图配置
 */
function generateBoxplotOption(data, xCol, yCol, title, colorCol, defaultColors) {
  const groupCol = colorCol || xCol;
  
  const grouped = data.reduce((acc, d) => {
    const key = d[groupCol] || 'Unknown';
    if (!acc[key]) acc[key] = [];
    const val = Number(d[yCol]);
    if (!isNaN(val)) {
      acc[key].push(val);
    }
    return acc;
  }, {});

  const categories = Object.keys(grouped);
  const boxplotData = categories.map((key) => {
    const values = grouped[key];
    if (values.length === 0) return [0, 0, 0, 0, 0];
    const sorted = [...values].sort((a, b) => a - b);
    const q1 = sorted[Math.floor(sorted.length * 0.25)];
    const q2 = sorted[Math.floor(sorted.length * 0.5)];
    const q3 = sorted[Math.floor(sorted.length * 0.75)];
    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    return [min, q1, q2, q3, max];
  });

  return {
    ...chartTheme,
    title: { ...chartTheme.title, text: title },
    tooltip: {
      ...chartTheme.tooltip,
      trigger: 'item',
      formatter: (params) => {
        return `${params.name}<br/>最小: ${params.data[1]}<br/>Q1: ${params.data[2]}<br/>中位数: ${params.data[3]}<br/>Q3: ${params.data[4]}<br/>最大: ${params.data[5]}`;
      },
    },
    grid: { ...chartTheme.grid, bottom: 60 },
    xAxis: {
      ...chartTheme.xAxis,
      type: 'category',
      data: categories,
      boundaryGap: true,
      axisLabel: {
        ...chartTheme.xAxis.axisLabel,
        rotate: categories.length > 8 ? 30 : 0,
      },
    },
    yAxis: {
      ...chartTheme.yAxis,
      type: 'value',
    },
    series: [
      {
        name: title,
        type: 'boxplot',
        data: boxplotData,
        itemStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: defaultColors[0] },
            { offset: 1, color: defaultColors[1] },
          ]),
          borderColor: defaultColors[0],
          borderWidth: 2,
        },
        emphasis: {
          itemStyle: {
            shadowBlur: 10,
            shadowColor: `${defaultColors[0]}80`,
          },
        },
        ...animationConfig,
      },
    ],
  };
}

/**
 * 生成词云图配置 (简化版 - 使用气泡图模拟)
 */
function generateWordcloudOption(data, xCol, yCol, title, defaultColors) {
  const maxValue = Math.max(...data.map((d) => d[yCol]));
  
  const wordcloudData = data.map((d, idx) => ({
    name: d[xCol],
    value: d[yCol],
    symbolSize: (d[yCol] / maxValue) * 60 + 20,
    itemStyle: {
      color: defaultColors[idx % defaultColors.length],
    },
    x: (idx % 5) * 150 + 100,
    y: Math.floor(idx / 5) * 80 + 50,
  }));

  return {
    ...chartTheme,
    title: { ...chartTheme.title, text: title },
    tooltip: {
      ...chartTheme.tooltip,
      trigger: 'item',
      formatter: '{b}: {c}',
    },
    xAxis: { show: false, type: 'value' },
    yAxis: { show: false, type: 'value' },
    grid: { ...chartTheme.grid, left: 0, right: 0, top: 60, bottom: 0 },
    series: [
      {
        type: 'scatter',
        data: wordcloudData,
        symbol: 'circle',
        symbolSize: (val) => val[2],
        label: {
          show: true,
          formatter: '{b}',
          position: 'inside',
          color: '#fff',
          fontSize: 12,
          fontWeight: 'bold',
        },
        emphasis: {
          itemStyle: {
            shadowBlur: 20,
            shadowColor: 'rgba(0, 0, 0, 0.5)',
          },
        },
        ...animationConfig,
      },
    ],
  };
}

/**
 * 生成极坐标柱状图配置
 */
function generatePolarBarOption(data, xCol, yCol, title, defaultColors) {
  return {
    ...chartTheme,
    title: { ...chartTheme.title, text: title },
    tooltip: {
      ...chartTheme.tooltip,
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
    },
    polar: {
      radius: [30, '75%'],
    },
    angleAxis: {
      max: Math.max(...data.map((d) => d[yCol])) * 1.2,
      startAngle: 90,
      splitLine: {
        lineStyle: { color: '#334155' },
      },
      axisLine: {
        lineStyle: { color: '#334155' },
      },
      axisLabel: { color: '#6b7280' },
    },
    radiusAxis: {
      type: 'category',
      data: data.map((d) => d[xCol]),
      splitLine: {
        lineStyle: { color: '#f3f4f6' },
      },
      axisLine: {
        lineStyle: { color: '#334155' },
      },
      axisLabel: { color: '#6b7280' },
    },
    series: [
      {
        type: 'bar',
        data: data.map((d, idx) => ({
          value: d[yCol],
          itemStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
              { offset: 0, color: defaultColors[idx % defaultColors.length] },
              { offset: 1, color: defaultColors[idx % defaultColors.length] + '80' },
            ]),
            borderRadius: 4,
          },
        })),
        coordinateSystem: 'polar',
        name: title,
        ...animationConfig,
      },
    ],
  };
}

/**
 * 生成面积图配置
 */
function generateAreaOption(data, xCol, yCol, title, colorCol, defaultColors) {
  const grouped = getGroupedData(data, colorCol, title);
  const xCategories = [...new Set(data.map((d) => d[xCol]))];

  const series = Object.entries(grouped).map(([key, items], idx) => ({
    name: key,
    type: 'line',
    data: alignDataToCategories(items, xCategories, xCol, yCol, 0),
    smooth: true,
    symbol: 'circle',
    symbolSize: 6,
    lineStyle: { width: 2, color: defaultColors[idx % defaultColors.length] },
    areaStyle: {
      color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
        { offset: 0, color: `${defaultColors[idx % defaultColors.length]}80` },
        { offset: 1, color: `${defaultColors[idx % defaultColors.length]}10` },
      ]),
    },
    emphasis: { focus: 'series' },
    ...animationConfig,
  }));

  return {
    ...chartTheme,
    title: { ...chartTheme.title, text: title },
    tooltip: { ...chartTheme.tooltip, trigger: 'axis' },
    legend: { ...chartTheme.legend, top: 35 },
    xAxis: {
      ...chartTheme.xAxis,
      type: 'category',
      boundaryGap: false,
      data: [...new Set(data.map((d) => d[xCol]))],
    },
    yAxis: { ...chartTheme.yAxis, type: 'value' },
    series,
    grid: { ...chartTheme.grid, top: 80 },
  };
}

/**
 * 生成瀑布图配置
 */
function generateWaterfallOption(data, xCol, yCol, title, defaultColors) {
  let cumulative = 0;
  const waterfallData = data.map((d) => {
    const start = cumulative;
    const end = cumulative + d[yCol];
    cumulative = end;
    return {
      name: d[xCol],
      value: d[yCol],
      start,
      end,
      itemStyle: {
        color: d[yCol] >= 0 ? defaultColors[0] : defaultColors[3],
      },
    };
  });

  return {
    ...chartTheme,
    title: { ...chartTheme.title, text: title },
    tooltip: {
      ...chartTheme.tooltip,
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params) => {
        const d = waterfallData[params[0].dataIndex];
        return `${d.name}<br/>值: ${d.value}<br/>累计: ${d.end}`;
      },
    },
    grid: { ...chartTheme.grid, bottom: 60 },
    xAxis: {
      ...chartTheme.xAxis,
      type: 'category',
      data: data.map((d) => d[xCol]),
      axisLabel: {
        ...chartTheme.xAxis.axisLabel,
        rotate: data.length > 8 ? 30 : 0,
      },
    },
    yAxis: { ...chartTheme.yAxis, type: 'value' },
    series: [
      {
        name: title,
        type: 'bar',
        data: waterfallData.map((d) => ({
          value: d.value,
          itemStyle: d.itemStyle,
        })),
        barWidth: '50%',
        ...animationConfig,
      },
    ],
  };
}

/**
 * 生成桑基图配置
 */
function generateSankeyOption(data, xCol, yCol, title, colorCol, defaultColors) {
  const nodesMap = new Set();
  const links = [];
  const hasExplicitLinks = data.length > 0 && 'source' in data[0] && 'target' in data[0];

  if (hasExplicitLinks) {
    data.forEach(d => {
      nodesMap.add(String(d.source));
      nodesMap.add(String(d.target));
      links.push({
        source: String(d.source),
        target: String(d.target),
        value: Number(d.value || d[yCol] || 1)
      });
    });
  } else {
    // 退化推测：xCol -> colorCol -> yCol
    const targetCol = colorCol || (Object.keys(data[0] || {}).find(k => k !== xCol && k !== yCol));
    if (xCol && targetCol && yCol) {
      data.forEach(d => {
        if (d[xCol] && d[targetCol]) {
          nodesMap.add(String(d[xCol]));
          nodesMap.add(String(d[targetCol]));
          links.push({
            source: String(d[xCol]),
            target: String(d[targetCol]),
            value: Number(d[yCol]) || 0
          });
        }
      });
    }
  }

  const sankeyNodes = Array.from(nodesMap).map(name => ({ name }));

  return {
    ...chartTheme,
    title: { ...chartTheme.title, text: title },
    tooltip: {
      ...chartTheme.tooltip,
      trigger: 'item',
      triggerOn: 'mousemove',
    },
    series: [
      {
        type: 'sankey',
        data: sankeyNodes,
        links: links,
        emphasis: { focus: 'adjacency' },
        nodeAlign: 'justify',
        lineStyle: {
          color: 'gradient',
          curveness: 0.5,
          opacity: 0.2
        },
        label: {
          position: 'right',
          color: chartTheme.textStyle.color
        },
        itemStyle: {
          color: (params) => defaultColors[params.dataIndex % defaultColors.length],
          borderColor: '#e5e7eb',
          borderWidth: 1,
        },
        ...animationConfig,
      }
    ]
  };
}

/**
 * 核心调度器：根据类型分发对应的 ECharts Option 生成逻辑
 */
export function generateChartOption(data, config) {
  const { chartType, xCol: rawXCol, yCol: rawYCol, title, colorCol, sizeCol, colorTheme = 'default', advanced = {} } = config;

  const defaultColors = colorThemes[colorTheme] || colorThemes.default;

  // 通用基础配置
  const baseOption = {
    color: defaultColors,
    backgroundColor: chartTheme.backgroundColor,
    textStyle: chartTheme.textStyle,
    title: { ...chartTheme.title, text: title },
    legend: chartTheme.legend,
    tooltip: chartTheme.tooltip,
    grid: chartTheme.grid,
    xAxis: chartTheme.xAxis,
    yAxis: chartTheme.yAxis,
  };

  let xCol = rawXCol;
  let yCol = rawYCol;

  // 自动修正坐标轴: 对于常规二维图表，x通常是分类维度，y通常是数值维度
  if (chartType !== 'pie' && chartType !== 'radar' && chartType !== 'scatter' && chartType !== 'sankey' && data && data.length > 0 && xCol && yCol) {
    const xValues = data.map((d) => d[xCol]);
    const yValues = data.map((d) => d[yCol]);
    const xIsNumeric = xValues.every((v) => typeof v === 'number' || (!isNaN(parseFloat(v)) && typeof v !== 'string'));
    const yIsString = yValues.every((v) => typeof v === 'string' && isNaN(parseFloat(v)));

    // 对于 bar/line/area 等需要类别轴的图表，确保 xCol 是类别列
    const needsCategoryX = ['bar', 'horizontal_bar', 'line', 'area', 'polar_bar', 'waterfall'];
    if (xIsNumeric && yIsString && needsCategoryX.includes(chartType || 'bar')) {
      [xCol, yCol] = [yCol, xCol];
    }
  }

  const type = chartType || inferChartType(data, xCol, yCol);

  let option;
  switch (type) {
    case 'bar':
      option = generateBarOption(data, xCol, yCol, title, colorCol, defaultColors);
      break;
    case 'horizontal_bar': {
      // 横向柱状图：交换 X/Y 轴
      const opt = generateBarOption(data, xCol, yCol, title, colorCol, defaultColors);
      // 将柱状图转为横向：类别在 Y 轴，数值在 X 轴
      const categories = [...new Set(data.map((d) => d[xCol]))];
      opt.xAxis = { ...chartTheme.xAxis, type: 'value' };
      opt.yAxis = { ...chartTheme.yAxis, type: 'category', data: categories, inverse: true };
      opt.grid = { ...chartTheme.grid, left: '15%', bottom: 40 };
      // 柱子圆角改为水平方向
      if (opt.series) {
        opt.series = opt.series.map(s => ({
          ...s,
          itemStyle: { ...s.itemStyle, borderRadius: [0, 6, 6, 0] },
        }));
      }
      option = opt;
      break;
    }
    case 'line':
      option = generateLineOption(data, xCol, yCol, title, colorCol, defaultColors);
      break;
    case 'area':
      option = generateAreaOption(data, xCol, yCol, title, colorCol, defaultColors);
      break;
    case 'pie':
      option = generatePieOption(data, xCol, yCol, title, defaultColors);
      break;
    case 'scatter':
      option = generateScatterOption(data, xCol, yCol, title, colorCol, sizeCol, defaultColors);
      break;
    case 'radar':
      option = generateRadarOption(data, xCol, yCol, title, defaultColors);
      break;
    case 'funnel':
      option = generateFunnelOption(data, xCol, yCol, title, defaultColors);
      break;
    case 'gauge':
      option = generateGaugeOption(data, xCol, yCol, title, defaultColors);
      break;
    case 'heatmap':
      option = generateHeatmapOption(data, xCol, yCol, title, colorCol, defaultColors);
      break;
    case 'treemap':
      option = generateTreemapOption(data, xCol, yCol, title, defaultColors);
      break;
    case 'sunburst':
      option = generateSunburstOption(data, xCol, yCol, title, defaultColors);
      break;
    case 'boxplot':
      option = generateBoxplotOption(data, xCol, yCol, title, colorCol, defaultColors);
      break;
    case 'wordcloud':
      option = generateWordcloudOption(data, xCol, yCol, title, defaultColors);
      break;
    case 'polar_bar':
      option = generatePolarBarOption(data, xCol, yCol, title, defaultColors);
      break;
    case 'waterfall':
      option = generateWaterfallOption(data, xCol, yCol, title, defaultColors);
      break;
    case 'sankey':
      option = generateSankeyOption(data, xCol, yCol, title, colorCol, defaultColors);
      break;
    default:
      option = generateBarOption(data, xCol, yCol, title, colorCol, defaultColors);
      break;
  }

  // 统一应用高级设置 (标题覆盖、XY 轴重命名、数据标签显示、百分比格式化等)
  return applyAdvancedConfig(option, advanced);
}

/**
 * 注入与覆盖高级用户设置参数
 */
function applyAdvancedConfig(option, advanced) {
  if (!advanced || Object.keys(advanced).length === 0 || !option) return option;

  const { titleOverride, xAxisName, yAxisName, showDataLabel, valueFormat } = advanced;

  // 1. 标题覆盖
  if (titleOverride && option.title) {
    if (Array.isArray(option.title)) {
      option.title[0].text = titleOverride;
    } else {
      option.title.text = titleOverride;
    }
  }

  // 2. X轴名称
  if (xAxisName && option.xAxis) {
    if (Array.isArray(option.xAxis)) {
      option.xAxis[0].name = xAxisName;
      option.xAxis[0].nameTextStyle = { color: '#6b7280', padding: [0, 0, 0, 10] };
    } else {
      option.xAxis.name = xAxisName;
      option.xAxis.nameTextStyle = { color: '#6b7280', padding: [0, 0, 0, 10] };
    }
  }

  // 3. Y轴名称
  if (yAxisName && option.yAxis) {
    if (Array.isArray(option.yAxis)) {
      option.yAxis[0].name = yAxisName;
      option.yAxis[0].nameTextStyle = { color: '#6b7280', padding: [0, 0, 10, 0] };
    } else {
      option.yAxis.name = yAxisName;
      option.yAxis.nameTextStyle = { color: '#6b7280', padding: [0, 0, 10, 0] };
    }
  }

  // 4. 数据标签与格式化
  const isPercent = valueFormat === 'percent';
  
  if (option.series) {
    const seriesList = Array.isArray(option.series) ? option.series : [option.series];
    seriesList.forEach(s => {
      // 启用/禁用文字标签
      if (showDataLabel !== undefined) {
        s.label = s.label || {};
        s.label.show = showDataLabel;
        if (s.type === 'bar' || s.type === 'line' || s.type === 'scatter') {
          s.label.position = 'top';
        }
      }
      
      // 数值百分比格式 (如果在饼图等有自有 formatter 的图则跳过，只覆盖数值类)
      if (isPercent && s.type !== 'pie' && s.type !== 'funnel' && s.label?.show) {
        s.label.formatter = (params) => `${params.value}%`;
      }
    });
  }

  // 如果 Y 轴为 value 型并且要求显示百分比格式，也给轴加上 %
  if (isPercent && option.yAxis) {
    const yAxisList = Array.isArray(option.yAxis) ? option.yAxis : [option.yAxis];
    yAxisList.forEach(y => {
      if (y.type === 'value') {
        y.axisLabel = y.axisLabel || {};
        y.axisLabel.formatter = '{value}%';
      }
    });
  }

  // 横向柱状图是 X 轴为 value 型，对应处理
  if (isPercent && option.xAxis) {
    const xAxisList = Array.isArray(option.xAxis) ? option.xAxis : [option.xAxis];
    xAxisList.forEach(x => {
      if (x.type === 'value') {
        x.axisLabel = x.axisLabel || {};
        x.axisLabel.formatter = '{value}%';
      }
    });
  }

  return option;
}

/**
 * ECharts 图表渲染组件
 */
export default function EChartsRenderer({
  data,
  config,
  height = 400,
}) {
  const chartRef = useRef(null);
  const chartInstance = useRef(null);

  // 内部保存 base64 图像供外部导出
  useEffect(() => {
    if (chartInstance.current && !chartInstance.current.isDisposed()) {
      try {
        const base64 = chartInstance.current.getDataURL({
          type: 'png',
          pixelRatio: 2,
          backgroundColor: '#ffffff'
        });
        // 将 base64 存入 DOM 属性供 ReportViewer 提取
        if (chartRef.current) {
          chartRef.current.setAttribute('data-echarts-base64', base64);
        }
      } catch (e) {
        console.warn('ECharts export to base64 failed', e);
      }
    }
  });

  // 单一 useEffect 处理初始化、更新和清理
  useEffect(() => {
    if (!chartRef.current || !data || !config) return;

    // 如果实例已被 dispose（React Strict Mode 二次渲染），重新创建
    if (chartInstance.current && chartInstance.current.isDisposed()) {
      chartInstance.current = null;
    }

    // 初始化图表实例
    if (!chartInstance.current) {
      chartInstance.current = echarts.init(chartRef.current, null, {
        renderer: 'canvas',
      });
    }

    // 生成配置并渲染
    try {
      const option = generateChartOption(data, config);
      chartInstance.current.setOption(option, true);
    } catch (err) {
      console.error('[EChartsRenderer] 生成图表配置失败:', err);
    }

    // 响应式调整
    const handleResize = () => {
      if (chartInstance.current && !chartInstance.current.isDisposed()) {
        chartInstance.current.resize();
      }
    };
    window.addEventListener('resize', handleResize);

    // 清理
    return () => {
      window.removeEventListener('resize', handleResize);
      if (chartInstance.current && !chartInstance.current.isDisposed()) {
        chartInstance.current.dispose();
        chartInstance.current = null;
      }
    };
  }, [data, config]);

  if (!data || !config) {
    return (
      <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: '#9ca3af' }}>暂无图表数据</span>
      </div>
    );
  }

  return (
    <div ref={chartRef} style={{ width: '100%', height }} />
  );
}

// 导出工具函数
export {
  inferChartType,
  generateChartOption,
  generateHeatmapOption,
  generateTreemapOption,
  generateSunburstOption,
  generateBoxplotOption,
  generateWordcloudOption,
  generatePolarBarOption,
  generateAreaOption,
  generateWaterfallOption,
  chartTheme as darkTheme,
  chartTheme,
  gradientColors,
};
