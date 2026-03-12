'use client';

/**
 * Plotly 图表渲染组件
 * 使用 dynamic import 避免 SSR 问题
 */

import dynamic from 'next/dynamic';

// Plotly 不支持 SSR，必须禁用
const Plot = dynamic(() => import('react-plotly.js'), { ssr: false });

export default function ChartRenderer({ chartJson }) {
  try {
    const figData = JSON.parse(chartJson);

    // 覆盖布局中的背景色以匹配暗色主题
    const layout = {
      ...figData.layout,
      paper_bgcolor: 'transparent',
      plot_bgcolor: 'rgba(17, 24, 39, 0.8)',
      font: { color: '#94a3b8', family: 'Inter, sans-serif' },
      margin: { l: 50, r: 30, t: 50, b: 50 },
    };

    return (
      <div className="chart-container">
        <Plot
          data={figData.data}
          layout={layout}
          config={{
            responsive: true,
            displayModeBar: true,
            displaylogo: false,
            modeBarButtonsToRemove: ['lasso2d', 'select2d'],
          }}
          style={{ width: '100%', height: '400px' }}
        />
      </div>
    );
  } catch (e) {
    return (
      <div className="chart-container" style={{ padding: '16px', color: 'var(--error)' }}>
        ❌ 图表渲染失败: {e.message}
      </div>
    );
  }
}
