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
import { GradientPinkBlue, GradientTealBlue, GradientPurpleRed } from '@visx/gradient';
import { Tooltip, useTooltip, defaultStyles } from '@visx/tooltip';
import { localPoint } from '@visx/event';
import { curveMonotoneX } from '@visx/curve';

// 颜色配置
const colors = {
  primary: '#3b82f6',
  secondary: '#8b5cf6',
  success: '#10b981',
  warning: '#f59e0b',
  danger: '#ef4444',
  cyan: '#06b6d4',
  pink: '#ec4899',
  teal: '#14b8a6',
};

const colorPalette = Object.values(colors);

// 暗色主题样式
const darkTheme = {
  axis: {
    stroke: '#334155',
    tickStroke: '#334155',
    tickLabel: {
      fill: '#94a3b8',
      fontSize: 11,
      fontFamily: 'Inter, sans-serif',
    },
    label: {
      fill: '#94a3b8',
      fontSize: 12,
      fontFamily: 'Inter, sans-serif',
    },
  },
  grid: {
    stroke: '#1e293b',
    strokeWidth: 1,
  },
  text: {
    fill: '#94a3b8',
    fontSize: 12,
    fontFamily: 'Inter, sans-serif',
  },
};

/**
 * Visx 柱状图
 */
export function VisxBarChart({ data, xCol, yCol, title, width = 600, height = 400 }) {
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

  // 计算比例尺
  const xScale = useMemo(
    () =>
      scaleBand({
        range: [0, innerWidth],
        domain: data.map((d) => d[xCol]),
        padding: 0.3,
      }),
    [data, xCol, innerWidth]
  );

  const yScale = useMemo(
    () =>
      scaleLinear({
        range: [innerHeight, 0],
        domain: [0, Math.max(...data.map((d) => d[yCol])) * 1.1],
      }),
    [data, yCol, innerHeight]
  );

  return (
    <div className="visx-chart-container">
      {title && (
        <h3 className="chart-title" style={{ textAlign: 'center', color: '#e2e8f0', marginBottom: '10px' }}>
          {title}
        </h3>
      )}
      <svg width={width} height={height}>
        <GradientTealBlue id="bar-gradient" />
        <Group left={margin.left} top={margin.top}>
          {/* 网格线 */}
          {yScale.ticks(5).map((tick, i) => (
            <line
              key={i}
              x1={0}
              x2={innerWidth}
              y1={yScale(tick)}
              y2={yScale(tick)}
              stroke={darkTheme.grid.stroke}
              strokeWidth={darkTheme.grid.strokeWidth}
            />
          ))}

          {/* 柱状图 */}
          {data.map((d, i) => {
            const barWidth = xScale.bandwidth();
            const barHeight = innerHeight - yScale(d[yCol]);
            const barX = xScale(d[xCol]);
            const barY = yScale(d[yCol]);

            return (
              <Bar
                key={`bar-${i}`}
                x={barX}
                y={barY}
                width={barWidth}
                height={barHeight}
                fill={`url(#bar-gradient)`}
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
            stroke={darkTheme.axis.stroke}
            tickStroke={darkTheme.axis.tickStroke}
            tickLabelProps={() => ({
              fill: darkTheme.axis.tickLabel.fill,
              fontSize: darkTheme.axis.tickLabel.fontSize,
              fontFamily: darkTheme.axis.tickLabel.fontFamily,
              textAnchor: 'middle',
            })}
          />

          {/* Y 轴 */}
          <AxisLeft
            scale={yScale}
            stroke={darkTheme.axis.stroke}
            tickStroke={darkTheme.axis.tickStroke}
            tickLabelProps={() => ({
              fill: darkTheme.axis.tickLabel.fill,
              fontSize: darkTheme.axis.tickLabel.fontSize,
              fontFamily: darkTheme.axis.tickLabel.fontFamily,
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
            backgroundColor: '#1a2236',
            border: '1px solid #334155',
            borderRadius: '8px',
            padding: '8px 12px',
            color: '#e2e8f0',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5)',
          }}
        >
          <strong>{tooltipData[xCol]}</strong>
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
export function VisxLineChart({ data, xCol, yCol, title, width = 600, height = 400 }) {
  const margin = { top: 40, right: 30, bottom: 50, left: 60 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  // 计算比例尺
  const xScale = useMemo(
    () =>
      scaleBand({
        range: [0, innerWidth],
        domain: data.map((d) => d[xCol]),
        padding: 0.3,
      }),
    [data, xCol, innerWidth]
  );

  const yScale = useMemo(
    () =>
      scaleLinear({
        range: [innerHeight, 0],
        domain: [0, Math.max(...data.map((d) => d[yCol])) * 1.1],
      }),
    [data, yCol, innerHeight]
  );

  return (
    <div className="visx-chart-container">
      {title && (
        <h3 className="chart-title" style={{ textAlign: 'center', color: '#e2e8f0', marginBottom: '10px' }}>
          {title}
        </h3>
      )}
      <svg width={width} height={height}>
        <GradientPinkBlue id="line-gradient" />
        <Group left={margin.left} top={margin.top}>
          {/* 网格线 */}
          {yScale.ticks(5).map((tick, i) => (
            <line
              key={i}
              x1={0}
              x2={innerWidth}
              y1={yScale(tick)}
              y2={yScale(tick)}
              stroke={darkTheme.grid.stroke}
              strokeWidth={darkTheme.grid.strokeWidth}
            />
          ))}

          {/* 面积图 */}
          <AreaClosed
            data={data}
            x={(d) => xScale(d[xCol]) + xScale.bandwidth() / 2}
            y={(d) => yScale(d[yCol])}
            yScale={yScale}
            curve={curveMonotoneX}
            fill="url(#line-gradient)"
            opacity={0.3}
          />

          {/* 折线 */}
          <LinePath
            data={data}
            x={(d) => xScale(d[xCol]) + xScale.bandwidth() / 2}
            y={(d) => yScale(d[yCol])}
            curve={curveMonotoneX}
            stroke={colors.primary}
            strokeWidth={3}
          />

          {/* 数据点 */}
          {data.map((d, i) => (
            <circle
              key={i}
              cx={xScale(d[xCol]) + xScale.bandwidth() / 2}
              cy={yScale(d[yCol])}
              r={5}
              fill={colors.primary}
              stroke="#1a2236"
              strokeWidth={2}
              style={{ cursor: 'pointer' }}
            />
          ))}

          {/* X 轴 */}
          <AxisBottom
            scale={xScale}
            top={innerHeight}
            stroke={darkTheme.axis.stroke}
            tickStroke={darkTheme.axis.tickStroke}
            tickLabelProps={() => ({
              fill: darkTheme.axis.tickLabel.fill,
              fontSize: darkTheme.axis.tickLabel.fontSize,
              fontFamily: darkTheme.axis.tickLabel.fontFamily,
              textAnchor: 'middle',
            })}
          />

          {/* Y 轴 */}
          <AxisLeft
            scale={yScale}
            stroke={darkTheme.axis.stroke}
            tickStroke={darkTheme.axis.tickStroke}
            tickLabelProps={() => ({
              fill: darkTheme.axis.tickLabel.fill,
              fontSize: darkTheme.axis.tickLabel.fontSize,
              fontFamily: darkTheme.axis.tickLabel.fontFamily,
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
export function VisxPieChart({ data, yCol, title, width = 600, height = 400 }) {
  const margin = { top: 40, right: 30, bottom: 50, left: 30 };
  const radius = Math.min(width, height) / 2 - margin.top - margin.left;

  return (
    <div className="visx-chart-container">
      {title && (
        <h3 className="chart-title" style={{ textAlign: 'center', color: '#e2e8f0', marginBottom: '10px' }}>
          {title}
        </h3>
      )}
      <svg width={width} height={height}>
        <GradientPurpleRed id="pie-gradient-1" />
        <GradientTealBlue id="pie-gradient-2" />
        <Group left={width / 2} top={height / 2}>
          <Pie
            data={data}
            pieValue={(d) => d[yCol]}
            outerRadius={radius}
            innerRadius={radius * 0.5}
            cornerRadius={3}
            padAngle={0.02}
          >
            {(pie) => {
              return pie.arcs.map((arc, i) => {
                const arcPath = pie.path(arc);
                const color = colorPalette[i % colorPalette.length];
                return (
                  <g key={`arc-${i}`}>
                    <path d={arcPath} fill={color} stroke="#1a2236" strokeWidth={2} />
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
  const { chartType, xCol, yCol, title, colorCol } = config;

  if (!data || data.length === 0 || !xCol || !yCol) {
    return (
      <div className="flex items-center justify-center p-4 border border-red-200 bg-red-50 text-red-600 rounded-lg text-sm w-full h-[300px]">
        图表所需坐标轴数据未正确识别，无法为您绘制图形。
      </div>
    );
  }

  const width = 700;
  const commonProps = {
    data,
    xCol,
    yCol,
    title,
    colorCol,
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
  colors,
  colorPalette,
  darkTheme,
};
