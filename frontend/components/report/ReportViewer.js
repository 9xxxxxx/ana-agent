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
    <div className={`flex flex-col h-full w-full bg-white text-gray-800 relative ${isFullscreen ? 'fixed inset-0 z-[100]' : ''}`}>
      {/* 报告头部 */}
      <header className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 p-5 sm:p-6 lg:px-8 border-b border-gray-200 bg-white shrink-0 z-10 shadow-sm relative">
        <div className="flex-1 min-w-0 flex flex-col gap-2">
          <div className="flex items-center gap-3 text-sm">
            <span className="px-2.5 py-0.5 rounded-md bg-brand-50 text-brand-700 font-medium border border-brand-200/50">{report.type || '业务报告'}</span>
            <span className="text-gray-400 font-mono text-xs">{report.createdAt}</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight leading-snug">{report.title}</h1>
          {report.subtitle && <p className="text-gray-500 text-base">{report.subtitle}</p>}
          
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
          <button className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors" onClick={() => setIsFullscreen(!isFullscreen)} title={isFullscreen ? '退出全屏' : '全屏查看'}>
            {isFullscreen ? '⛶' : '⛶'}
          </button>
          <button className="px-3 py-1.5 text-sm font-medium text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 hover:text-brand-600 rounded-lg shadow-sm transition-all" onClick={() => onExport?.('pdf')}>导出 PDF</button>
          <button className="px-3 py-1.5 text-sm font-medium text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 hover:text-brand-600 rounded-lg shadow-sm transition-all" onClick={() => onExport?.('markdown')}>导出 MD</button>
          {onClose && <button className="p-2 ml-1 text-gray-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors" onClick={onClose}>✕</button>}
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden bg-white">
        {/* 章节导航 */}
        <SectionNavigator
          sections={report.sections}
          activeIndex={activeSection}
          onSelect={scrollToSection}
        />

        {/* 报告内容 */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-8 lg:p-12 scroll-smooth bg-gray-50 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:16px_16px]" ref={contentRef}>
          <div className="max-w-4xl mx-auto flex flex-col gap-10 pb-20">
            {report.summary && (
              <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
                <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <span className="w-1.5 h-6 bg-brand-500 rounded-full inline-block"></span>
                  执行摘要
                </h2>
                <div className="prose prose-slate max-w-none text-gray-600 leading-[1.8]">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{report.summary}</ReactMarkdown>
                </div>
              </div>
            )}

            {report.sections?.map((section, index) => (
              <section
                key={index}
                className="bg-white p-6 sm:p-10 rounded-3xl shadow-sm border border-gray-100 transition-all hover:shadow-md"
                data-section-index={index}
              >
                <h2 className="text-2xl font-bold text-gray-900 mb-8 flex items-center gap-3 border-b border-gray-100 pb-5">
                  <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-brand-50 text-brand-600 text-sm font-black">{index + 1}</span>
                  {section.title}
                </h2>
                
                {section.content && (
                  <div className="prose prose-slate prose-lg max-w-none text-gray-700 leading-relaxed mb-10">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {section.content}
                    </ReactMarkdown>
                  </div>
                )}

                {/* 章节内的图表 */}
                {section.charts?.length > 0 && (
                  <div className="flex flex-col gap-8 mb-10">
                    {section.charts.map((chart, chartIndex) => (
                      <div key={chartIndex} className="bg-gray-50/50 p-6 rounded-2xl border border-gray-100">
                        {chart.title && <h4 className="text-sm font-bold tracking-wider text-gray-500 mb-5 text-center uppercase">{chart.title}</h4>}
                        <div className="bg-white rounded-xl p-2 sm:p-4 shadow-sm ring-1 ring-gray-900/5">
                          <ChartRenderer chartJson={chart.data} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* 章节内的数据表格 */}
                {section.table && (
                  <div className="mb-10 overflow-hidden rounded-2xl border border-gray-200 shadow-sm">
                    <DataTable
                      data={section.table.data}
                      columns={section.table.columns}
                      title={section.table.title}
                    />
                  </div>
                )}

                {/* 章节内的指标 */}
                {section.metrics && (
                  <div className="flex flex-wrap gap-4 mt-8 pt-6 border-t border-gray-50">
                    {section.metrics.map((metric, i) => (
                      <MetricCard key={i} {...metric} size="small" />
                    ))}
                  </div>
                )}
              </section>
            ))}

            {/* 结论与建议 */}
            {report.conclusion && (
              <div className="bg-gradient-to-br from-brand-50/80 to-white p-8 sm:p-10 rounded-3xl border border-brand-100 shadow-sm relative overflow-hidden">
                <div className="absolute top-0 right-0 p-8 opacity-10 text-8xl">💡</div>
                <h2 className="text-2xl font-bold text-brand-900 mb-6 flex items-center gap-2 relative z-10">
                  <span className="text-brand-500">💡</span>
                  结论与建议
                </h2>
                <div className="prose prose-brand prose-lg max-w-none text-brand-800 leading-relaxed relative z-10">
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
      let parsed;
      if (typeof chartJson === 'string') {
        // 尝试清理和解析 JSON 字符串
        let cleanedJson = chartJson.trim();
        
        // 检查是否被截断
        if (cleanedJson.length > 1000) {
          console.warn('图表数据可能被截断，长度:', cleanedJson.length);
        }
        
        // 检查是否包含截断标记
        if (cleanedJson.includes('... (已截断)')) {
          // 移除截断标记
          cleanedJson = cleanedJson.replace('... (已截断)', '');
          console.warn('移除了截断标记');
        }
        
        try {
          parsed = JSON.parse(cleanedJson);
        } catch (parseError) {
          // 尝试修复常见的 JSON 格式问题
          try {
            // 尝试修复未终止的小数
            const fixedJson = cleanedJson.replace(/(\d+\.)(?!\d)/g, '$10');
            parsed = JSON.parse(fixedJson);
            console.warn('修复了未终止的小数问题');
          } catch (fixedError) {
            // 尝试修复未闭合的数组或对象
            try {
              // 更智能的修复逻辑
              let fixedJson = cleanedJson;
              
              // 1. 修复未闭合的字符串
              const quoteCount = (fixedJson.match(/"/g) || []).length;
              if (quoteCount % 2 !== 0) {
                // 找到最后一个引号的位置
                const lastQuoteIndex = fixedJson.lastIndexOf('"');
                if (lastQuoteIndex !== -1) {
                  // 截取到最后一个引号
                  fixedJson = fixedJson.substring(0, lastQuoteIndex + 1);
                  console.warn('修复了未闭合的字符串');
                }
              }
              
              // 2. 计算括号平衡
              const openBraces = (fixedJson.match(/\{/g) || []).length;
              const closeBraces = (fixedJson.match(/\}/g) || []).length;
              const openBrackets = (fixedJson.match(/\[/g) || []).length;
              const closeBrackets = (fixedJson.match(/\]/g) || []).length;
              
              // 3. 补全缺失的括号
              for (let i = 0; i < openBraces - closeBraces; i++) {
                fixedJson += '}';
              }
              for (let i = 0; i < openBrackets - closeBrackets; i++) {
                fixedJson += ']';
              }
              
              // 4. 尝试再次解析
              parsed = JSON.parse(fixedJson);
              console.warn('修复了未闭合的括号问题');
            } catch (finalError) {
              // 尝试更激进的修复：使用 JSON5 兼容解析
              try {
                // 简单的 JSON5 风格解析
                const json5Like = cleanedJson
                  .replace(/([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:/g, '"$1":') // 添加引号到键
                  .replace(/:\s*([a-zA-Z_$][a-zA-Z0-9_$]*)/g, ': "$1"'); // 添加引号到字符串值
                
                parsed = JSON.parse(json5Like);
                console.warn('使用 JSON5 风格解析成功');
              } catch (json5Error) {
                // 最后尝试：提取已知的有效部分
                try {
                  // 找到第一个完整的对象或数组
                  const firstOpenBrace = cleanedJson.indexOf('{');
                  if (firstOpenBrace !== -1) {
                    // 尝试构建一个最小有效的对象
                    const partialJson = `{"type":"chart_data","chartType":"bar","title":"数据可视化","xCol":"x","yCol":"y","data":[]}`;
                    parsed = JSON.parse(partialJson);
                    console.warn('使用默认图表数据结构');
                  } else {
                    throw new Error('无法提取有效数据');
                  }
                } catch (lastResortError) {
                  throw new Error(`JSON 解析失败: ${parseError.message} (已尝试多种修复方法但失败)`);
                }
              }
            }
          }
        }
      } else if (typeof chartJson === 'object') {
        // 如果已经是对象，直接使用
        parsed = chartJson;
      } else {
        throw new Error('图表数据格式无效');
      }

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
