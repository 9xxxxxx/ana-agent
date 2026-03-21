'use client';

/**
 * ECharts 图表生成器
 * 支持智能图表类型推断、酷炫动画和精美主题
 */

import { useEffect, useRef, useState } from 'react';
import * as echarts from 'echarts';

// 暗色主题配置
const darkTheme = {
  backgroundColor: 'transparent',
  textStyle: {
    color: '#94a3b8',
    fontFamily: 'Inter, sans-serif',
  },
  title: {
    textStyle: {
      color: '#e2e8f0',
      fontSize: 16,
      fontWeight: 600,
    },
    left: 'center',
    top: 10,
  },
  legend: {
    textStyle: {
      color: '#94a3b8',
    },
    pageTextStyle: {
      color: '#94a3b8',
    },
  },
  tooltip: {
    backgroundColor: 'rgba(17, 24, 39, 0.95)',
    borderColor: '#334155',
    borderWidth: 1,
    textStyle: {
      color: '#e2e8f0',
    },
    extraCssText: 'box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5); border-radius: 8px;',
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
      lineStyle: { color: '#334155' },
    },
    axisLabel: {
      color: '#94a3b8',
    },
    splitLine: {
      lineStyle: { color: '#1e293b' },
    },
  },
  yAxis: {
    axisLine: {
      lineStyle: { color: '#334155' },
    },
    axisLabel: {
      color: '#94a3b8',
    },
    splitLine: {
      lineStyle: { color: '#1e293b' },
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
function inferChartType(data, xCol, yCol) {
  if (!data || data.length === 0) return 'bar';

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
 * 生成柱状图配置
 */
function generateBarOption(data, xCol, yCol, title, colorCol) {
  const grouped = colorCol
    ? data.reduce((acc, d) => {
        const key = d[colorCol];
        if (!acc[key]) acc[key] = [];
        acc[key].push(d);
        return acc;
      }, {})
    : { [title || '数据']: data };

  const series = Object.entries(grouped).map(([name, items], idx) => ({
    name,
    type: 'bar',
    data: items.map((d) => d[yCol]),
    smooth: true,
    itemStyle: {
      borderRadius: [6, 6, 0, 0],
      color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
        { offset: 0, color: gradientColors[idx % gradientColors.length][0] },
        { offset: 1, color: gradientColors[idx % gradientColors.length][1] },
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
    ...darkTheme,
    title: { ...darkTheme.title, text: title },
    tooltip: {
      ...darkTheme.tooltip,
      trigger: 'axis',
      axisPointer: {
        type: 'shadow',
        shadowStyle: {
          color: 'rgba(59, 130, 246, 0.1)',
        },
      },
    },
    legend: { ...darkTheme.legend, top: 35 },
    xAxis: {
      ...darkTheme.xAxis,
      type: 'category',
      data: [...new Set(data.map((d) => d[xCol]))],
      axisLabel: {
        ...darkTheme.xAxis.axisLabel,
        rotate: data.length > 8 ? 30 : 0,
      },
    },
    yAxis: {
      ...darkTheme.yAxis,
      type: 'value',
    },
    series,
    grid: { ...darkTheme.grid, bottom: data.length > 8 ? 60 : 40 },
  };
}

/**
 * 生成折线图配置
 */
function generateLineOption(data, xCol, yCol, title, colorCol) {
  const grouped = colorCol
    ? data.reduce((acc, d) => {
        const key = d[colorCol];
        if (!acc[key]) acc[key] = [];
        acc[key].push(d);
        return acc;
      }, {})
    : { [title || '数据']: data };

  const series = Object.entries(grouped).map(([name, items], idx) => ({
    name,
    type: 'line',
    data: items.map((d) => d[yCol]),
    smooth: true,
    symbol: 'circle',
    symbolSize: 8,
    lineStyle: {
      width: 3,
      color: gradientColors[idx % gradientColors.length][0],
    },
    itemStyle: {
      color: gradientColors[idx % gradientColors.length][0],
      borderWidth: 2,
      borderColor: '#fff',
    },
    areaStyle: {
      color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
        { offset: 0, color: `${gradientColors[idx % gradientColors.length][0]}40` },
        { offset: 1, color: `${gradientColors[idx % gradientColors.length][0]}05` },
      ]),
    },
    emphasis: {
      focus: 'series',
      itemStyle: {
        shadowBlur: 10,
        shadowColor: gradientColors[idx % gradientColors.length][0],
      },
    },
    ...animationConfig,
  }));

  return {
    ...darkTheme,
    title: { ...darkTheme.title, text: title },
    tooltip: {
      ...darkTheme.tooltip,
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
    legend: { ...darkTheme.legend, top: 35 },
    xAxis: {
      ...darkTheme.xAxis,
      type: 'category',
      data: [...new Set(data.map((d) => d[xCol]))],
      boundaryGap: false,
    },
    yAxis: {
      ...darkTheme.yAxis,
      type: 'value',
    },
    series,
  };
}

/**
 * 生成饼图配置
 */
function generatePieOption(data, xCol, yCol, title) {
  const pieData = data.map((d, idx) => ({
    name: d[xCol],
    value: d[yCol],
    itemStyle: {
      color: new echarts.graphic.LinearGradient(0, 0, 1, 1, [
        { offset: 0, color: gradientColors[idx % gradientColors.length][0] },
        { offset: 1, color: gradientColors[idx % gradientColors.length][1] },
      ]),
    },
  }));

  return {
    ...darkTheme,
    title: { ...darkTheme.title, text: title },
    tooltip: {
      ...darkTheme.tooltip,
      trigger: 'item',
      formatter: '{b}: {c} ({d}%)',
    },
    legend: {
      ...darkTheme.legend,
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
          borderColor: '#1a2236',
          borderWidth: 2,
        },
        label: {
          show: true,
          position: 'outside',
          formatter: '{b}\n{d}%',
          color: '#94a3b8',
        },
        labelLine: {
          show: true,
          lineStyle: {
            color: '#475569',
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
function generateScatterOption(data, xCol, yCol, title, colorCol, sizeCol) {
  const grouped = colorCol
    ? data.reduce((acc, d) => {
        const key = d[colorCol];
        if (!acc[key]) acc[key] = [];
        acc[key].push(d);
        return acc;
      }, {})
    : { [title || '数据']: data };

  const series = Object.entries(grouped).map(([name, items], idx) => ({
    name,
    type: 'scatter',
    data: items.map((d) => [d[xCol], d[yCol], sizeCol ? d[sizeCol] : 20]),
    symbolSize: sizeCol ? (val) => Math.sqrt(val[2]) * 2 : 15,
    itemStyle: {
      color: gradientColors[idx % gradientColors.length][0],
      opacity: 0.8,
    },
    emphasis: {
      itemStyle: {
        shadowBlur: 15,
        shadowColor: gradientColors[idx % gradientColors.length][0],
      },
    },
    ...animationConfig,
  }));

  return {
    ...darkTheme,
    title: { ...darkTheme.title, text: title },
    tooltip: {
      ...darkTheme.tooltip,
      trigger: 'item',
      formatter: (params) => `${xCol}: ${params.data[0]}<br/>${yCol}: ${params.data[1]}`,
    },
    legend: { ...darkTheme.legend, top: 35 },
    xAxis: {
      ...darkTheme.xAxis,
      type: 'value',
      name: xCol,
      nameTextStyle: { color: '#94a3b8' },
    },
    yAxis: {
      ...darkTheme.yAxis,
      type: 'value',
      name: yCol,
      nameTextStyle: { color: '#94a3b8' },
    },
    series,
  };
}

/**
 * 生成雷达图配置
 */
function generateRadarOption(data, xCol, yCol, title) {
  const indicators = data.map((d) => ({
    name: d[xCol],
    max: Math.max(...data.map((item) => item[yCol])) * 1.2,
  }));

  return {
    ...darkTheme,
    title: { ...darkTheme.title, text: title },
    tooltip: { ...darkTheme.tooltip },
    radar: {
      indicator: indicators,
      shape: 'polygon',
      splitNumber: 5,
      axisName: {
        color: '#94a3b8',
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
                { offset: 0, color: 'rgba(59, 130, 246, 0.6)' },
                { offset: 1, color: 'rgba(139, 92, 246, 0.2)' },
              ]),
            },
            lineStyle: {
              color: '#3b82f6',
              width: 2,
            },
            itemStyle: {
              color: '#3b82f6',
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
function generateFunnelOption(data, xCol, yCol, title) {
  const funnelData = data.map((d, idx) => ({
    name: d[xCol],
    value: d[yCol],
    itemStyle: {
      color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
        { offset: 0, color: gradientColors[idx % gradientColors.length][0] },
        { offset: 1, color: gradientColors[idx % gradientColors.length][1] },
      ]),
    },
  }));

  return {
    ...darkTheme,
    title: { ...darkTheme.title, text: title },
    tooltip: {
      ...darkTheme.tooltip,
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
          borderColor: '#1a2236',
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
function generateGaugeOption(data, xCol, yCol, title) {
  const value = data[0]?.[yCol] || 0;

  return {
    ...darkTheme,
    title: { ...darkTheme.title, text: title },
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
            { offset: 0, color: '#10b981' },
            { offset: 0.5, color: '#f59e0b' },
            { offset: 1, color: '#ef4444' },
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
            color: '#3b82f6',
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
            color: '#475569',
          },
        },
        axisLabel: {
          distance: 30,
          color: '#94a3b8',
          fontSize: 12,
        },
        anchor: {
          show: true,
          showAbove: true,
          size: 20,
          itemStyle: {
            borderWidth: 8,
            borderColor: '#3b82f6',
            color: '#1a2236',
          },
        },
        title: {
          show: true,
          offsetCenter: [0, '80%'],
          color: '#94a3b8',
          fontSize: 14,
        },
        detail: {
          valueAnimation: true,
          fontSize: 36,
          fontWeight: 'bold',
          offsetCenter: [0, '50%'],
          color: '#e2e8f0',
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
function generateHeatmapOption(data, xCol, yCol, title, colorCol) {
  const xCategories = [...new Set(data.map((d) => d[xCol]))];
  const yCategories = colorCol ? [...new Set(data.map((d) => d[colorCol]))] : [yCol];
  
  const heatmapData = data.map((d) => {
    const xIdx = xCategories.indexOf(d[xCol]);
    const yIdx = colorCol ? yCategories.indexOf(d[colorCol]) : 0;
    return [xIdx, yIdx, d[yCol]];
  });

  const maxValue = Math.max(...data.map((d) => d[yCol]));

  return {
    ...darkTheme,
    title: { ...darkTheme.title, text: title },
    tooltip: {
      ...darkTheme.tooltip,
      position: 'top',
      formatter: (params) => {
        return `${xCategories[params.data[0]]}<br/>${yCategories[params.data[1]]}: ${params.data[2]}`;
      },
    },
    grid: { ...darkTheme.grid, top: 60, right: 80 },
    xAxis: {
      ...darkTheme.xAxis,
      type: 'category',
      data: xCategories,
      splitArea: { show: true },
    },
    yAxis: {
      ...darkTheme.yAxis,
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
        color: ['#1e3a5f', '#3b82f6', '#10b981', '#f59e0b', '#ef4444'],
      },
      textStyle: {
        color: '#94a3b8',
      },
    },
    series: [
      {
        name: title,
        type: 'heatmap',
        data: heatmapData,
        label: {
          show: true,
          color: '#e2e8f0',
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
function generateTreemapOption(data, xCol, yCol, title) {
  const treemapData = data.map((d, idx) => ({
    name: d[xCol],
    value: d[yCol],
    itemStyle: {
      color: gradientColors[idx % gradientColors.length][0],
    },
  }));

  return {
    ...darkTheme,
    title: { ...darkTheme.title, text: title },
    tooltip: {
      ...darkTheme.tooltip,
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
            color: '#3b82f6',
            borderColor: '#3b82f6',
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
          borderColor: '#1a2236',
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
function generateSunburstOption(data, xCol, yCol, title) {
  const sunburstData = data.map((d, idx) => ({
    name: d[xCol],
    value: d[yCol],
    itemStyle: {
      color: gradientColors[idx % gradientColors.length][0],
    },
  }));

  return {
    ...darkTheme,
    title: { ...darkTheme.title, text: title },
    tooltip: {
      ...darkTheme.tooltip,
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
              borderColor: '#1a2236',
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
              borderColor: '#1a2236',
            },
            label: {
              position: 'outside',
              padding: 3,
              silent: false,
              color: '#94a3b8',
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
function generateBoxplotOption(data, xCol, yCol, title, colorCol) {
  const grouped = colorCol
    ? data.reduce((acc, d) => {
        const key = d[colorCol];
        if (!acc[key]) acc[key] = [];
        acc[key].push(d[yCol]);
        return acc;
      }, {})
    : { [xCol]: data.map((d) => d[yCol]) };

  const boxplotData = Object.entries(grouped).map(([, values]) => {
    const sorted = [...values].sort((a, b) => a - b);
    const q1 = sorted[Math.floor(sorted.length * 0.25)];
    const q2 = sorted[Math.floor(sorted.length * 0.5)];
    const q3 = sorted[Math.floor(sorted.length * 0.75)];
    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    return [min, q1, q2, q3, max];
  });

  return {
    ...darkTheme,
    title: { ...darkTheme.title, text: title },
    tooltip: {
      ...darkTheme.tooltip,
      trigger: 'item',
      formatter: (params) => {
        return `${params.name}<br/>最小: ${params.data[1]}<br/>Q1: ${params.data[2]}<br/>中位数: ${params.data[3]}<br/>Q3: ${params.data[4]}<br/>最大: ${params.data[5]}`;
      },
    },
    grid: { ...darkTheme.grid, bottom: 60 },
    xAxis: {
      ...darkTheme.xAxis,
      type: 'category',
      data: Object.keys(grouped),
      boundaryGap: true,
      axisLabel: {
        ...darkTheme.xAxis.axisLabel,
        rotate: Object.keys(grouped).length > 5 ? 30 : 0,
      },
    },
    yAxis: {
      ...darkTheme.yAxis,
      type: 'value',
    },
    series: [
      {
        name: title,
        type: 'boxplot',
        data: boxplotData,
        itemStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: '#3b82f6' },
            { offset: 1, color: '#8b5cf6' },
          ]),
          borderColor: '#3b82f6',
          borderWidth: 2,
        },
        emphasis: {
          itemStyle: {
            shadowBlur: 10,
            shadowColor: 'rgba(59, 130, 246, 0.5)',
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
function generateWordcloudOption(data, xCol, yCol, title) {
  const maxValue = Math.max(...data.map((d) => d[yCol]));
  
  const wordcloudData = data.map((d, idx) => ({
    name: d[xCol],
    value: d[yCol],
    symbolSize: (d[yCol] / maxValue) * 60 + 20,
    itemStyle: {
      color: gradientColors[idx % gradientColors.length][0],
    },
    x: (idx % 5) * 150 + 100,
    y: Math.floor(idx / 5) * 80 + 50,
  }));

  return {
    ...darkTheme,
    title: { ...darkTheme.title, text: title },
    tooltip: {
      ...darkTheme.tooltip,
      trigger: 'item',
      formatter: '{b}: {c}',
    },
    xAxis: { show: false, type: 'value' },
    yAxis: { show: false, type: 'value' },
    grid: { ...darkTheme.grid, left: 0, right: 0, top: 60, bottom: 0 },
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
function generatePolarBarOption(data, xCol, yCol, title) {
  return {
    ...darkTheme,
    title: { ...darkTheme.title, text: title },
    tooltip: {
      ...darkTheme.tooltip,
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
      axisLabel: { color: '#94a3b8' },
    },
    radiusAxis: {
      type: 'category',
      data: data.map((d) => d[xCol]),
      splitLine: {
        lineStyle: { color: '#1e293b' },
      },
      axisLine: {
        lineStyle: { color: '#334155' },
      },
      axisLabel: { color: '#94a3b8' },
    },
    series: [
      {
        type: 'bar',
        data: data.map((d, idx) => ({
          value: d[yCol],
          itemStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
              { offset: 0, color: gradientColors[idx % gradientColors.length][0] },
              { offset: 1, color: gradientColors[idx % gradientColors.length][1] },
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
function generateAreaOption(data, xCol, yCol, title, colorCol) {
  const grouped = colorCol
    ? data.reduce((acc, d) => {
        const key = d[colorCol];
        if (!acc[key]) acc[key] = [];
        acc[key].push(d);
        return acc;
      }, {})
    : { [title || '数据']: data };

  const series = Object.entries(grouped).map(([name, items], idx) => ({
    name,
    type: 'line',
    data: items.map((d) => d[yCol]),
    smooth: true,
    symbol: 'circle',
    symbolSize: 6,
    lineStyle: { width: 2, color: gradientColors[idx % gradientColors.length][0] },
    areaStyle: {
      color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
        { offset: 0, color: `${gradientColors[idx % gradientColors.length][0]}80` },
        { offset: 1, color: `${gradientColors[idx % gradientColors.length][0]}10` },
      ]),
    },
    emphasis: { focus: 'series' },
    ...animationConfig,
  }));

  return {
    ...darkTheme,
    title: { ...darkTheme.title, text: title },
    tooltip: { ...darkTheme.tooltip, trigger: 'axis' },
    legend: { ...darkTheme.legend, top: 35 },
    xAxis: {
      ...darkTheme.xAxis,
      type: 'category',
      boundaryGap: false,
      data: [...new Set(data.map((d) => d[xCol]))],
    },
    yAxis: { ...darkTheme.yAxis, type: 'value' },
    series,
    grid: { ...darkTheme.grid, top: 80 },
  };
}

/**
 * 生成瀑布图配置
 */
function generateWaterfallOption(data, xCol, yCol, title) {
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
        color: d[yCol] >= 0 ? gradientColors[0][0] : gradientColors[3][0],
      },
    };
  });

  return {
    ...darkTheme,
    title: { ...darkTheme.title, text: title },
    tooltip: {
      ...darkTheme.tooltip,
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params) => {
        const d = waterfallData[params[0].dataIndex];
        return `${d.name}<br/>值: ${d.value}<br/>累计: ${d.end}`;
      },
    },
    grid: { ...darkTheme.grid, bottom: 60 },
    xAxis: {
      ...darkTheme.xAxis,
      type: 'category',
      data: data.map((d) => d[xCol]),
      axisLabel: {
        ...darkTheme.xAxis.axisLabel,
        rotate: data.length > 8 ? 30 : 0,
      },
    },
    yAxis: { ...darkTheme.yAxis, type: 'value' },
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
 * 主图表生成函数
 */
function generateChartOption(data, config) {
  const { chartType, xCol, yCol, title, colorCol, sizeCol } = config;

  const type = chartType || inferChartType(data, xCol, yCol);

  switch (type) {
    case 'bar':
      return generateBarOption(data, xCol, yCol, title, colorCol);
    case 'horizontal_bar':
      return generateBarOption(data, xCol, yCol, title, colorCol);
    case 'line':
      return generateLineOption(data, xCol, yCol, title, colorCol);
    case 'area':
      return generateAreaOption(data, xCol, yCol, title, colorCol);
    case 'pie':
      return generatePieOption(data, xCol, yCol, title);
    case 'scatter':
      return generateScatterOption(data, xCol, yCol, title, colorCol, sizeCol);
    case 'radar':
      return generateRadarOption(data, xCol, yCol, title);
    case 'funnel':
      return generateFunnelOption(data, xCol, yCol, title);
    case 'gauge':
      return generateGaugeOption(data, xCol, yCol, title);
    case 'heatmap':
      return generateHeatmapOption(data, xCol, yCol, title, colorCol);
    case 'treemap':
      return generateTreemapOption(data, xCol, yCol, title);
    case 'sunburst':
      return generateSunburstOption(data, xCol, yCol, title, colorCol);
    case 'boxplot':
      return generateBoxplotOption(data, xCol, yCol, title, colorCol);
    case 'wordcloud':
      return generateWordcloudOption(data, xCol, yCol, title);
    case 'polar_bar':
      return generatePolarBarOption(data, xCol, yCol, title);
    case 'waterfall':
      return generateWaterfallOption(data, xCol, yCol, title);
    default:
      return generateBarOption(data, xCol, yCol, title, colorCol);
  }
}

/**
 * 核心调度器：根据类型分发对应的 ECharts Option 生成逻辑
 */
export function generateChartOption(data, config) {
  const { chartType, xCol, yCol, title, colorCol, sizeCol } = config;
  
  switch (chartType) {
    case 'bar':
    case 'horizontal_bar':
      return generateBarOption(data, xCol, yCol, title, colorCol);
    case 'line':
    case 'area':
      return generateLineOption(data, xCol, yCol, title, colorCol);
    case 'pie':
      return generatePieOption(data, xCol, yCol, title);
    case 'scatter':
      return generateScatterOption(data, xCol, yCol, title, colorCol, sizeCol);
    case 'radar':
      return generateRadarOption(data, xCol, yCol, title);
    case 'funnel':
      return generateFunnelOption(data, xCol, yCol, title);
    case 'gauge':
      return generateGaugeOption(data, xCol, yCol, title);
    case 'heatmap':
      return generateHeatmapOption(data, xCol, yCol, title, colorCol);
    case 'treemap':
      return generateTreemapOption(data, xCol, yCol, title);
    case 'sunburst':
      return generateSunburstOption(data, xCol, yCol, title);
    case 'boxplot':
      return generateBarOption(data, xCol, yCol, title, colorCol); // 兜底处理
    case 'wordcloud':
      return generatePieOption(data, xCol, yCol, title); // 暂降级
    case 'polar_bar':
      return generateBarOption(data, xCol, yCol, title, colorCol); // 兜底处理
    default:
      return generateBarOption(data, xCol, yCol, title, colorCol);
  }
}

/**
 * ECharts 图表渲染组件
 */
export default function EChartsRenderer({
  data,
  config,
  height = 400,
  onChartReady,
}) {
  const chartRef = useRef(null);
  const chartInstance = useRef(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!chartRef.current || !data || !config) return;

    // 初始化图表
    if (!chartInstance.current) {
      chartInstance.current = echarts.init(chartRef.current, null, {
        renderer: 'canvas',
      });
    }

    // 生成配置
    const option = generateChartOption(data, config);

    // 设置配置
    chartInstance.current.setOption(option, true);
    setIsLoading(false);

    // 回调
    onChartReady?.(chartInstance.current);

    // 响应式
    const handleResize = () => {
      chartInstance.current?.resize();
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [data, config, onChartReady]);

  // 清理
  useEffect(() => {
    return () => {
      chartInstance.current?.dispose();
    };
  }, []);

  if (!data || !config) {
    return (
      <div className="chart-container" style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: 'var(--text-tertiary)' }}>暂无数据</span>
      </div>
    );
  }

  return (
    <div className="chart-container echarts-container" style={{ height, position: 'relative' }}>
      {isLoading && (
        <div className="chart-loading">
          <div className="loading-spinner"></div>
        </div>
      )}
      <div ref={chartRef} style={{ width: '100%', height: '100%' }} />
    </div>
  );
}

// 导出工具函数
export {
  inferChartType,
  generateChartOption,
  generateBarOption,
  generateLineOption,
  generatePieOption,
  generateScatterOption,
  generateRadarOption,
  generateFunnelOption,
  generateGaugeOption,
  generateHeatmapOption,
  generateTreemapOption,
  generateSunburstOption,
  generateBoxplotOption,
  generateWordcloudOption,
  generatePolarBarOption,
  generateAreaOption,
  generateWaterfallOption,
  darkTheme,
  gradientColors,
};
