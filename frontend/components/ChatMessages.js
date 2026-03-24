'use client';

/**
 * 聊天消息列表组件 — ChatGPT 风格（纯 Tailwind 实现）
 */

import { useRef, useEffect, useState, memo, useMemo } from 'react';
import Image from 'next/image';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import ToolStep from './ToolStep';
import SmartChart from './charts/SmartChart';
import ReportGenerator from './report/ReportGenerator';
import { getFileUrl } from '@/lib/api';
import { parseChartPayload } from '@/lib/chartData';
import {
  CopyIcon, CheckIcon, FileIcon, DownloadIcon, BarChartIcon, SparklesIcon, DatabaseIcon, BookOpenIcon, EditIcon, ChevronRightIcon
} from './Icons';
import { cn, ui } from './ui';
import { EmptyState, StatusBadge } from './status';

// 复制按钮组件
function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('复制失败:', err);
    }
  };

  return (
    <button
      className={cn('flex items-center justify-center rounded-md p-1.5 transition-colors', copied ? 'bg-green-50 text-green-600' : 'text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700')}
      onClick={handleCopy}
      title={copied ? '已复制' : '复制代码/文本'}
    >
      {copied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
    </button>
  );
}

// 渲染附件
function AttachmentPreview({ files }) {
  if (!files || files.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 mb-2">
      {files.map((file, i) => {
        const isImage = file.match(/\.(jpeg|jpg|png|gif|webp)$/i);
        return (
          <div key={i} className="relative">
            {isImage ? (
              <Image
                src={file}
                alt="attachment"
                width={64}
                height={64}
                unoptimized
                className="h-16 w-16 rounded-lg border border-zinc-200 object-cover"
              />
            ) : (
              <a href={file} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm transition-colors hover:bg-zinc-50">
                <FileIcon size={16} className="text-zinc-500" />
                <span className="max-w-[120px] truncate text-zinc-700">{file.split('/').pop()}</span>
              </a>
            )}
          </div>
        );
      })}
    </div>
  );
}

// 单个消息组件
const MessageItem = memo(({ msg, isStreaming, isLast, onViewReport, onEditSend }) => {
  const contentObj = useMemo(() => {
    let text = typeof msg.content === 'string' ? msg.content : String(msg.content || '');
    const attachments = [];

    if (msg.role === 'user') {
      const attachRegex = /\[附件:\s*(.+?)\]\((.+?)\)/g;
      let match;
      while ((match = attachRegex.exec(text)) !== null) {
        attachments.push(match[2]);
      }
      text = text.replace(attachRegex, '').trim();
    }
    return { text, attachments };
  }, [msg.content, msg.role]);

  const markdownContent = useMemo(() => {
    return <ReactMarkdown remarkPlugins={[remarkGfm]}>{contentObj.text}</ReactMarkdown>;
  }, [contentObj.text]);

  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState('');

  if (msg.role === 'user') {
    return (
      <div className="flex w-full justify-end mb-8 relative group/user">
        <div className="max-w-[80%] flex flex-col items-end relative">
          <AttachmentPreview files={contentObj.attachments} />
          {contentObj.text && (
            <div className="flex items-center gap-2 mt-1">
              {/* 原生编辑和复制入口悬浮 */}
              <div className="flex items-center gap-1 opacity-0 group-hover/user:opacity-100 transition-opacity duration-200">
                <button
                  className={cn(ui.iconButton, 'rounded-md p-1.5 text-zinc-400')}
                  title="编辑并重新发送"
                  onClick={() => {
                    setEditText(contentObj.text);
                    setIsEditing(true);
                  }}
                >
                  <EditIcon size={14} />
                </button>
                <CopyButton text={contentObj.text} />
              </div>
              
              {isEditing ? (
                <div className="w-[400px] rounded-2xl border border-zinc-200 bg-white px-4 py-3 shadow-sm">
                  <textarea 
                    className="w-full resize-none bg-transparent text-[15px] text-zinc-800 outline-none"
                    rows={3}
                    value={editText}
                    onChange={e => setEditText(e.target.value)}
                    autoFocus
                  />
                  <div className="flex justify-end gap-2 mt-2">
                    <button className={cn(ui.buttonSecondary, 'rounded-md px-3 py-1.5 text-xs')} onClick={() => setIsEditing(false)}>取消</button>
                    <button 
                      className={cn(ui.buttonPrimary, 'rounded-md px-3 py-1.5 text-xs shadow-sm')}
                      onClick={() => {
                         if (!editText.trim()) return;
                         setIsEditing(false);
                         if (onEditSend) onEditSend(msg.id, editText);
                      }}
                    >
                      保存并重发
                    </button>
                  </div>
                </div>
              ) : (
                <div className="relative whitespace-pre-wrap break-words rounded-3xl rounded-tr-sm border border-zinc-200 bg-zinc-100 px-5 py-3 text-[15px] font-normal leading-relaxed text-foreground shadow-sm">
                  {contentObj.text}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // AI 消息 - 极简复合排版纸幅
  return (
    <div className="flex w-full justify-start mb-12 gap-4 group/ai font-sans">
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-zinc-200 bg-white shadow-sm">
        <SparklesIcon size={16} className="text-emerald-600" />
      </div>
      
      <div className="flex-1 min-w-0 pt-1 relative max-w-[90%]">
        
        {/* 工具步骤区 - 稍微弱化作为思考前置 */}
        {msg.toolSteps?.length > 0 && (
          <div className="flex flex-col gap-2 mb-4 bg-muted/30 p-3 rounded-2xl border border-border">
            <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground"><SparklesIcon size={12}/> Analysis Process</div>
            {msg.toolSteps.map((step) => (
              <ToolStep key={step.id} step={step} />
            ))}
          </div>
        )}

        {/* 核心内容区 (文本与图表紧凑交织) */}
        <div className="text-[15.5px] text-foreground leading-[1.8] space-y-5">
          {/* 推理/思考链卡片 (仅当有 reasoning 数据时显示) */}
          {msg.reasoning && (
             <details className="group/reasoning mb-4 border border-border rounded-xl bg-muted/30 overflow-hidden" open={isStreaming && isLast && !contentObj.text}>
               <summary className="flex items-center gap-2 px-3 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted bg-muted/50 outline-none list-none select-none cursor-pointer transition-colors">
                 <ChevronRightIcon size={14} className="transition-transform group-open/reasoning:rotate-90" />
                 <SparklesIcon size={12} className="text-muted-foreground" />
                 思考过程
               </summary>
               <div className="px-4 py-3 pt-2 text-[13.5px] text-muted-foreground leading-[1.7] font-serif whitespace-pre-wrap break-words bg-bot-msg/50 border-t border-border italic">
                 {msg.reasoning}
                 {isStreaming && isLast && !contentObj.text && <span className="inline-block w-2.5 h-3 ml-1 bg-muted-foreground animate-pulse align-middle" />}
               </div>
             </details>
          )}

          {contentObj.text && (
            <div className="prose prose-slate max-w-none prose-p:my-2 prose-li:my-1 prose-pre:my-4 prose-pre:rounded-xl prose-pre:bg-muted prose-pre:text-foreground prose-pre:border prose-pre:border-border">
              {markdownContent}
              {isStreaming && isLast && <span className="inline-block w-2.5 h-4 ml-1.5 bg-foreground rounded-sm animate-pulse align-middle" />}
            </div>
          )}

          {/* 图表展示区挂载于文字流下方 */}
           {msg.charts?.length > 0 && (
            <div className="flex flex-col gap-6 mt-2">
              {msg.charts.map((chart) => (
                <div key={chart.id} className="bg-bot-msg border border-border rounded-2xl shadow-sm p-4 hover:shadow-md transition-shadow">
              <ChartWrapper chartJson={chart.json} />
                </div>
              ))}
            </div>
          )}

          {/* Python 代码执行结果渲染区 */}
          {msg.codeOutputs?.length > 0 && (
            <div className="flex flex-col gap-4 mt-4">
              {msg.codeOutputs.map((output, idx) => (
            <div key={output.id || idx} className="bg-muted/30 border border-border rounded-2xl overflow-hidden shadow-sm">
                  {/* stdout 文本输出 */}
                  {output.stdout && (
                    <div className="p-4">
                      <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                        Python 输出
                      </div>
                      <pre className="text-[13px] text-foreground font-mono bg-bot-msg/50 border border-border rounded-xl p-3 overflow-x-auto whitespace-pre-wrap leading-relaxed">{output.stdout}</pre>
                    </div>
                  )}
                  {/* matplotlib 图片渲染 */}
                  {output.images?.length > 0 && (
                    <div className="flex flex-col gap-3 p-4 pt-0">
                      {output.images.map((img, imgIdx) => (
                        <div key={imgIdx} className="bg-bot-msg/50 border border-border rounded-xl overflow-hidden shadow-sm">
                          <Image
                            src={`data:image/png;base64,${img}`}
                            alt={`Python 图表 ${imgIdx + 1}`}
                            width={1200}
                            height={720}
                            unoptimized
                            className="w-full max-w-2xl mx-auto block"
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 流式思考指示器 */}
        {isStreaming && isLast && !contentObj.text && (!msg.toolSteps || msg.toolSteps.length === 0) && (
          <div className="flex items-center gap-2 py-2 text-sm text-zinc-500">
            <SparklesIcon size={16} className="animate-spin text-emerald-500" />
            <span className="animate-pulse">AI 推理中...</span>
          </div>
        )}

        {/* 文件导出区 */}
        {msg.files?.length > 0 && (
          <div className="mt-6 flex flex-wrap gap-3">
            {msg.files.map((file, i) => (
              <a
                key={i}
                className="flex items-center gap-3 p-3 bg-bot-msg border border-border rounded-xl hover:bg-muted/50 hover:border-border transition-all shadow-sm max-w-[300px] w-full group/file"
                href={getFileUrl(file.filename)}
                download={file.filename}
                target="_blank"
                rel="noreferrer"
              >
                <div className="p-2 bg-muted/50 rounded-lg text-muted-foreground">
                  <FileIcon size={20} />
                </div>
                <div className="flex-1 min-w-0 overflow-hidden">
                  <div className="font-medium text-sm text-foreground truncate">{file.filename}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{file.message || '点击下载文档'}</div>
                </div>
                <DownloadIcon className="text-muted-foreground group-hover/file:text-foreground" size={16} />
              </a>
            ))}
          </div>
        )}

        {/* 底部融合操作栏：极简灰底单行动条 */}
        {(!isStreaming || !isLast) && (contentObj.text || msg.charts?.length > 0) && (
          <div className="flex items-center gap-3 mt-6 pt-1 opacity-0 group-hover/ai:opacity-100 transition-opacity">
            {contentObj.text && <CopyButton text={contentObj.text} />}
            
            {(msg.charts?.length > 0 || contentObj.text?.includes('|')) && (
              <ReportGenerator message={msg} />
            )}
            
            {(contentObj.text || msg.charts?.length > 0) && onViewReport && (
              <button
                className="flex items-center gap-1.5 rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-1.5 text-[13px] font-medium text-emerald-700 shadow-sm transition-colors hover:bg-emerald-100"
                onClick={() => onViewReport(msg)}
              >
                <BookOpenIcon size={14} />
                进入全视野报告模式
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
});

MessageItem.displayName = 'MessageItem';

/**
 * 图表包装器组件
 */
const ChartWrapper = memo(({ chartJson }) => {
  const [chartData, setChartData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!chartJson) {
      setError('图表数据为空');
      return;
    }

    try {
      const parsed = parseChartPayload(chartJson);

      if (!parsed) throw new Error('图表数据为空');
      setChartData(parsed);
      setError(null);
    } catch (e) {
      setError(e.message);
      setChartData(null);
    }
  }, [chartJson]);

  if (error) {
    return (
      <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">
        <BarChartIcon size={20} className="shrink-0" />
        <span>图表解析失败: {error}</span>
      </div>
    );
  }

  if (!chartData) {
    return (
      <div className="flex items-center justify-center h-[200px] border border-gray-200 rounded-xl bg-gray-50">
        <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  const renderSmartChart = () => {
    if (chartData.type === 'chart_data' && chartData.data && chartData.data.length > 0) {
      return <SmartChart data={chartData} height={400} />;
    } else if (chartData.type === 'chart_data') {
      return (
        <div className="flex flex-col items-center justify-center p-8 bg-gray-50 border border-gray-200 rounded-xl text-gray-400">
          <BarChartIcon size={32} className="mb-2 opacity-50" />
          <span className="text-sm">图表数据为空</span>
        </div>
      );
    }

    if (chartData.data && chartData.layout) {
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
          height={400}
        />
      );
    }

    if (Array.isArray(chartData)) {
      return <SmartChart data={chartData} height={400} />;
    }

    return (
      <div className="flex items-center gap-2 p-4 bg-yellow-50 border border-yellow-200 rounded-xl text-yellow-700 text-sm">
        <BarChartIcon size={20} className="shrink-0" />
        <span>无法识别的图表数据格式</span>
      </div>
    );
  };

  return renderSmartChart();
});

ChartWrapper.displayName = 'ChartWrapper';

export default function ChatMessages({ messages, isStreaming, onViewReport, onEditSend }) {
  const bottomRef = useRef(null);
  const containerRef = useRef(null);
  const [isUserAtBottom, setIsUserAtBottom] = useState(true);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 100;
      setIsUserAtBottom(isAtBottom);
    };

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    if (!bottomRef.current || !isUserAtBottom || isStreaming) return;
    const scrollToBottom = () => {
      bottomRef.current?.scrollIntoView({ behavior: 'auto' });
    };
    requestAnimationFrame(scrollToBottom);
  }, [messages, isStreaming, isUserAtBottom]);

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="flex w-full max-w-2xl flex-col items-center">
          <EmptyState
            icon={<SparklesIcon size={32} className="text-emerald-600" />}
            title="SQL Agent"
            description="你的智能数据分析助手。通过自然语言对话，轻松完成数据库查询、可视化图表和业务报告撰写。"
          />

          <div className="mb-4 -mt-3">
            <StatusBadge tone="info">你可以直接从下面的提示开始</StatusBadge>
          </div>

          <div className="grid w-full grid-cols-1 gap-4 md:grid-cols-2">
            {[
              { icon: <DatabaseIcon size={20} />, title: "查询数据库", desc: "连接并分析任意数据源", prompt: "查看所有数据库表结构" },
              { icon: <BarChartIcon size={20} />, title: "生成图表", desc: "10多种图表支持", prompt: "对比各部门的业绩并画柱状图" },
              { icon: <SparklesIcon size={20} />, title: "复杂分析", desc: "多维交叉探索", prompt: "帮我分析最近一个月的销售趋势" },
              { icon: <FileIcon size={20} />, title: "导出报告", desc: "Markdown长图与CSV", prompt: "生成上一季度的综合业绩报告" },
            ].map((item, idx) => (
              <div key={idx} className="group cursor-pointer rounded-2xl border border-zinc-200 bg-white p-4 text-left shadow-sm transition-all hover:border-zinc-300 hover:shadow-md">
                <div className="flex items-center gap-3 mb-2 text-foreground font-medium">
                  {item.icon}
                  <span>{item.title}</span>
                </div>
                <div className="text-xs text-muted-foreground mb-3">{item.desc}</div>
                <div className="text-[0.8rem] text-muted-foreground bg-muted/50 p-2 rounded-lg border border-border group-hover:bg-muted transition-colors">
                  &quot;{item.prompt}&quot;
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full overflow-y-auto overflow-x-hidden" ref={containerRef}>
      <div className="w-full max-w-3xl mx-auto px-6 py-8">
        {messages.map((msg, index) => (
          <MessageItem
            key={msg.id}
            msg={msg}
            isStreaming={isStreaming}
            isLast={index === messages.length - 1}
            onViewReport={onViewReport}
            onEditSend={onEditSend}
          />
        ))}
        <div ref={bottomRef} className="h-4" />
      </div>
    </div>
  );
}
