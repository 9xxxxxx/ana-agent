'use client';

/**
 * Nivo 图表渲染器
 * 使用 @nivo 系列库渲染精美的可视化图表
 */

import { useMemo } from 'react';
import { ResponsiveBar } from '@nivo/bar';
import { ResponsiveLine } from '@nivo/line';
import { ResponsivePie } from '@nivo/pie';
import { ResponsiveScatterPlot } from '@nivo/scatterplot';
import { ResponsiveRadar } from '@nivo/radar';
import { ResponsiveFunnel } from '@nivo/funnel';
import { ResponsiveTreeMap } from '@nivo/treemap';
import { ResponsiveHeatMap } from '@nivo/heatmap';
import { ResponsiveSunburst } from '@nivo/sunburst';
import { ResponsiveBullet } from '@nivo/bullet';

// Nivo 暗色主题
const nivoTheme = {
  background: 'transparent',
  text: {
    fill: '#94a3b8',
    fontSize: 12,
    fontFamily: 'Inter, sans-serif',
  },
  axis: {
    domain: {
      line: {
        stroke: '#334155',
        strokeWidth: 1,
      },
    },
    legend: {
      text: {
        fill: '#94a3b8',
        fontSize: 12,
      },
    },
    ticks: {
      line: {
        stroke: '#334155',
        strokeWidth: 1,
      },
      text: {
        fill: '#94a3b8',
        fontSize: 11,
      },
    },
  },
  grid: {
    line: {
      stroke: '#1e293b',
      strokeWidth: 1,
    },
  },
  legends: {
    text: {
      fill: '#94a3b8',
      fontSize: 12,
    },
  },
  labels: {
    text: {
      fill: '#94a3b8',
      fontSize: 11,
    },
  },
  tooltip: {
    container: {
      background: '#1a2236',
      color: '#e2e8f0',
      fontSize: 12,
      borderRadius: '8px',
      boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5)',
    },
  },
};

// 渐变色
const nivoColors = [
  '#3b82f6',
  '#8b5cf6',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#06b6d4',
  '#ec4899',
  '#14b8a6',
];

/**
 * 柱状图
 */
function NivoBarChart({ data, xCol, yCol, title, colorCol }) {
  const chartData = useMemo(() => {
    if (colorCol) {
      const grouped = {};
      data.forEach((d) => {
        const key = d[colorCol];
        if (!grouped[key]) grouped[key] = {};
        grouped[key][d[xCol]] = d[yCol];
        grouped[key]['category'] = key;
      });
      return Object.values(grouped);
    }
    
    return data.map((d) => ({
      category: d[xCol],
      [yCol]: d[yCol],
    }));
  }, [data, xCol, yCol, colorCol]);

  const keys = colorCol
    ? [...new Set(data.map((d) => d[colorCol]))]
    : [yCol];

  return (
    <div className="nivo-chart-container">
      {title && <h3 className="chart-title">{title}</h3>}
      <ResponsiveBar
        data={chartData}
        keys={keys}
        indexBy="category"
        margin={{ top: 50, right: 130, bottom: 50, left: 60 }}
        padding={0.3}
        colors={nivoColors}
        theme={nivoTheme}
        borderColor={{ from: 'color', modifiers: [['darker', 1.6]] }}
        axisTop={null}
        axisRight={null}
        axisBottom={{
          tickSize: 5,
          tickPadding: 5,
          tickRotation: 0,
          legend: xCol,
          legendPosition: 'middle',
          legendOffset: 32,
        }}
        axisLeft={{
          tickSize: 5,
          tickPadding: 5,
          tickRotation: 0,
          legend: yCol,
          legendPosition: 'middle',
          legendOffset: -40,
        }}
        labelSkipWidth={12}
        labelSkipHeight={12}
        labelTextColor={{ from: 'color', modifiers: [['darker', 3]] }}
        legends={[
          {
            dataFrom: 'keys',
            anchor: 'bottom-right',
            direction: 'column',
            justify: false,
            translateX: 120,
            translateY: 0,
            itemsSpacing: 2,
            itemWidth: 100,
            itemHeight: 20,
            itemDirection: 'left-to-right',
            symbolSize: 20,
          },
        ]}
        animate={true}
        motionStiffness={90}
        motionDamping={15}
      />
    </div>
  );
}

/**
 * 折线图
 */
function NivoLineChart({ data, xCol, yCol, title, colorCol }) {
  const chartData = useMemo(() => {
    if (colorCol) {
      const grouped = {};
      data.forEach((d) => {
        const key = d[colorCol];
        if (!grouped[key]) {
          grouped[key] = {
            id: key,
            data: [],
          };
        }
        grouped[key].data.push({
          x: d[xCol],
          y: d[yCol],
        });
      });
      return Object.values(grouped);
    }
    
    return [
      {
        id: title || '数据',
        data: data.map((d) => ({
          x: d[xCol],
          y: d[yCol],
        })),
      },
    ];
  }, [data, xCol, yCol, title, colorCol]);

  return (
    <div className="nivo-chart-container">
      {title && <h3 className="chart-title">{title}</h3>}
      <ResponsiveLine
        data={chartData}
        margin={{ top: 50, right: 110, bottom: 50, left: 60 }}
        xScale={{ type: 'point' }}
        yScale={{
          type: 'linear',
          min: 'auto',
          max: 'auto',
          stacked: false,
          reverse: false,
        }}
        curve="monotoneX"
        axisTop={null}
        axisRight={null}
        axisBottom={{
          tickSize: 5,
          tickPadding: 5,
          tickRotation: 0,
          legend: xCol,
          legendOffset: 36,
          legendPosition: 'middle',
        }}
        axisLeft={{
          tickSize: 5,
          tickPadding: 5,
          tickRotation: 0,
          legend: yCol,
          legendOffset: -40,
          legendPosition: 'middle',
        }}
        colors={nivoColors}
        theme={nivoTheme}
        pointSize={8}
        pointColor={{ theme: 'background' }}
        pointBorderWidth={2}
        pointBorderColor={{ from: 'serieColor' }}
        pointLabelYOffset={-12}
        useMesh={true}
        legends={[
          {
            anchor: 'bottom-right',
            direction: 'column',
            justify: false,
            translateX: 100,
            translateY: 0,
            itemsSpacing: 0,
            itemDirection: 'left-to-right',
            itemWidth: 80,
            itemHeight: 20,
            symbolSize: 12,
            symbolShape: 'circle',
          },
        ]}
        animate={true}
        motionStiffness={90}
        motionDamping={15}
      />
    </div>
  );
}

/**
 * 饼图
 */
function NivoPieChart({ data, xCol, yCol, title }) {
  const chartData = useMemo(() => {
    return data.map((d, i) => ({
      id: d[xCol],
      label: d[xCol],
      value: d[yCol],
      color: nivoColors[i % nivoColors.length],
    }));
  }, [data, xCol, yCol]);

  return (
    <div className="nivo-chart-container">
      {title && <h3 className="chart-title">{title}</h3>}
      <ResponsivePie
        data={chartData}
        margin={{ top: 40, right: 80, bottom: 80, left: 80 }}
        innerRadius={0.5}
        padAngle={0.7}
        cornerRadius={3}
        colors={nivoColors}
        borderWidth={1}
        borderColor={{ from: 'color', modifiers: [['darker', 0.2]] }}
        radialLabelsSkipAngle={10}
        radialLabelsTextColor="#94a3b8"
        radialLabelsLinkColor={{ from: 'color' }}
        sliceLabelsSkipAngle={10}
        sliceLabelsTextColor="#e2e8f0"
        theme={nivoTheme}
        legends={[
          {
            anchor: 'bottom',
            direction: 'row',
            justify: false,
            translateX: 0,
            translateY: 56,
            itemsSpacing: 0,
            itemWidth: 100,
            itemHeight: 18,
            itemTextColor: '#94a3b8',
            itemDirection: 'left-to-right',
            symbolSize: 18,
            symbolShape: 'circle',
          },
        ]}
        animate={true}
        motionStiffness={90}
        motionDamping={15}
      />
    </div>
  );
}

/**
 * 散点图
 */
function NivoScatterChart({ data, xCol, yCol, title, colorCol }) {
  const chartData = useMemo(() => {
    if (colorCol) {
      const grouped = {};
      data.forEach((d) => {
        const key = d[colorCol];
        if (!grouped[key]) {
          grouped[key] = {
            id: key,
            data: [],
          };
        }
        grouped[key].data.push({
          x: d[xCol],
          y: d[yCol],
        });
      });
      return Object.values(grouped);
    }
    
    return [
      {
        id: title || '数据',
        data: data.map((d) => ({
          x: d[xCol],
          y: d[yCol],
        })),
      },
    ];
  }, [data, xCol, yCol, title, colorCol]);

  return (
    <div className="nivo-chart-container">
      {title && <h3 className="chart-title">{title}</h3>}
      <ResponsiveScatterPlot
        data={chartData}
        margin={{ top: 60, right: 140, bottom: 70, left: 90 }}
        xScale={{ type: 'linear', min: 'auto', max: 'auto' }}
        yScale={{ type: 'linear', min: 'auto', max: 'auto' }}
        colors={nivoColors}
        theme={nivoTheme}
        blendMode="multiply"
        nodeSize={8}
        axisTop={null}
        axisRight={null}
        axisBottom={{
          orient: 'bottom',
          tickSize: 5,
          tickPadding: 5,
          tickRotation: 0,
          legend: xCol,
          legendPosition: 'middle',
          legendOffset: 46,
        }}
        axisLeft={{
          orient: 'left',
          tickSize: 5,
          tickPadding: 5,
          tickRotation: 0,
          legend: yCol,
          legendPosition: 'middle',
          legendOffset: -60,
        }}
        legends={[
          {
            anchor: 'bottom-right',
            direction: 'column',
            justify: false,
            translateX: 130,
            translateY: 0,
            itemWidth: 100,
            itemHeight: 12,
            itemsSpacing: 5,
            itemDirection: 'left-to-right',
            symbolSize: 12,
            symbolShape: 'circle',
          },
        ]}
        animate={true}
        motionStiffness={90}
        motionDamping={15}
      />
    </div>
  );
}

/**
 * 雷达图
 */
function NivoRadarChart({ data, xCol, yCol, title }) {
  const chartData = useMemo(() => {
    return data.map((d) => ({
      category: d[xCol],
      [title || 'value']: d[yCol],
    }));
  }, [data, xCol, yCol, title]);

  const keys = [title || 'value'];

  return (
    <div className="nivo-chart-container">
      {title && <h3 className="chart-title">{title}</h3>}
      <ResponsiveRadar
        data={chartData}
        keys={keys}
        indexBy="category"
        maxValue="auto"
        margin={{ top: 70, right: 80, bottom: 40, left: 80 }}
        curve="linearClosed"
        borderWidth={2}
        borderColor={{ from: 'color' }}
        gridLevels={5}
        gridShape="circular"
        gridLabelOffset={36}
        colors={nivoColors}
        theme={nivoTheme}
        fillOpacity={0.25}
        blendMode="multiply"
        animate={true}
        motionStiffness={90}
        motionDamping={15}
        legends={[
          {
            anchor: 'top-left',
            direction: 'column',
            translateX: -50,
            translateY: -40,
            itemWidth: 80,
            itemHeight: 20,
            symbolSize: 12,
            symbolShape: 'circle',
          },
        ]}
      />
    </div>
  );
}

/**
 * 漏斗图
 */
function NivoFunnelChart({ data, xCol, yCol, title }) {
  const chartData = useMemo(() => {
    return data.map((d) => ({
      id: d[xCol],
      value: d[yCol],
      label: d[xCol],
    }));
  }, [data, xCol, yCol]);

  return (
    <div className="nivo-chart-container">
      {title && <h3 className="chart-title">{title}</h3>}
      <ResponsiveFunnel
        data={chartData}
        margin={{ top: 20, right: 20, bottom: 20, left: 20 }}
        valueFormat=">-.4s"
        colors={nivoColors}
        borderWidth={20}
        borderColor={{ from: 'color', modifiers: [] }}
        labelColor={{
          from: 'color',
          modifiers: [['darker', 3]],
        }}
        theme={nivoTheme}
        beforeSeparatorLength={100}
        beforeSeparatorOffset={20}
        afterSeparatorLength={100}
        afterSeparatorOffset={20}
        currentPartSizeExtension={10}
        currentBorderWidth={40}
        animate={true}
        motionStiffness={90}
        motionDamping={15}
      />
    </div>
  );
}

/**
 * 树图
 */
function NivoTreemapChart({ data, xCol, yCol, title }) {
  const chartData = useMemo(() => {
    return {
      name: 'root',
      children: data.map((d) => ({
        name: d[xCol],
        value: d[yCol],
      })),
    };
  }, [data, xCol, yCol]);

  return (
    <div className="nivo-chart-container">
      {title && <h3 className="chart-title">{title}</h3>}
      <ResponsiveTreeMap
        data={chartData}
        identity="name"
        value="value"
        margin={{ top: 10, right: 10, bottom: 10, left: 10 }}
        labelSkipSize={12}
        labelTextColor={{ from: 'color', modifiers: [['darker', 1.2]] }}
        parentLabelTextColor={{ from: 'color', modifiers: [['darker', 2]] }}
        borderColor={{ from: 'color', modifiers: [['darker', 0.1]] }}
        colors={nivoColors}
        theme={nivoTheme}
        animate={true}
        motionStiffness={90}
        motionDamping={15}
      />
    </div>
  );
}

/**
 * 热力图
 */
function NivoHeatmapChart({ data, xCol, yCol, title, colorCol }) {
  const chartData = useMemo(() => {
    const keys = colorCol ? [...new Set(data.map((d) => d[colorCol]))] : [yCol];
    const xValues = [...new Set(data.map((d) => d[xCol]))];
    
    return xValues.map((x) => {
      const row = { id: x };
      keys.forEach((key) => {
        const item = data.find((d) => d[xCol] === x && (colorCol ? d[colorCol] === key : true));
        row[key] = item ? item[yCol] : 0;
      });
      return row;
    });
  }, [data, xCol, yCol, colorCol]);

  const keys = useMemo(() => {
    return colorCol ? [...new Set(data.map((d) => d[colorCol]))] : [yCol];
  }, [data, colorCol, yCol]);

  return (
    <div className="nivo-chart-container">
      {title && <h3 className="chart-title">{title}</h3>}
      <ResponsiveHeatMap
        data={chartData}
        keys={keys}
        margin={{ top: 60, right: 90, bottom: 60, left: 90 }}
        forceSquare={false}
        axisTop={{ orient: 'top', tickSize: 5, tickPadding: 5, tickRotation: -90 }}
        axisRight={null}
        axisBottom={{ orient: 'bottom', tickSize: 5, tickPadding: 5, tickRotation: -45 }}
        axisLeft={{ orient: 'left', tickSize: 5, tickPadding: 5, tickRotation: 0 }}
        cellOpacity={1}
        cellBorderColor={{ from: 'color', modifiers: [['darker', 0.4]] }}
        labelTextColor={{ from: 'color', modifiers: [['darker', 1.8]] }}
        defs={[
          {
            id: 'dots',
            type: 'patternDots',
            background: 'inherit',
            color: 'rgba(255, 255, 255, 0.2)',
            size: 4,
            padding: 1,
            stagger: true,
          },
        ]}
        fill={[{ id: 'dots' }]}
        animate={true}
        motionStiffness={80}
        motionDamping={9}
        hoverTarget="cell"
        cellHoverOthersOpacity={0.25}
        theme={nivoTheme}
      />
    </div>
  );
}

/**
 * 旭日图
 */
function NivoSunburstChart({ data, xCol, yCol, title }) {
  const chartData = useMemo(() => {
    return {
      name: 'root',
      children: data.map((d) => ({
        name: d[xCol],
        value: d[yCol],
      })),
    };
  }, [data, xCol, yCol]);

  return (
    <div className="nivo-chart-container">
      {title && <h3 className="chart-title">{title}</h3>}
      <ResponsiveSunburst
        data={chartData}
        margin={{ top: 40, right: 40, bottom: 40, left: 40 }}
        identity="name"
        value="value"
        cornerRadius={2}
        borderColor={{ theme: 'background' }}
        colors={nivoColors}
        childColor={{ from: 'color', modifiers: [['brighter', 0.2]] }}
        animate={true}
        motionStiffness={90}
        motionDamping={15}
        isInteractive={true}
        theme={nivoTheme}
      />
    </div>
  );
}

/**
 * 子弹图
 */
function NivoBulletChart({ data, xCol, yCol, title }) {
  const chartData = useMemo(() => {
    return data.map((d) => ({
      id: d[xCol],
      ranges: [0, d[yCol] * 0.5, d[yCol] * 0.8, d[yCol] * 1.2],
      measures: [d[yCol] * 0.3, d[yCol]],
      markers: [d[yCol] * 0.9],
    }));
  }, [data, xCol, yCol]);

  return (
    <div className="nivo-chart-container">
      {title && <h3 className="chart-title">{title}</h3>}
      <ResponsiveBullet
        data={chartData}
        margin={{ top: 50, right: 90, bottom: 50, left: 90 }}
        spacing={46}
        titleAlign="start"
        titleOffsetX={-70}
        measureSize={0.2}
        markerSize={0.7}
        rangeColors="seq_blue"
        measureColors="seq_green"
        markerColors="seq_red"
        animate={true}
        motionStiffness={90}
        motionDamping={15}
        theme={nivoTheme}
      />
    </div>
  );
}

/**
 * Nivo 图表渲染器主组件
 */
export default function NivoRenderer({
  data,
  config,
  height = 400,
}) {
  const { chartType, xCol, yCol, title, colorCol } = config;

  if (!data || data.length === 0) {
    return (
      <div className="chart-error">
        暂无数据
      </div>
    );
  }

  const commonProps = {
    data,
    xCol,
    yCol,
    title,
    colorCol,
  };

  switch (chartType) {
    case 'bar':
    case 'horizontal_bar':
      return (
        <div style={{ height }}>
          <NivoBarChart {...commonProps} />
        </div>
      );
    case 'line':
    case 'area':
      return (
        <div style={{ height }}>
          <NivoLineChart {...commonProps} />
        </div>
      );
    case 'pie':
      return (
        <div style={{ height }}>
          <NivoPieChart {...commonProps} />
        </div>
      );
    case 'scatter':
      return (
        <div style={{ height }}>
          <NivoScatterChart {...commonProps} />
        </div>
      );
    case 'radar':
      return (
        <div style={{ height }}>
          <NivoRadarChart {...commonProps} />
        </div>
      );
    case 'funnel':
      return (
        <div style={{ height }}>
          <NivoFunnelChart {...commonProps} />
        </div>
      );
    case 'treemap':
      return (
        <div style={{ height }}>
          <NivoTreemapChart {...commonProps} />
        </div>
      );
    case 'heatmap':
      return (
        <div style={{ height }}>
          <NivoHeatmapChart {...commonProps} />
        </div>
      );
    case 'sunburst':
      return (
        <div style={{ height }}>
          <NivoSunburstChart {...commonProps} />
        </div>
      );
    case 'bullet':
      return (
        <div style={{ height }}>
          <NivoBulletChart {...commonProps} />
        </div>
      );
    default:
      return (
        <div style={{ height }}>
          <NivoBarChart {...commonProps} />
        </div>
      );
  }
}

export {
  NivoBarChart,
  NivoLineChart,
  NivoPieChart,
  NivoScatterChart,
  NivoRadarChart,
  NivoFunnelChart,
  NivoTreemapChart,
  NivoHeatmapChart,
  NivoSunburstChart,
  NivoBulletChart,
  nivoTheme,
  nivoColors,
};
