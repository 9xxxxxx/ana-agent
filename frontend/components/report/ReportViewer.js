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
    <div className={`report-viewer ${isFullscreen ? 'fullscreen' : ''}`}>
      {/* 报告头部 */}
      <header className="report-header">
        <div className="report-header-content">
          <div className="report-meta">
            <span className="report-badge">{report.type || '业务报告'}</span>
            <span className="report-date">{report.createdAt}</span>
          </div>
          <h1 className="report-title">{report.title}</h1>
          {report.subtitle && <p className="report-subtitle">{report.subtitle}</p>}
          
          {/* 指标概览 */}
          {report.metrics && (
            <div className="report-metrics">
              {report.metrics.map((metric, i) => (
                <MetricCard key={i} {...metric} />
              ))}
            </div>
          )}
        </div>
        
        <div className="report-actions">
          <button className="btn-icon" onClick={() => setIsFullscreen(!isFullscreen)} title={isFullscreen ? '退出全屏' : '全屏查看'}>
            {isFullscreen ? '⛶' : '⛶'}
          </button>
          <button className="btn-secondary" onClick={() => onExport?.('pdf')}>导出 PDF</button>
          <button className="btn-secondary" onClick={() => onExport?.('markdown')}>导出 Markdown</button>
          {onClose && <button className="btn-icon" onClick={onClose}>✕</button>}
        </div>
      </header>

      <div className="report-body">
        {/* 章节导航 */}
        <SectionNavigator
          sections={report.sections}
          activeIndex={activeSection}
          onSelect={scrollToSection}
        />

        {/* 报告内容 */}
        <div className="report-content" ref={contentRef}>
          {report.summary && (
            <div className="report-summary">
              <h2>执行摘要</h2>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{report.summary}</ReactMarkdown>
            </div>
          )}

          {report.sections?.map((section, index) => (
            <section
              key={index}
              className="report-section"
              data-section-index={index}
            >
              <h2 className="section-title">
                <span className="section-number">{index + 1}</span>
                {section.title}
              </h2>
              
              {section.content && (
                <div className="section-content">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {section.content}
                  </ReactMarkdown>
                </div>
              )}

              {/* 章节内的图表 */}
              {section.charts?.map((chart, chartIndex) => (
                <div key={chartIndex} className="section-chart">
                  <h4>{chart.title}</h4>
                  <ChartRenderer chartJson={chart.data} />
                </div>
              ))}

              {/* 章节内的数据表格 */}
              {section.table && (
                <DataTable
                  data={section.table.data}
                  columns={section.table.columns}
                  title={section.table.title}
                />
              )}

              {/* 章节内的指标 */}
              {section.metrics && (
                <div className="section-metrics">
                  {section.metrics.map((metric, i) => (
                    <MetricCard key={i} {...metric} size="small" />
                  ))}
                </div>
              )}
            </section>
          ))}

          {/* 结论与建议 */}
          {report.conclusion && (
            <div className="report-conclusion">
              <h2>结论与建议</h2>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {report.conclusion}
              </ReactMarkdown>
            </div>
          )}
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
