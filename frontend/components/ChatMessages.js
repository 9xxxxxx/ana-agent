'use client';

/**
 * 聊天消息列表组件
 */

import { useRef, useEffect, useState, memo, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import ToolStep from './ToolStep';
import SmartChart from './charts/SmartChart';
import ReportGenerator from './report/ReportGenerator';
import { getFileUrl } from '@/lib/api';
import {
  UserIcon, BotIcon, CopyIcon, CheckIcon,
  FileIcon, DownloadIcon, BarChartIcon,
  DatabaseIcon, LineChartIcon, PieChartIcon,
  BellIcon, SparklesIcon, LayersIcon, ZapIcon,
} from './Icons';

// 复制按钮组件 — 带反馈动画
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
      className={`message-action-btn ${copied ? 'copied' : ''}`}
      onClick={handleCopy}
      title={copied ? '已复制' : '复制'}
    >
      {copied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
    </button>
  );
}

// 单个消息组件 - 使用 memo 优化渲染
const MessageItem = memo(({ msg, isStreaming, isLast }) => {
  // 使用 useMemo 缓存 Markdown 内容
  const markdownContent = useMemo(() => {
    const content = typeof msg.content === 'string' ? msg.content : String(msg.content || '');
    return <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>;
  }, [msg.content]);

  // 确保 toolSteps 变化时重新渲染
  const toolStepsKey = useMemo(() => {
    return msg.toolSteps?.map(step =>
      `${step.id}-${step.status}-${step.output?.length || 0}`
    ).join('-') || '';
  }, [msg.toolSteps]);

  return (
    <div key={msg.id} className={`message message-${msg.role}`} data-tool-steps-key={toolStepsKey}>
      {msg.role === 'user' ? (
        <>
          <div className="message-avatar user-avatar">
            <UserIcon size={18} />
          </div>
          <div className="message-content">
            <div className="message-bubble">
              <div className="message-content-wrapper">
                {msg.content}
              </div>
            </div>
            <div className="message-actions">
              <CopyButton text={msg.content} />
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="message-avatar bot-avatar">
            <BotIcon size={18} />
          </div>
          <div className="message-content">
            {/* 工具步骤 */}
            {msg.toolSteps?.map((step) => (
              <ToolStep key={step.id} step={step} />
            ))}

            {/* 图表 */}
            {msg.charts?.map((chart) => (
              <ChartWrapper key={chart.id} chartJson={chart.json} />
            ))}

            {/* 文件下载 */}
            {msg.files?.map((file, i) => (
              <a
                key={i}
                className="file-card"
                href={getFileUrl(file.filename)}
                target="_blank"
                rel="noopener noreferrer"
                download
              >
                <FileIcon size={20} className="file-card-icon" />
                <div className="file-card-info">
                  <span className="file-card-name">{file.filename}</span>
                  <span className="file-card-hint">点击下载</span>
                </div>
                <DownloadIcon size={16} className="file-card-download" />
              </a>
            ))}

            {/* 有工具调用时，只显示工具步骤和最终总结 */}
            {msg.toolSteps?.length > 0 ? (
              msg.content && (
                <>
                  <div className="message-bubble">
                    <div className="message-content-wrapper">
                      {markdownContent}
                    </div>
                  </div>
                  <div className="message-actions">
                    <CopyButton text={msg.content} />
                  </div>
                </>
              )
            ) : (
              msg.content && (
                <>
                  <div className="message-bubble">
                    <div className="message-content-wrapper">
                      {markdownContent}
                      {isStreaming && isLast && (
                        <span className="streaming-cursor" />
                      )}
                    </div>
                  </div>
                  <div className="message-actions">
                    <CopyButton text={msg.content} />
                  </div>
                </>
              )
            )}

            {/* 报告生成按钮 */}
            {!isStreaming && msg.charts?.length > 0 && (
              <div className="message-actions">
                <ReportGenerator message={msg} />
              </div>
            )}

            {/* 思考指示器 */}
            {!msg.content && isStreaming && isLast && (
              <div className="thinking-indicator">
                <div className="thinking-dots">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
                <span>思考中...</span>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
});

MessageItem.displayName = 'MessageItem';

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
    return <WelcomeScreen />;
  }

  return (
    <div className="messages-container">
      <div className="messages-inner" ref={containerRef}>
        {messages.map((msg, index) => (
          <MessageItem
            key={msg.id}
            msg={msg}
            isStreaming={isStreaming}
            isLast={index === messages.length - 1}
          />
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

/**
 * 图表包装器
 */
function ChartWrapper({ chartJson }) {
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

        // 移除标记前缀
        if (cleanedJson.startsWith('[CHART_DATA]')) {
          cleanedJson = cleanedJson.replace('[CHART_DATA]', '').trim();
        }

        // 移除截断标记
        if (cleanedJson.includes('... (已截断)')) {
          cleanedJson = cleanedJson.replace('... (已截断)', '');
        }

        try {
          parsed = JSON.parse(cleanedJson);
        } catch (parseError) {
          // 尝试修复未闭合的括号
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
      <div className="chart-error">
        <BarChartIcon size={24} />
        <span>图表解析失败: {error}</span>
      </div>
    );
  }

  if (!chartData) {
    return (
      <div className="chart-loading">
        <div className="loading-spinner"></div>
      </div>
    );
  }

  // 新格式
  if (chartData.type === 'chart_data' && chartData.data && chartData.data.length > 0) {
    return <SmartChart data={chartData} height={400} />;
  } else if (chartData.type === 'chart_data') {
    return (
      <div className="smart-chart-empty">
        <BarChartIcon size={32} className="empty-icon" />
        <span className="empty-text">图表数据为空</span>
      </div>
    );
  }

  // Plotly 旧格式兼容
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

  // 纯数据数组
  if (Array.isArray(chartData)) {
    return <SmartChart data={chartData} height={400} />;
  }

  return (
    <div className="chart-error">
      <BarChartIcon size={24} />
      <span>无法识别的图表数据格式</span>
    </div>
  );
}

/* 欢迎屏幕 */
function WelcomeScreen() {
  const features = [
    { icon: <DatabaseIcon size={28} />, title: '多数据库支持', desc: 'PostgreSQL / MySQL / SQLite / DuckDB' },
    { icon: <BarChartIcon size={28} />, title: '13+ 种图表', desc: '柱状图、折线图、饼图、雷达图...' },
    { icon: <FileIcon size={28} />, title: '报告导出', desc: 'Markdown / CSV / Excel' },
    { icon: <BellIcon size={28} />, title: '消息推送', desc: '飞书卡片 / 邮件通知' },
  ];

  const quickTips = [
    { icon: <ZapIcon size={16} />, text: '"帮我分析最近一个月的销售趋势"' },
    { icon: <ZapIcon size={16} />, text: '"查看所有数据库表结构"' },
    { icon: <ZapIcon size={16} />, text: '"对比各部门的业绩并画柱状图"' },
  ];

  return (
    <div className="messages-container">
      <div className="welcome-screen">
        <div className="welcome-hero">
          <div className="welcome-icon-wrapper">
            <SparklesIcon size={36} />
          </div>
          <h1 className="welcome-title">SQL Agent</h1>
          <p className="welcome-subtitle">
            你的智能数据分析助手。通过自然语言对话，轻松完成数据库查询、可视化图表和业务报告撰写。
          </p>
        </div>

        <div className="welcome-features">
          {features.map((f, i) => (
            <div key={i} className="feature-card">
              <div className="feature-icon">{f.icon}</div>
              <div className="feature-title">{f.title}</div>
              <div className="feature-desc">{f.desc}</div>
            </div>
          ))}
        </div>

        <div className="welcome-tips">
          <div className="tips-title">
            <LayersIcon size={16} />
            <span>试试这样提问</span>
          </div>
          <div className="tips-list">
            {quickTips.map((tip, i) => (
              <div key={i} className="tip-item">
                {tip.icon}
                <span>{tip.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
