'use client';

/**
 * SQL Agent 主页面 — 集成所有组件
 */

import { useState, useEffect, useCallback } from 'react';
import Sidebar from '@/components/Sidebar';
import ChatMessages from '@/components/ChatMessages';
import ChatInput from '@/components/ChatInput';
import { useChat } from '@/hooks/useChat';
import { checkHealth } from '@/lib/api';

// 生成新的 thread ID
function newThreadId() {
  return `t-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function Home() {
  const [threadId, setThreadId] = useState(() => newThreadId());
  const [dbConnected, setDbConnected] = useState(false);

  const { messages, isStreaming, sendMessage, stopStreaming, loadHistory, clearMessages } = useChat(threadId);

  // 健康检查
  useEffect(() => {
    checkHealth()
      .then((data) => setDbConnected(data.database_connected))
      .catch(() => setDbConnected(false));
  }, []);

  // 新建对话
  const handleNewChat = useCallback(() => {
    const tid = newThreadId();
    setThreadId(tid);
    clearMessages();
  }, [clearMessages]);

  // 切换对话
  const handleSelectThread = useCallback(
    (tid: string) => {
      setThreadId(tid);
      loadHistory(tid);
    },
    [loadHistory]
  );

  return (
    <div className="app-layout">
      <Sidebar
        currentThreadId={threadId}
        onSelectThread={handleSelectThread}
        onNewChat={handleNewChat}
      />

      <main className="chat-main">
        <header className="chat-header">
          <div className="chat-header-title">
            {messages.length > 0 ? '对话中' : '新对话'}
          </div>
          <div className="db-status">
            <div className={`db-status-dot ${dbConnected ? '' : 'disconnected'}`} />
            {dbConnected ? '数据库已连接' : '数据库未连接'}
          </div>
        </header>

        <ChatMessages messages={messages} isStreaming={isStreaming} />

        <ChatInput
          onSend={sendMessage}
          isStreaming={isStreaming}
          onStop={stopStreaming}
        />
      </main>
    </div>
  );
}
