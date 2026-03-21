'use client';

/**
 * 聊天消息列表组件 — ChatGPT 风格（AI无气泡，全宽沉浸式）
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
    <div className="message-attachments">
      {files.map((file, i) => {
        const isImage = file.match(/\.(jpeg|jpg|png|gif|webp)$/i);
        return (
          <div key={i} className="message-attachment">
            {isImage ? (
              <img src={file} alt="attachment" className="attachment-image" />
            ) : (
              <a href={file} target="_blank" rel="noopener noreferrer" className="attachment-file">
                <FileIcon size={16} />
                <span>{file.split('/').pop()}</span>
              </a>
            )}
          </div>
        );
      })}
    </div>
  );
}

// 单个消息组件 - 使用 memo 优化渲染
const MessageItem = memo(({ msg, isStreaming, isLast }) => {
  // 解析用户消息中的附件（格式为：[附件: xxx](url)）
  const contentObj = useMemo(() => {
    let text = typeof msg.content === 'string' ? msg.content : String(msg.content || '');
    const attachments = [];

    if (msg.role === 'user') {
      const attachRegex = /\[附件:\s*(.+?)\]\((.+?)\)/g;
      let match;
      while ((match = attachRegex.exec(text)) !== null) {
        attachments.push(match[2]); // 保存 url
      }
      text = text.replace(attachRegex, '').trim();
    }

    return { text, attachments };
  }, [msg.content, msg.role]);

  const markdownContent = useMemo(() => {
    return <ReactMarkdown remarkPlugins={[remarkGfm]}>{contentObj.text}</ReactMarkdown>;
  }, [contentObj.text]);

  const toolStepsKey = useMemo(() => {
    return msg.toolSteps?.map(step =>
      `${step.id}-${step.status}-${step.output?.length || 0}`
    ).join('-') || '';
  }, [msg.toolSteps]);

  // ChatGPT 风格：AI 消息占据更大宽度，没有明显的气泡边界；用户消息靠右对齐
  if (msg.role === 'user') {
    return (
      <div key={msg.id} className="message-row user-row">
        <div className="message-content-wrapper">
          <AttachmentPreview files={contentObj.attachments} />
          {contentObj.text && (
            <div className="message-bubble user-bubble">
              {contentObj.text}
            </div>
          )}
        </div>
      </div>
    );
  }

  // AI 消息
  return (
    <div key={msg.id} className="message-row ai-row" data-tool-steps-key={toolStepsKey}>
      <div className="message-avatar ai-avatar">
        <SparklesIcon size={18} />
      </div>
      <div className="message-content">
        {/* 工具步骤区 */}
        {msg.toolSteps?.length > 0 && (
          <div className="message-tools-container">
            {msg.toolSteps.map((step) => (
              <ToolStep key={step.id} step={step} />
            ))}
          </div>
        )}

        {/* 文本内容区 */}
        {contentObj.text && (
          <div className="ai-markdown-content">
            {markdownContent}
            {isStreaming && isLast && <span className="streaming-cursor" />}
          </div>
        )}

        {/* 流式思考指示器 */}
        {isStreaming && isLast && !contentObj.text && (!msg.toolSteps || msg.toolSteps.length === 0) && (
          <div className="thinking-indicator">
            <SparklesIcon size={16} className="spinning" />
            <span>AI 正在思考...</span>
          </div>
        )}

        {/* 图表展示区 */}
        {msg.charts?.length > 0 && (
          <div className="message-charts-container">
            {msg.charts.map((chart) => (
              <ChartWrapper key={chart.id} chartJson={chart.json} />
            ))}
          </div>
        )}

        {/* 文件下载卡片区 */}
        {msg.files?.length > 0 && (
          <div className="message-files-container">
            {msg.files.map((file, i) => (
              <a
                key={i}
                className="file-card"
                href={getFileUrl(file.filename)}
                download={file.filename}
                target="_blank"
                rel="noreferrer"
              >
                <div className="file-card-icon">
                  <FileIcon size={24} />
                </div>
                <div className="file-card-info">
                  <div className="file-card-name">{file.filename}</div>
                  <div className="file-card-hint">{file.message || '点击下载导出文件'}</div>
                </div>
                <DownloadIcon className="file-card-download" size={18} />
              </a>
            ))}
          </div>
        )}

        {/* 底部操作区 */}
        {(!isStreaming || !isLast) && (contentObj.text || msg.charts?.length > 0) && (
          <div className="message-actions-bar">
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

// 图表包装器组件
const ChartWrapper = memo(({ chartJson }) => {
  return (
    <div className="chart-container">
      <div className="chart-content">
        <SmartChart data={chartJson} height={400} />
      </div>
    </div>
  );
});

export default function ChatMessages({ messages, isStreaming, onSendMessage }) {
  const bottomRef = useRef(null);

  // 自动滚动到底部
  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isStreaming]);

  // 快捷问题提示
  const QUICK_QUESTIONS = [
    { icon: <DatabaseIcon size={20} />, title: '数据库结构', desc: '查看当前数据库所有表名和结构', prompt: '列出数据库中的所有表，并简明扼要地描述它们的作用。' },
    { icon: <BarChartIcon size={20} />, title: '数据分析', desc: '多维数据聚合与趋势分析', prompt: '帮我分析最近一周的用户活跃度趋势，并生成折线图。' },
    { icon: <PieChartIcon size={20} />, title: '业务分布', desc: '深度洞察各类业务数据占比', prompt: '统计各产品类别的销售额占比，请用饼图展示。' },
    { icon: <LayersIcon size={20} />, title: '综合数据洞察', desc: '结合多表的深度业务洞察与报告', prompt: '帮我对近期的销售和库存数据进行深度分析，找出转化率最高的商品，并制作一份详细的分析报告。' }
  ];

  if (!messages || messages.length === 0) {
    return (
      <div className="welcome-screen">
        <div className="welcome-hero">
          <div className="welcome-icon-wrapper">
            <SparklesIcon size={32} />
          </div>
          <h1 className="welcome-title">有什么我可以帮忙的？</h1>
          <p className="welcome-subtitle">
            你可以让我分析数据库、生成可视化图表、导出业务报告，甚至上传文件让我处理。
          </p>
        </div>

        <div className="welcome-tips">
          <div className="tips-title">
            <ZapIcon size={16} /> 试试这样问我
          </div>
          <div className="tips-list">
            {QUICK_QUESTIONS.map((q, i) => (
              <button
                key={i}
                className="tip-item"
                onClick={() => onSendMessage && onSendMessage(q.prompt)}
              >
                <span className="icon">{q.icon}</span>
                <div className="tip-info">
                  <div className="tip-title">{q.title}</div>
                  <div className="tip-desc">{q.desc}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-messages-container">
      <div className="chat-messages">
        {messages.map((msg, index) => (
          <MessageItem
            key={msg.id || index}
            msg={msg}
            isStreaming={isStreaming}
            isLast={index === messages.length - 1}
          />
        ))}
        <div ref={bottomRef} className="chat-bottom-anchor" />
      </div>
    </div>
  );
}
