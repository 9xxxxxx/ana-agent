'use client';

/**
 * 聊天消息列表组件 — ChatGPT 风格（纯 Tailwind 实现）
 */

import { useRef, useEffect, useState, memo, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import ToolStep from './ToolStep';
import SmartChart from './charts/SmartChart';
import ReportGenerator from './report/ReportGenerator';
import { getFileUrl } from '@/lib/api';
import {
  CopyIcon, CheckIcon, FileIcon, DownloadIcon, BarChartIcon, SparklesIcon, DatabaseIcon
} from './Icons';

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
      className={`p-1.5 rounded-md flex items-center justify-center transition-colors ${copied ? 'text-green-600 bg-green-50' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100'}`}
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
              <img src={file} alt="attachment" className="h-16 w-16 object-cover rounded-lg border border-gray-200" />
            ) : (
              <a href={file} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm hover:bg-gray-50 transition-colors">
                <FileIcon size={16} className="text-gray-500" />
                <span className="max-w-[120px] truncate text-gray-700">{file.split('/').pop()}</span>
              </a>
            )}
          </div>
        );
      })}
    </div>
  );
}

// 单个消息组件
const MessageItem = memo(({ msg, isStreaming, isLast }) => {
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

  if (msg.role === 'user') {
    return (
      <div className="flex w-full justify-end mb-8 relative group/user">
        <div className="max-w-[80%] flex flex-col items-end relative">
          <AttachmentPreview files={contentObj.attachments} />
          {contentObj.text && (
            <div className="flex items-end gap-2">
              <div className="opacity-0 group-hover/user:opacity-100 transition-opacity duration-200 mb-1">
                <CopyButton text={contentObj.text} />
              </div>
              <div className="relative border border-gray-200 shadow-sm bg-gray-50 text-gray-800 px-5 py-3.5 rounded-2xl rounded-tr-sm whitespace-pre-wrap break-words text-[15px] leading-relaxed font-normal">
                {contentObj.text}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // AI 消息
  return (
    <div className="flex w-full justify-start mb-12 gap-5 group/ai">
      <div className="shrink-0 w-9 h-9 rounded-full border border-gray-100 flex items-center justify-center bg-gradient-to-br from-brand-50 to-brand-100 shadow-sm mt-1">
        <SparklesIcon size={18} className="text-brand-600" />
      </div>
      
      <div className="flex-1 min-w-0 pt-1">
        {/* 工具步骤区 */}
        {msg.toolSteps?.length > 0 && (
          <div className="flex flex-col gap-3 mb-5">
            {msg.toolSteps.map((step) => (
              <ToolStep key={step.id} step={step} />
            ))}
          </div>
        )}

        {/* 文本内容区 */}
        {contentObj.text && (
          <div className="prose prose-slate max-w-none prose-p:leading-[1.8] prose-p:mb-5 prose-li:my-1.5 prose-pre:my-6 prose-pre:rounded-xl text-[15.5px] text-gray-800 tracking-[0.015em]">
            {markdownContent}
            {isStreaming && isLast && <span className="inline-block w-2.5 h-4 ml-1.5 bg-gray-400 rounded-sm animate-pulse align-middle" />}
          </div>
        )}

        {/* 流式思考指示器 */}
        {isStreaming && isLast && !contentObj.text && (!msg.toolSteps || msg.toolSteps.length === 0) && (
          <div className="flex items-center gap-2 text-gray-500 text-sm py-2">
            <SparklesIcon size={16} className="animate-spin text-gray-400" />
            <span className="animate-pulse">AI 正在思考...</span>
          </div>
        )}

        {/* 图表展示区 */}
        {msg.charts?.length > 0 && (
          <div className="mt-6 flex flex-col gap-6">
            {msg.charts.map((chart) => (
              <ChartWrapper key={chart.id} chartJson={chart.json} />
            ))}
          </div>
        )}

        {/* 文件下载卡片区 */}
        {msg.files?.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-3">
            {msg.files.map((file, i) => (
              <a
                key={i}
                className="flex items-center gap-3 p-3 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 hover:border-gray-300 transition-all shadow-sm max-w-[300px] w-full group/file"
                href={getFileUrl(file.filename)}
                download={file.filename}
                target="_blank"
                rel="noreferrer"
              >
                <div className="p-2 bg-brand-50 rounded-lg text-brand-600">
                  <FileIcon size={20} />
                </div>
                <div className="flex-1 min-w-0 overflow-hidden">
                  <div className="font-medium text-sm text-gray-900 truncate">{file.filename}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{file.message || '点击下载导出文件'}</div>
                </div>
                <DownloadIcon className="text-gray-400 group-hover/file:text-brand-600" size={16} />
              </a>
            ))}
          </div>
        )}

        {/* 底部操作区 */}
        {(!isStreaming || !isLast) && (contentObj.text || msg.charts?.length > 0) && (
          <div className="flex items-center gap-2 mt-3 opacity-0 group-hover:opacity-100 transition-opacity">
            {contentObj.text && <CopyButton text={contentObj.text} />}
            {(msg.charts?.length > 0 || contentObj.text?.includes('|')) && (
              <ReportGenerator message={msg} />
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
      let parsed;
      if (typeof chartJson === 'string') {
        let cleanedJson = chartJson.trim();
        if (cleanedJson.startsWith('[CHART_DATA]')) {
          cleanedJson = cleanedJson.replace('[CHART_DATA]', '').trim();
        }
        if (cleanedJson.includes('... (已截断)')) {
          cleanedJson = cleanedJson.replace('... (已截断)', '');
        }
        try {
          parsed = JSON.parse(cleanedJson);
        } catch (parseError) {
          try {
            let fixedJson = cleanedJson;
            const openBraces = (fixedJson.match(/\{/g) || []).length;
            const closeBraces = (fixedJson.match(/\}/g) || []).length;
            const openBrackets = (fixedJson.match(/\[/g) || []).length;
            const closeBrackets = (fixedJson.match(/\]/g) || []).length;

            for (let i = 0; i < openBraces - closeBraces; i++) fixedJson += '}';
            for (let i = 0; i < openBrackets - closeBrackets; i++) fixedJson += ']';

            parsed = JSON.parse(fixedJson);
          } catch {
            throw new Error(`JSON 解析失败: ${parseError.message}`);
          }
        }
      } else if (typeof chartJson === 'object') {
        parsed = chartJson;
      } else {
        throw new Error('图表数据格式无效');
      }

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

export default function ChatMessages({ messages, isStreaming }) {
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
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="flex flex-col items-center max-w-2xl w-full">
          <div className="w-16 h-16 bg-white border border-gray-200 rounded-2xl flex items-center justify-center shadow-sm mb-6">
            <SparklesIcon size={32} className="text-gray-800" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-3">SQL Agent</h1>
          <p className="text-gray-500 text-center mb-10 text-sm leading-relaxed max-w-md">
            你的智能数据分析助手。通过自然语言对话，轻松完成数据库查询、可视化图表和业务报告撰写。
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
            {[
              { icon: <DatabaseIcon size={20} />, title: "查询数据库", desc: "连接并分析任意数据源", prompt: "查看所有数据库表结构" },
              { icon: <BarChartIcon size={20} />, title: "生成图表", desc: "10多种图表支持", prompt: "对比各部门的业绩并画柱状图" },
              { icon: <SparklesIcon size={20} />, title: "复杂分析", desc: "多维交叉探索", prompt: "帮我分析最近一个月的销售趋势" },
              { icon: <FileIcon size={20} />, title: "导出报告", desc: "Markdown长图与CSV", prompt: "生成上一季度的综合业绩报告" },
            ].map((item, idx) => (
              <div key={idx} className="p-4 rounded-xl border border-gray-200 bg-white shadow-sm hover:border-gray-300 hover:shadow transition-all group cursor-pointer text-left">
                <div className="flex items-center gap-3 mb-2 text-gray-800 font-medium">
                  {item.icon}
                  <span>{item.title}</span>
                </div>
                <div className="text-xs text-gray-500 mb-3">{item.desc}</div>
                <div className="text-[0.8rem] text-gray-600 bg-gray-50 p-2 rounded-lg border border-gray-100 group-hover:bg-gray-100 transition-colors">
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
          />
        ))}
        <div ref={bottomRef} className="h-4" />
      </div>
    </div>
  );
}
