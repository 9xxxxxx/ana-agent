'use client';

/**
 * 聊天消息列表组件
 */

import { useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import ToolStep from './ToolStep';
import ChartRenderer from './ChartRenderer';
import { getFileUrl } from '@/lib/api';

export default function ChatMessages({ messages, isStreaming }) {
  const bottomRef = useRef(null);

  // 自动滚动到底部
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isStreaming]);

  if (messages.length === 0) {
    return <WelcomeScreen />;
  }

  return (
    <div className="messages-container">
      <div className="messages-inner">
        {messages.map((msg) => (
          <div key={msg.id} className={`message message-${msg.role}`}>
            {msg.role === 'user' ? (
              <div className="message-bubble">{msg.content}</div>
            ) : (
              <>
                <div className="message-avatar">🤖</div>
                <div className="message-content">
                  {/* 工具步骤 */}
                  {msg.toolSteps?.map((step) => (
                    <ToolStep key={step.id} step={step} />
                  ))}

                  {/* 图表 */}
                  {msg.charts?.map((chart) => (
                    <ChartRenderer key={chart.id} chartJson={chart.json} />
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
                      <span className="file-card-icon">📄</span>
                      <span className="file-card-name">{file.filename}</span>
                    </a>
                  ))}

                  {/* AI 文本内容 */}
                  {msg.content && (
                    <div className="message-bubble">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {msg.content}
                      </ReactMarkdown>
                      {isStreaming && msg === messages[messages.length - 1] && (
                        <span className="streaming-cursor" />
                      )}
                    </div>
                  )}

                  {/* 流式中但还没有文本内容时显示思考指示器 */}
                  {!msg.content && isStreaming && msg === messages[messages.length - 1] && (
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
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

/* 欢迎屏幕 */
function WelcomeScreen() {
  const features = [
    { icon: '📊', title: '多数据库支持', desc: 'PostgreSQL / MySQL / SQLite / DuckDB' },
    { icon: '📈', title: '11 种图表', desc: '柱状图、折线图、饼图、热力图...' },
    { icon: '📝', title: '报告导出', desc: 'Markdown / CSV / Excel' },
    { icon: '🔔', title: '消息推送', desc: '飞书卡片 / 邮件通知' },
  ];

  return (
    <div className="messages-container">
      <div className="welcome-screen">
        <div className="welcome-icon">🧠</div>
        <h1 className="welcome-title">SQL Agent</h1>
        <p className="welcome-subtitle">
          你的智能数据分析助手。通过自然语言对话，轻松完成数据库查询、可视化图表生成和业务报告撰写。
        </p>
        <div className="welcome-features">
          {features.map((f, i) => (
            <div key={i} className="feature-card">
              <div className="feature-icon">{f.icon}</div>
              <div className="feature-title">{f.title}</div>
              <div className="feature-desc">{f.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
