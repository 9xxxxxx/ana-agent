'use client';

/**
 * SQL Agent 主页面 — 集成所有组件
 */

import { useState, useEffect, useCallback } from 'react';
import Sidebar from '@/components/Sidebar';
import ChatMessages from '@/components/ChatMessages';
import ChatInput from '@/components/ChatInput';
import DbConnectionPanel from '@/components/DbConnectionPanel';
import { DatabaseIcon } from '@/components/Icons';
import { useChat } from '@/hooks/useChat';
import { checkHealth, setDbConnection } from '@/lib/api';

// 生成新的 thread ID
function newThreadId() {
  return `t-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function Home() {
  const [threadId, setThreadId] = useState(() => newThreadId());
  const [dbConnected, setDbConnected] = useState(false);
  const [dbUrl, setDbUrl] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [showDbPanel, setShowDbPanel] = useState(false);

  const { messages, isStreaming, sendMessage, stopStreaming, loadHistory, clearMessages } = useChat(threadId);

  // 监听流式状态变化，结束时刷新侧边栏
  useEffect(() => {
    if (!isStreaming) {
      setRefreshKey((prev) => prev + 1);
    }
  }, [isStreaming]);

  // 健康检查
  useEffect(() => {
    checkHealth()
      .then((data) => {
        setDbConnected(data.database_connected);
        if (data.database_url) {
          setDbUrl(data.database_url);
        }
      })
      .catch(() => setDbConnected(false));
  }, []);

  // 处理数据库连接
  const handleDbConnect = useCallback(async (url: string) => {
    try {
      const result = await setDbConnection(url);
      if (result.success) {
        setDbConnected(true);
        setDbUrl(url);
      } else {
        setDbConnected(false);
      }
    } catch (e) {
      console.error('数据库连接失败:', e);
      setDbConnected(false);
    }
  }, []);

  // 新建对话
  const handleNewChat = useCallback(() => {
    if (isStreaming) {
      stopStreaming();
    }
    const tid = newThreadId();
    setThreadId(tid);
    clearMessages();
  }, [clearMessages, stopStreaming, isStreaming]);

  // 切换对话
  const handleSelectThread = useCallback(
    (tid: string) => {
      if (isStreaming) {
        stopStreaming();
      }
      setThreadId(tid);
      loadHistory(tid);
    },
    [loadHistory, stopStreaming, isStreaming]
  );

  return (
    <div className="app-layout">
      <Sidebar
        currentThreadId={threadId}
        onSelectThread={handleSelectThread}
        onNewChat={handleNewChat}
        refreshKey={refreshKey}
      />

      <main className="chat-main">
        <header className="chat-header">
          <div className="chat-header-title">
            {messages.length > 0 ? '对话中' : '新对话'}
          </div>
          <div className="chat-header-actions">
            <button
              className="db-connect-btn"
              onClick={() => setShowDbPanel(true)}
              title="配置数据库连接"
            >
              <DatabaseIcon size={16} />
              <span className={`db-status-dot ${dbConnected ? '' : 'disconnected'}`} />
              <span>{dbConnected ? '数据库已连接' : '连接数据库'}</span>
            </button>
          </div>
        </header>

        <ChatMessages messages={messages} isStreaming={isStreaming} />

        <ChatInput
          onSend={sendMessage}
          isStreaming={isStreaming}
          onStop={stopStreaming}
        />
      </main>

      <DbConnectionPanel
        isOpen={showDbPanel}
        onClose={() => setShowDbPanel(false)}
        onConnect={handleDbConnect}
      />
    </div>
  );
}
