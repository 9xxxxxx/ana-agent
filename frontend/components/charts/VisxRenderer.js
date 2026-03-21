'use client';

/**
 * Visx 图表渲染器
 * 使用 @visx 系列库创建高度自定义的可视化图表
 */

import { useMemo } from 'react';
import { Group } from '@visx/group';
import { Bar, LinePath, AreaClosed, Pie } from '@visx/shape';
import { AxisBottom, AxisLeft } from '@visx/axis';
import { scaleBand, scaleLinear } from '@visx/scale';
import { Tooltip, useTooltip, defaultStyles } from '@visx/tooltip';
import { localPoint } from '@visx/event';
import { curveMonotoneX } from '@visx/curve';

// 内置多套图表配色方案 (Color Themes) 对应 ECharts
const colorThemes = {
  default: ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899', '#14b8a6'],
  warm: ['#fc8d62', '#e78ac3', '#ffd92f', '#e5c494', '#f46d43', '#fdae61', '#fee08b', '#abdda4'],
  cool: ['#00b8a9', '#f6416c', '#3fc1c9', '#364f6b', '#7a42f4', '#00d2fc', '#0ad59e', '#fc5185'],
  fresh: ['#a8e6cf', '#dcedc1', '#ffd3b6', '#ffaaa5', '#76b4bd', '#5c969e', '#f3e8cb', '#c5e3f6']
};

// 亮色主题样式
const lightTheme = {
  axis: {
    stroke: '#e5e7eb',
    tickStroke: '#e5e7eb',
    tickLabel: {
      fill: '#6b7280',
      fontSize: 11,
      fontFamily: 'Inter, sans-serif',
    },
    label: {
      fill: '#374151',
      fontSize: 12,
      fontFamily: 'Inter, sans-serif',
    },
  },
  grid: {
    stroke: '#f3f4f6',
    strokeWidth: 1,
  },
  text: {
    fill: '#4b5563',
    fontSize: 12,
    fontFamily: 'Inter, sans-serif',
  },
};

/**
 * Visx 柱状图
 */
export function VisxBarChart({ data, xCol, yCol, title, colorTheme = 'default', width = 600, height = 400 }) {
  const margin = { top: 40, right: 30, bottom: 50, left: 60 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  const {
    tooltipData,
    tooltipLeft,
    tooltipTop,
    tooltipOpen,
    showTooltip,
    hideTooltip,
  } = useTooltip();

  const colors = colorThemes[colorTheme] || colorThemes.default;

  // 健壮的数据处理：过滤非数值
  const yValues = data.map(d => Number(d[yCol])).filter(n => !isNaN(n));
  const maxY = yValues.length > 0 ? Math.max(...yValues) * 1.1 : 100;

  // 计算比例尺
  const xScale = useMemo(
    () =>
      scaleBand({
        range: [0, innerWidth],
        domain: data.map((d) => String(d[xCol])),
        padding: 0.3,
      }),
    [data, xCol, innerWidth]
  );

  const yScale = useMemo(
    () =>
      scaleLinear({
        range: [innerHeight, 0],
        domain: [0, maxY],
      }),
    [maxY, innerHeight]
  );

  return (
    <div className="visx-chart-container relative">
      {title && (
        <h3 className="chart-title text-center text-gray-700 font-semibold mb-2">
          {title}
        </h3>
      )}
      <svg width={width} height={height}>
        <Group left={margin.left} top={margin.top}>
          {/* 网格线 */}
          {yScale.ticks(5).map((tick, i) => (
            <line
              key={i}
              x1={0}
              x2={innerWidth}
              y1={yScale(tick)}
              y2={yScale(tick)}
              stroke={lightTheme.grid.stroke}
              strokeWidth={lightTheme.grid.strokeWidth}
            />
          ))}

          {/* 柱状图 */}
          {data.map((d, i) => {
            const barWidth = xScale.bandwidth();
            const val = Number(d[yCol]);
            const validVal = isNaN(val) ? 0 : val;
            const barY = yScale(validVal);
            const barHeight = innerHeight - barY;
            const barX = xScale(String(d[xCol]));

            return (
              <Bar
                key={`bar-${i}`}
                x={barX}
                y={barY}
                width={barWidth}
                height={barHeight}
                fill={colors[i % colors.length]}
                rx={4}
                onMouseMove={(event) => {
                  const point = localPoint(event);
                  showTooltip({
                    tooltipData: d,
                    tooltipLeft: point.x,
                    tooltipTop: point.y,
                  });
                }}
                onMouseLeave={hideTooltip}
                style={{ cursor: 'pointer' }}
              />
            );
          })}

          {/* X 轴 */}
          <AxisBottom
            scale={xScale}
            top={innerHeight}
            stroke={lightTheme.axis.stroke}
            tickStroke={lightTheme.axis.tickStroke}
            tickLabelProps={() => ({
              fill: lightTheme.axis.tickLabel.fill,
              fontSize: lightTheme.axis.tickLabel.fontSize,
              fontFamily: lightTheme.axis.tickLabel.fontFamily,
              textAnchor: 'middle',
            })}
          />

          {/* Y 轴 */}
          <AxisLeft
            scale={yScale}
            stroke={lightTheme.axis.stroke}
            tickStroke={lightTheme.axis.tickStroke}
            tickLabelProps={() => ({
              fill: lightTheme.axis.tickLabel.fill,
              fontSize: lightTheme.axis.tickLabel.fontSize,
              fontFamily: lightTheme.axis.tickLabel.fontFamily,
              textAnchor: 'end',
              dx: -8,
              dy: 3,
            })}
          />
        </Group>
      </svg>

      {/* Tooltip */}
      {tooltipOpen && tooltipData && (
        <Tooltip
          left={tooltipLeft + margin.left}
          top={tooltipTop + margin.top}
          style={{
            ...defaultStyles,
            backgroundColor: 'rgba(255, 255, 255, 0.95)',
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            padding: '8px 12px',
            color: '#334155',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
          }}
        >
          <strong>{String(tooltipData[xCol])}</strong>
          <br />
          {yCol}: {tooltipData[yCol]}
        </Tooltip>
      )}
    </div>
  );
}

/**
 * Visx 折线图
 */
export function VisxLineChart({ data, xCol, yCol, title, colorTheme = 'default', width = 600, height = 400 }) {
  const margin = { top: 40, right: 30, bottom: 50, left: 60 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  const colors = colorThemes[colorTheme] || colorThemes.default;
  const primaryColor = colors[0];

  const yValues = data.map(d => Number(d[yCol])).filter(n => !isNaN(n));
  const maxY = yValues.length > 0 ? Math.max(...yValues) * 1.1 : 100;

  // 计算比例尺
  const xScale = useMemo(
    () =>
      scaleBand({
        range: [0, innerWidth],
        domain: data.map((d) => String(d[xCol])),
        padding: 0.3,
      }),
    [data, xCol, innerWidth]
  );

  const yScale = useMemo(
    () =>
      scaleLinear({
        range: [innerHeight, 0],
        domain: [0, maxY],
      }),
    [maxY, innerHeight]
  );

  return (
    <div className="visx-chart-container">
      {title && (
        <h3 className="chart-title text-center text-gray-700 font-semibold mb-2">
          {title}
        </h3>
      )}
      <svg width={width} height={height}>
        <Group left={margin.left} top={margin.top}>
          {/* 网格线 */}
          {yScale.ticks(5).map((tick, i) => (
            <line
              key={i}
              x1={0}
              x2={innerWidth}
              y1={yScale(tick)}
              y2={yScale(tick)}
              stroke={lightTheme.grid.stroke}
              strokeWidth={lightTheme.grid.strokeWidth}
            />
          ))}

          {/* 面积图 */}
          <AreaClosed
            data={data}
            x={(d) => xScale(String(d[xCol])) + xScale.bandwidth() / 2}
            y={(d) => {
              const val = Number(d[yCol]);
              return isNaN(val) ? yScale(0) : yScale(val);
            }}
            yScale={yScale}
            curve={curveMonotoneX}
            fill={primaryColor}
            opacity={0.15}
          />

          {/* 折线 */}
          <LinePath
            data={data}
            x={(d) => xScale(String(d[xCol])) + xScale.bandwidth() / 2}
            y={(d) => {
              const val = Number(d[yCol]);
              return isNaN(val) ? yScale(0) : yScale(val);
            }}
            curve={curveMonotoneX}
            stroke={primaryColor}
            strokeWidth={3}
          />

          {/* 数据点 */}
          {data.map((d, i) => {
            const val = Number(d[yCol]);
            if (isNaN(val)) return null;
            return (
              <circle
                key={i}
                cx={xScale(String(d[xCol])) + xScale.bandwidth() / 2}
                cy={yScale(val)}
                r={5}
                fill={primaryColor}
                stroke="#fff"
                strokeWidth={2}
                style={{ cursor: 'pointer' }}
              />
            );
          })}

          {/* X 轴 */}
          <AxisBottom
            scale={xScale}
            top={innerHeight}
            stroke={lightTheme.axis.stroke}
            tickStroke={lightTheme.axis.tickStroke}
            tickLabelProps={() => ({
              fill: lightTheme.axis.tickLabel.fill,
              fontSize: lightTheme.axis.tickLabel.fontSize,
              fontFamily: lightTheme.axis.tickLabel.fontFamily,
              textAnchor: 'middle',
            })}
          />

          {/* Y 轴 */}
          <AxisLeft
            scale={yScale}
            stroke={lightTheme.axis.stroke}
            tickStroke={lightTheme.axis.tickStroke}
            tickLabelProps={() => ({
              fill: lightTheme.axis.tickLabel.fill,
              fontSize: lightTheme.axis.tickLabel.fontSize,
              fontFamily: lightTheme.axis.tickLabel.fontFamily,
              textAnchor: 'end',
              dx: -8,
              dy: 3,
            })}
          />
        </Group>
      </svg>
    </div>
  );
}

/**
 * Visx 饼图
 */
export function VisxPieChart({ data, xCol, yCol, title, colorTheme = 'default', width = 600, height = 400 }) {
  const margin = { top: 40, right: 30, bottom: 50, left: 30 };
  const radius = Math.min(width, height) / 2 - Math.max(margin.top, margin.left);

  const colors = colorThemes[colorTheme] || colorThemes.default;

  return (
    <div className="visx-chart-container">
      {title && (
        <h3 className="chart-title text-center text-gray-700 font-semibold mb-2">
          {title}
        </h3>
      )}
      <svg width={width} height={height}>
        <Group left={width / 2} top={height / 2}>
          <Pie
            data={data}
            pieValue={(d) => {
              const val = Number(d[yCol]);
              return isNaN(val) || val < 0 ? 0 : val;
            }}
            outerRadius={radius}
            innerRadius={radius * 0.5}
            cornerRadius={3}
            padAngle={0.02}
          >
            {(pie) => {
              return pie.arcs.map((arc, i) => {
                const arcPath = pie.path(arc);
                const color = colors[i % colors.length];
                return (
                  <g key={`arc-${i}`}>
                    <path d={arcPath} fill={color} stroke="#fff" strokeWidth={2} />
                  </g>
                );
              });
            }}
          </Pie>
        </Group>
      </svg>
    </div>
  );
}

/**
 * Visx 图表渲染器主组件
 */
export default function VisxRenderer({
  data,
  config,
  height = 400,
}) {
  const { chartType, xCol, yCol, title, colorTheme } = config;

  if (!data || data.length === 0 || !xCol || !yCol) {
    return (
      <div className="flex items-center justify-center p-4 border border-red-200 bg-red-50 text-red-600 rounded-lg text-sm w-full h-[300px]">
        图表所需坐标轴数据未正确识别，无法为您绘制图形。
      </div>
    );
  }

  // NextJS / React 动态自适应宽高较麻烦，这里使用固定近似宽度
  const width = 700;
  const commonProps = {
    data,
    xCol,
    yCol,
    title,
    colorTheme,
    width,
    height,
  };

  switch (chartType) {
    case 'bar':
    case 'horizontal_bar':
      return <VisxBarChart {...commonProps} />;
    case 'line':
    case 'area':
      return <VisxLineChart {...commonProps} />;
    case 'pie':
      return <VisxPieChart {...commonProps} />;
    default:
      return <VisxBarChart {...commonProps} />;
  }
}

export {
  colorThemes,
  lightTheme
};
