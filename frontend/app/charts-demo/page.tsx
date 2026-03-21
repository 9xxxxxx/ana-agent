'use client';

/**
 * 多图表库演示页面
 * 展示 ECharts、Nivo、Visx 三种可视化库
 */

import { useState } from 'react';
import SmartChart from '@/components/charts/SmartChart';

const sampleDatasets = {
  sales: {
    name: '月度销售数据',
    data: [
      { month: '1月', sales: 4500 },
      { month: '2月', sales: 5200 },
      { month: '3月', sales: 4800 },
      { month: '4月', sales: 6100 },
      { month: '5月', sales: 5800 },
      { month: '6月', sales: 7200 },
      { month: '7月', sales: 6800 },
      { month: '8月', sales: 7500 },
      { month: '9月', sales: 8100 },
      { month: '10月', sales: 7800 },
      { month: '11月', sales: 8500 },
      { month: '12月', sales: 9200 },
    ],
    xCol: 'month',
    yCol: 'sales',
  },
  category: {
    name: '品类销售占比',
    data: [
      { category: '电子产品', amount: 42000 },
      { category: '服装配饰', amount: 28000 },
      { category: '家居用品', amount: 18000 },
      { category: '食品饮料', amount: 12000 },
      { category: '其他', amount: 8000 },
    ],
    xCol: 'category',
    yCol: 'amount',
  },
  funnel: {
    name: '用户转化漏斗',
    data: [
      { stage: '访问', count: 10000 },
      { stage: '注册', count: 6500 },
      { stage: '浏览商品', count: 4200 },
      { stage: '加入购物车', count: 2800 },
      { stage: '下单', count: 1500 },
      { stage: '支付', count: 1200 },
    ],
    xCol: 'stage',
    yCol: 'count',
  },
  scatter: {
    name: '广告投入与销售额关系',
    data: [
      { ad_spend: 100, sales: 450, region: '华东' },
      { ad_spend: 150, sales: 620, region: '华东' },
      { ad_spend: 200, sales: 780, region: '华东' },
      { ad_spend: 120, sales: 520, region: '华南' },
      { ad_spend: 180, sales: 710, region: '华南' },
      { ad_spend: 220, sales: 850, region: '华南' },
      { ad_spend: 90, sales: 380, region: '华北' },
      { ad_spend: 160, sales: 650, region: '华北' },
      { ad_spend: 250, sales: 920, region: '华北' },
      { ad_spend: 130, sales: 550, region: '西部' },
      { ad_spend: 190, sales: 720, region: '西部' },
      { ad_spend: 230, sales: 880, region: '西部' },
    ],
    xCol: 'ad_spend',
    yCol: 'sales',
    colorCol: 'region',
  },
  radar: {
    name: '产品评分对比',
    data: [
      { dimension: '性能', productA: 85, productB: 78 },
      { dimension: '价格', productA: 72, productB: 88 },
      { dimension: '外观', productA: 90, productB: 82 },
      { dimension: '续航', productA: 78, productB: 85 },
      { dimension: '口碑', productA: 82, productB: 80 },
    ],
    xCol: 'dimension',
    yCol: 'productA',
  },
};

const libraryInfo = [
  {
    id: 'echarts',
    name: 'ECharts',
    icon: '✨',
    description: '功能强大的可视化库，支持丰富的图表类型和流畅动画',
    features: ['16 图表类型', '流畅动画', '渐变主题', '响应式设计'],
    color: '#3b82f6',
  },
  {
    id: 'nivo',
    name: 'Nivo',
    icon: '🎨',
    description: '精美的 React 可视化库，设计感强，开箱即用',
    features: ['11 图表类型', '精美设计', '响应式', '暗色主题'],
    color: '#8b5cf6',
  },
  {
    id: 'visx',
    name: 'Visx',
    icon: '🔧',
    description: '低级别可视化组件库，高度可定制',
    features: ['3 图表类型', '高度可定制', '轻量级', '灵活组合'],
    color: '#10b981',
  },
];

export default function ChartsDemoPage() {
  const [activeDataset, setActiveDataset] = useState('sales');
  const [chartType, setChartType] = useState(null);
  const [selectedLibrary, setSelectedLibrary] = useState('echarts');

  const currentDataset = sampleDatasets[activeDataset];

  return (
    <div className="charts-demo-page">
      <header className="demo-header">
        <h1>📊 多图表库可视化演示</h1>
        <p>ECharts · Nivo · Visx 三大可视化库，一键切换对比效果</p>
      </header>

      {/* 图表库介绍 */}
      <section className="library-showcase">
        {libraryInfo.map((lib) => (
          <div
            key={lib.id}
            className={`library-card ${selectedLibrary === lib.id ? 'active' : ''}`}
            onClick={() => setSelectedLibrary(lib.id)}
          >
            <div className="library-icon" style={{ background: `${lib.color}20`, color: lib.color }}>
              {lib.icon}
            </div>
            <h3>{lib.name}</h3>
            <p>{lib.description}</p>
            <ul className="features">
              {lib.features.map((f, i) => (
                <li key={i}>{f}</li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      {/* 数据集选择 */}
      <div className="demo-controls">
        <div className="control-group">
          <label>选择数据集</label>
          <div className="button-group">
            {Object.entries(sampleDatasets).map(([key, dataset]) => (
              <button
                key={key}
                className={`control-btn ${activeDataset === key ? 'active' : ''}`}
                onClick={() => {
                  setActiveDataset(key);
                  setChartType(null);
                }}
              >
                {dataset.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 图表渲染区域 */}
      <div className="demo-chart-container">
        <SmartChart
          data={currentDataset.data}
          chartType={chartType}
          title={currentDataset.name}
          xCol={currentDataset.xCol}
          yCol={currentDataset.yCol}
          colorCol={currentDataset.colorCol}
          height={450}
          showTypeSelector={true}
          showLibrarySelector={true}
          defaultLibrary={selectedLibrary}
          onTypeChange={setChartType}
          onLibraryChange={setSelectedLibrary}
        />
      </div>

      {/* 功能说明 */}
      <section className="features-section">
        <h2>🎯 核心特性</h2>
        <div className="features-grid">
          <div className="feature-item">
            <span className="feature-icon">🔄</span>
            <h4>一键切换</h4>
            <p>在 ECharts、Nivo、Visx 之间无缝切换，对比不同库的渲染效果</p>
          </div>
          <div className="feature-item">
            <span className="feature-icon">🤖</span>
            <h4>智能推断</h4>
            <p>自动分析数据特征，推荐最佳图表类型</p>
          </div>
          <div className="feature-item">
            <span className="feature-icon">🎨</span>
            <h4>暗色主题</h4>
            <p>所有图表库统一暗色主题，与应用完美融合</p>
          </div>
          <div className="feature-item">
            <span className="feature-icon">📱</span>
            <h4>响应式</h4>
            <p>自适应各种屏幕尺寸，移动端友好</p>
          </div>
        </div>
      </section>

      <style jsx>{`
        .charts-demo-page {
          min-height: 100vh;
          background: var(--bg-primary);
          padding: var(--space-xl);
        }

        .demo-header {
          text-align: center;
          margin-bottom: var(--space-xl);
        }

        .demo-header h1 {
          font-size: 2rem;
          font-weight: 700;
          background: var(--accent-gradient);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          margin-bottom: var(--space-sm);
        }

        .demo-header p {
          color: var(--text-secondary);
        }

        .library-showcase {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: var(--space-lg);
          max-width: 1200px;
          margin: 0 auto var(--space-xl);
        }

        .library-card {
          background: var(--bg-secondary);
          border: 2px solid var(--border);
          border-radius: var(--radius-lg);
          padding: var(--space-lg);
          cursor: pointer;
          transition: all var(--transition-normal);
        }

        .library-card:hover {
          border-color: var(--accent);
          transform: translateY(-2px);
        }

        .library-card.active {
          border-color: var(--accent);
          background: var(--accent-glow);
        }

        .library-icon {
          width: 48px;
          height: 48px;
          border-radius: var(--radius-md);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.5rem;
          margin-bottom: var(--space-md);
        }

        .library-card h3 {
          font-size: 1.1rem;
          color: var(--text-primary);
          margin-bottom: var(--space-sm);
        }

        .library-card p {
          font-size: 0.85rem;
          color: var(--text-secondary);
          margin-bottom: var(--space-md);
        }

        .library-card .features {
          list-style: none;
          display: flex;
          flex-wrap: wrap;
          gap: var(--space-xs);
        }

        .library-card .features li {
          font-size: 0.75rem;
          padding: 2px 8px;
          background: var(--bg-tertiary);
          border-radius: var(--radius-sm);
          color: var(--text-tertiary);
        }

        .demo-controls {
          max-width: 1200px;
          margin: 0 auto var(--space-xl);
        }

        .control-group {
          margin-bottom: var(--space-md);
        }

        .control-group label {
          display: block;
          font-size: 0.85rem;
          color: var(--text-secondary);
          margin-bottom: var(--space-sm);
        }

        .button-group {
          display: flex;
          flex-wrap: wrap;
          gap: var(--space-sm);
        }

        .control-btn {
          padding: var(--space-sm) var(--space-md);
          background: var(--bg-secondary);
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          color: var(--text-secondary);
          font-size: 0.85rem;
          transition: all var(--transition-fast);
        }

        .control-btn:hover {
          background: var(--bg-hover);
          border-color: var(--accent);
          color: var(--text-primary);
        }

        .control-btn.active {
          background: var(--accent-glow);
          border-color: var(--accent);
          color: var(--accent);
        }

        .demo-chart-container {
          max-width: 1200px;
          margin: 0 auto var(--space-xl);
        }

        .features-section {
          max-width: 1200px;
          margin: 0 auto;
        }

        .features-section h2 {
          font-size: 1.5rem;
          color: var(--text-primary);
          margin-bottom: var(--space-lg);
          text-align: center;
        }

        .features-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: var(--space-lg);
        }

        .feature-item {
          background: var(--bg-secondary);
          border: 1px solid var(--border);
          border-radius: var(--radius-lg);
          padding: var(--space-lg);
          text-align: center;
        }

        .feature-icon {
          font-size: 2rem;
          margin-bottom: var(--space-sm);
          display: block;
        }

        .feature-item h4 {
          font-size: 1rem;
          color: var(--text-primary);
          margin-bottom: var(--space-xs);
        }

        .feature-item p {
          font-size: 0.85rem;
          color: var(--text-secondary);
        }
      `}</style>
    </div>
  );
}
