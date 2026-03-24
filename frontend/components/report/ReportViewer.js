'use client';

/**
 * 深度业务报告查看器组件
 * 支持章节导航、图表展示、指标卡片、数据表格
 */

import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import MetricCard from './MetricCard';
import DataTable from './DataTable';
import SectionNavigator from './SectionNavigator';
import SmartChart from '../charts/SmartChart';
import { parseChartPayload } from '@/lib/chartData';

export default function ReportViewer({ report, onExport, onClose }) {
  const [activeSection, setActiveSection] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const contentRef = useRef(null);

  // 监听滚动更新当前章节
  useEffect(() => {
    const handleScroll = () => {
      if (!contentRef.current) return;
      
      const sections = contentRef.current.querySelectorAll('[data-section-index]');
      const scrollTop = contentRef.current.scrollTop;
      
      for (let i = sections.length - 1; i >= 0; i--) {
        const section = sections[i];
        if (section.offsetTop <= scrollTop + 100) {
          setActiveSection(i);
          break;
        }
      }
    };

    const container = contentRef.current;
    if (container) {
      container.addEventListener('scroll', handleScroll);
      return () => container.removeEventListener('scroll', handleScroll);
    }
  }, []);

  // 跳转到指定章节
  const scrollToSection = (index) => {
    const section = contentRef.current?.querySelector(`[data-section-index="${index}"]`);
    if (section) {
      section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  if (!report) return null;

  return (
    <div className={`flex flex-col h-full w-full bg-background text-foreground relative ${isFullscreen ? 'fixed inset-0 z-[100]' : ''}`}>
      {/* 报告头部 */}
      <header className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 p-5 sm:p-6 lg:px-8 border-b border-border bg-popover shrink-0 z-10 shadow-sm relative">
        <div className="flex-1 min-w-0 flex flex-col gap-2">
          <div className="flex items-center gap-3 text-sm">
            <span className="px-2.5 py-0.5 rounded-md bg-primary/10 text-primary font-medium border border-primary/20">{report.type || '业务报告'}</span>
            <span className="text-muted-foreground font-mono text-xs">{report.createdAt}</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-foreground tracking-tight leading-snug">{report.title}</h1>
          {report.subtitle && <p className="text-muted-foreground text-base">{report.subtitle}</p>}
          
          {/* 指标概览 */}
          {report.metrics && (
            <div className="flex flex-wrap gap-4 mt-3">
              {report.metrics.map((metric, i) => (
                <MetricCard key={i} {...metric} />
              ))}
            </div>
          )}
        </div>
        
        <div className="flex items-center gap-2 shrink-0 self-end sm:self-start mt-2 sm:mt-0">
          <button className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors" onClick={() => setIsFullscreen(!isFullscreen)} title={isFullscreen ? '退出全屏' : '全屏查看'}>
            {isFullscreen ? '⛶' : '⛶'}
          </button>
          <button className="px-3 py-1.5 text-sm font-medium text-muted-foreground bg-popover border border-border hover:bg-muted hover:text-primary rounded-lg shadow-sm transition-all" onClick={() => onExport?.('pdf')}>导出 PDF</button>
          <button className="px-3 py-1.5 text-sm font-medium text-muted-foreground bg-popover border border-border hover:bg-muted hover:text-primary rounded-lg shadow-sm transition-all" onClick={() => onExport?.('markdown')}>导出 MD</button>
          {onClose && <button className="p-2 ml-1 text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10 rounded-lg transition-colors" onClick={onClose}>✕</button>}
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden bg-background">
        {/* 章节导航 */}
        <SectionNavigator
          sections={report.sections}
          activeIndex={activeSection}
          onSelect={scrollToSection}
        />

        {/* 报告内容 */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-8 lg:p-12 scroll-smooth bg-background bg-[radial-gradient(var(--border)_1px,transparent_1px)] [background-size:16px_16px]" ref={contentRef}>
          <div className="max-w-4xl mx-auto flex flex-col gap-10 pb-20">
            {report.summary && (
              <div className="bg-popover p-8 rounded-2xl shadow-sm border border-border">
                <h2 className="text-xl font-bold text-foreground mb-4 flex items-center gap-2">
                  <span className="w-1.5 h-6 bg-primary rounded-full inline-block"></span>
                  执行摘要
                </h2>
                <div className="prose prose-slate dark:prose-invert max-w-none text-muted-foreground leading-[1.8]">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{report.summary}</ReactMarkdown>
                </div>
              </div>
            )}

            {report.sections?.map((section, index) => (
              <section
                key={index}
                className="bg-popover p-6 sm:p-10 rounded-3xl shadow-sm border border-border transition-all hover:shadow-md"
                data-section-index={index}
              >
                <h2 className="text-2xl font-bold text-foreground mb-8 flex items-center gap-3 border-b border-border pb-5">
                  <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/20 text-primary text-sm font-black">{index + 1}</span>
                  {section.title}
                </h2>
                
                {section.content && (
                  <div className="prose prose-slate dark:prose-invert prose-lg max-w-none text-foreground/80 leading-relaxed mb-10">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {section.content}
                    </ReactMarkdown>
                  </div>
                )}

                {/* 章节内的图表 */}
                {section.charts?.length > 0 && (
                  <div className="flex flex-col gap-8 mb-10">
                    {section.charts.map((chart, chartIndex) => (
                      <div key={chartIndex} className="bg-muted/30 p-6 rounded-2xl border border-border">
                        {chart.title && <h4 className="text-sm font-bold tracking-wider text-muted-foreground mb-5 text-center uppercase">{chart.title}</h4>}
                        <div className="bg-popover rounded-xl p-2 sm:p-4 shadow-sm ring-1 ring-foreground/5">
                          <ChartRenderer chartJson={chart.data} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* 章节内的数据表格 */}
                {section.table && (
                  <div className="mb-10 overflow-hidden rounded-2xl border border-border shadow-sm">
                    <DataTable
                      data={section.table.data}
                      columns={section.table.columns}
                      title={section.table.title}
                    />
                  </div>
                )}

                {/* 章节内的指标 */}
                {section.metrics && (
                  <div className="flex flex-wrap gap-4 mt-8 pt-6 border-t border-border">
                    {section.metrics.map((metric, i) => (
                      <MetricCard key={i} {...metric} size="small" />
                    ))}
                  </div>
                )}
              </section>
            ))}

            {/* 结论与建议 */}
            {report.conclusion && (
              <div className="bg-gradient-to-br from-primary/10 to-transparent p-8 sm:p-10 rounded-3xl border border-primary/20 shadow-sm relative overflow-hidden">
                <div className="absolute top-0 right-0 p-8 opacity-10 text-8xl">💡</div>
                <h2 className="text-2xl font-bold text-foreground mb-6 flex items-center gap-2 relative z-10">
                  <span className="text-primary">💡</span>
                  结论与建议
                </h2>
                <div className="prose prose-slate dark:prose-invert prose-lg max-w-none text-foreground/90 leading-relaxed relative z-10">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {report.conclusion}
                  </ReactMarkdown>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * 图表渲染器
 */
function ChartRenderer({ chartJson }) {
  const [error, setError] = useState(null);
  const [chartData, setChartData] = useState(null);

  useEffect(() => {
    if (!chartJson) {
      setError('图表数据为空');
      return;
    }

    try {
      const parsed = parseChartPayload(chartJson);

      // 验证解析后的数据结构
      if (!parsed) {
        throw new Error('图表数据为空');
      }
      
      setChartData(parsed);
      setError(null);
    } catch (e) {
      setError(e.message);
      console.error('图表数据解析错误:', chartJson);
    }
  }, [chartJson]);

  if (error) {
    return (
      <div className="chart-error">
        ❌ 图表渲染失败: {error}
        <div style={{ marginTop: '10px', fontSize: '0.8rem', opacity: 0.7 }}>
          提示: 图表数据格式可能不正确，请检查数据源
        </div>
        <div style={{ marginTop: '8px', fontSize: '0.7rem', opacity: 0.5, wordBreak: 'break-all' }}>
          数据预览: {typeof chartJson === 'string' ? chartJson.substring(0, 200) + '...' : JSON.stringify(chartJson).substring(0, 200) + '...'}
        </div>
      </div>
    );
  }

  if (!chartData) {
    return (
      <div className="chart-wrapper">
        <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-tertiary)' }}>
          加载中...
        </div>
      </div>
    );
  }

  // 新格式：原始数据格式
  if (chartData.type === 'chart_data' && chartData.data) {
    return (
      <SmartChart
        data={chartData.data}
        chartType={chartData.chartType}
        title={chartData.title}
        xCol={chartData.xCol}
        yCol={chartData.yCol}
        colorCol={chartData.colorCol}
        sizeCol={chartData.sizeCol}
        height={350}
        showTypeSelector={false}
        showLibrarySelector={false}
      />
    );
  }

  // 旧格式：Plotly 格式
  if (chartData.data && chartData.layout) {
    // 转换为新格式
    const trace = chartData.data[0];
    const xData = trace.x || [];
    const yData = trace.y || [];
    
    const data = xData.map((x, i) => ({
      [trace.name || 'category']: x,
      [trace.name || 'value']: yData[i],
    }));

    let chartType = 'bar';
    if (trace.type === 'scatter') chartType = 'line';
    if (trace.type === 'pie') chartType = 'pie';

    return (
      <SmartChart
        data={data}
        chartType={chartType}
        title={chartData.layout.title?.text || ''}
        xCol={trace.name || 'category'}
        yCol={trace.name || 'value'}
        height={350}
        showTypeSelector={false}
        showLibrarySelector={false}
      />
    );
  }

  // 纯数据数组
  if (Array.isArray(chartData)) {
    return (
      <SmartChart
        data={chartData}
        height={350}
        showTypeSelector={false}
        showLibrarySelector={false}
      />
    );
  }

  return (
    <div className="chart-error">
      ❌ 无法识别的图表数据格式
    </div>
  );
}
