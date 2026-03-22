'use client';

/**
 * 完整报告查看模态窗口
 * 全屏展示 Agent 回复内容：左侧大纲导航 + 右侧正文/图表 + 顶部工具栏（导出等）
 */

import { useState, useEffect, useMemo, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import SmartChart from './charts/SmartChart';
import {
  CloseIcon, DownloadIcon, CopyIcon, CheckIcon,
  BookOpenIcon, BarChartIcon, FileIcon, ChevronRightIcon
} from './Icons';

// 从 Markdown 文本提取标题大纲
function extractHeadings(text) {
  if (!text) return [];
  const headings = [];
  const lines = text.split('\n');
  lines.forEach((line, idx) => {
    const match = line.match(/^(#{1,3})\s+(.+)/);
    if (match) {
      headings.push({
        level: match[1].length,
        text: match[2].replace(/[*_`]/g, ''),
        id: `heading-${idx}`,
      });
    }
  });
  return headings;
}

export default function FullReportModal({ isOpen, onClose, message }) {
  const [activeHeading, setActiveHeading] = useState(null);
  const [copied, setCopied] = useState(false);
  const contentRef = useRef(null);

  // 解析消息内容
  const reportText = useMemo(() => {
    if (!message) return '';
    return typeof message.content === 'string' ? message.content : String(message.content || '');
  }, [message]);

  const headings = useMemo(() => extractHeadings(reportText), [reportText]);

  // 解析图表数据
  const charts = useMemo(() => {
    if (!message?.charts) return [];
    return message.charts.map(c => {
      try {
        const parsed = typeof c.json === 'string' ? JSON.parse(c.json) : c.json;
        return { id: c.id, data: parsed };
      } catch {
        return null;
      }
    }).filter(Boolean);
  }, [message]);

  // 复制报告文本
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(reportText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('复制失败:', err);
    }
  };

  // 导出为 Markdown 文件
  const handleExportMarkdown = () => {
    let finalMarkdown = reportText;

    if (charts.length > 0) {
      finalMarkdown += '\n\n---\n\n## 附录：数据图表概览\n\n';
      
      charts.forEach((c, idx) => {
        const el = document.getElementById(`chart-${c.id}`);
        if (el) {
          const titleText = c.data?.layout?.title?.text || `图表 ${idx + 1}`;
          
          // 查找是否有 ECharts 提取的 Base64 图片
          const echartsNode = el.querySelector('[data-echarts-base64]');
          if (echartsNode) {
            const base64 = echartsNode.getAttribute('data-echarts-base64');
            if (base64) {
              finalMarkdown += `### ${titleText}\n\n![${titleText}](${base64})\n\n`;
            }
          } else {
            // 退化处理：如果是 Nivo 或 Visx (生成的是 inline SVG)
            const svgNode = el.querySelector('svg');
            if (svgNode) {
              try {
                const svgData = new XMLSerializer().serializeToString(svgNode);
                const svgBase64 = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
                finalMarkdown += `### ${titleText}\n\n![${titleText}](${svgBase64})\n\n`;
              } catch (e) {
                console.error('SVG 转 Base64 失败', e);
              }
            }
          }
        }
      });
    }

    const blob = new Blob([finalMarkdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `SQL-Agent-Report-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // 调用浏览器原生打印生成 PDF
  const handleExportPDF = () => {
    // 短暂延迟确保页面状态稳定
    setTimeout(() => {
      window.print();
    }, 100);
  };

  // 滚动到指定标题
  const scrollToHeading = (id) => {
    setActiveHeading(id);
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  // ESC 关闭
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  if (!isOpen || !message) return null;

  return (
    <div className="fixed inset-0 z-50 flex bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="flex w-full h-full bg-white animate-in slide-in-from-bottom-4 duration-300">
        {/* 左侧大纲导航 */}
        <div className="w-[240px] shrink-0 bg-gray-50/80 border-r border-gray-200 flex flex-col">
          <div className="px-4 pt-5 pb-3 border-b border-gray-100">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
              <BookOpenIcon size={13} />
              报告大纲
            </h3>
          </div>
          <nav className="flex-1 overflow-y-auto px-3 py-3">
            {headings.length > 0 ? (
              headings.map((h) => (
                <button
                  key={h.id}
                  className={`w-full text-left px-3 py-2 rounded-md text-[13px] transition-all mb-0.5 ${
                    activeHeading === h.id
                      ? 'bg-brand-50 text-brand-700 font-medium'
                      : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800'
                  }`}
                  style={{ paddingLeft: `${(h.level - 1) * 12 + 12}px` }}
                  onClick={() => scrollToHeading(h.id)}
                >
                  <ChevronRightIcon size={10} className="inline mr-1 opacity-50" />
                  {h.text}
                </button>
              ))
            ) : (
              <div className="text-xs text-gray-400 px-3 py-4">暂无大纲标题</div>
            )}

            {/* 图表快捷导航 */}
            {charts.length > 0 && (
              <div className="mt-4 pt-3 border-t border-gray-200">
                <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider px-3 mb-2">
                  图表 ({charts.length})
                </div>
                {charts.map((c, i) => (
                  <button
                    key={c.id}
                    className="w-full text-left px-3 py-2 rounded-md text-[13px] text-gray-500 hover:bg-gray-100 hover:text-gray-800 transition-all flex items-center gap-2"
                    onClick={() => {
                      const el = document.getElementById(`chart-${c.id}`);
                      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }}
                  >
                    <BarChartIcon size={12} className="text-brand-500" />
                    图表 {i + 1}
                  </button>
                ))}
              </div>
            )}
          </nav>
        </div>

        {/* 右侧主内容区 */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* 顶部工具栏 */}
          <div className="flex items-center justify-between px-8 py-4 border-b border-gray-100 bg-white sticky top-0 z-10">
            <h2 className="text-lg font-bold text-gray-900">完整报告</h2>
            <div className="flex items-center gap-2">
              <button
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                onClick={handleCopy}
              >
                {copied ? <CheckIcon size={15} className="text-green-600" /> : <CopyIcon size={15} />}
                <span>{copied ? '已复制' : '复制'}</span>
              </button>
              <button
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors print:hidden"
                onClick={handleExportMarkdown}
              >
                <DownloadIcon size={15} />
                <span>导出 Markdown</span>
              </button>
              <button
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-brand-600 bg-brand-50 hover:bg-brand-100 font-medium rounded-lg transition-colors print:hidden"
                onClick={handleExportPDF}
              >
                <span>打印 / 导出 PDF</span>
              </button>
              <button
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                onClick={() => {
                  // 导出图表数据为 CSV（如有）
                  if (charts.length > 0 && charts[0].data?.data) {
                    const rows = charts[0].data.data;
                    if (Array.isArray(rows) && rows.length > 0) {
                      const headers = Object.keys(rows[0]);
                      const csv = [headers.join(','), ...rows.map(r => headers.map(h => JSON.stringify(r[h] ?? '')).join(','))].join('\n');
                      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `data-${Date.now()}.csv`;
                      a.click();
                      URL.revokeObjectURL(url);
                    }
                  }
                }}
              >
                <FileIcon size={15} />
                <span>导出数据</span>
              </button>
              <div className="w-px h-5 bg-gray-200 mx-1" />
              <button
                className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                onClick={onClose}
                title="关闭"
              >
                <CloseIcon size={18} />
              </button>
            </div>
          </div>

          {/* 报告正文 */}
          <div ref={contentRef} className="flex-1 overflow-y-auto px-12 py-8">
            <div className="max-w-3xl mx-auto">
              {/* Markdown 渲染 */}
              {reportText && (
                <div className="prose prose-slate max-w-none prose-p:leading-[1.8] prose-li:my-1 prose-pre:rounded-xl text-[15px] text-gray-800">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      h1: ({ children }) => {
                        const id = `heading-${String(children).replace(/\s+/g, '-')}`;
                        return <h1 id={id} className="scroll-mt-20">{children}</h1>;
                      },
                      h2: ({ children }) => {
                        const id = `heading-${String(children).replace(/\s+/g, '-')}`;
                        return <h2 id={id} className="scroll-mt-20">{children}</h2>;
                      },
                      h3: ({ children }) => {
                        const id = `heading-${String(children).replace(/\s+/g, '-')}`;
                        return <h3 id={id} className="scroll-mt-20">{children}</h3>;
                      },
                    }}
                  >
                    {reportText}
                  </ReactMarkdown>
                </div>
              )}

              {/* 图表展示区 */}
              {charts.length > 0 && (
                <div className="mt-8 flex flex-col gap-8">
                  {charts.map((chart) => (
                    <div key={chart.id} id={`chart-${chart.id}`} className="scroll-mt-20">
                      {chart.data?.type === 'chart_data' && chart.data.data?.length > 0 ? (
                        <SmartChart data={chart.data} height={450} readonly={true} />
                      ) : (
                        <div className="p-6 bg-gray-50 border border-gray-200 rounded-xl text-gray-400 text-center text-sm">
                          图表数据不可用
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      
      {/* 专用打印样式注入 */}
      <style dangerouslySetInnerHTML={{__html: `
        @media print {
          body { visibility: hidden; }
          .print\\:hidden { display: none !important; }
          .fixed.inset-0 { position: absolute; }
          .animate-in { animation: none !important; }
          /* 隐藏左侧导航 */
          .w-\\[240px\\].shrink-0 { display: none !important; }
          /* 右侧全宽 */
          .flex-1.flex.flex-col { width: 100vw; }
          .max-w-3xl { max-w: none; width: 100%; padding: 0 40px; }
          /* 显示需打印的主区域 */
          .prose { visibility: visible; }
          .prose * { visibility: visible; }
          #chart-* { visibility: visible; }
          /* 强制图表背景等白色 */
          canvas { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          /* 移除滚动条 */
          .overflow-y-auto { overflow: visible !important; height: auto !important; }
        }
      `}} />
    </div>
  );
}
