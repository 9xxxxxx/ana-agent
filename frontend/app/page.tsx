'use client';

/**
 * SQL Agent 主页面 — 集成所有组件
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import Sidebar from '@/components/Sidebar';
import ChatMessages from '@/components/ChatMessages';
import ChatInput from '@/components/ChatInput';
import DbConnectionPanel from '@/components/DbConnectionPanel';
import FullReportModal from '@/components/FullReportModal';
import { DatabaseIcon, BarChartIcon, HashIcon } from '@/components/Icons';
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
  const [reportMsg, setReportMsg] = useState(null); // 查看完整报告的消息

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

  // 从消息中提取对话主题（取第一条用户消息的前 30 字）
  const chatTopic = useMemo(() => {
    if (messages.length === 0) return null;
    const firstUser = (messages as any[]).find((m: any) => m.role === 'user');
    if (!firstUser) return null;
    const text = typeof firstUser.content === 'string' ? firstUser.content : '';
    // 去除附件文本
    const cleanText = text.replace(/\[附件:\s*.+?\]\(.+?\)/g, '').trim();
    return cleanText.length > 40 ? cleanText.slice(0, 40) + '…' : cleanText;
  }, [messages]);

  // 对话进度统计
  const chatStats = useMemo(() => {
    if (messages.length === 0) return null;
    const userCount = (messages as any[]).filter((m: any) => m.role === 'user').length;
    const aiCount = (messages as any[]).filter((m: any) => m.role === 'assistant').length;
    const chartCount = (messages as any[]).reduce((acc: number, m: any) => acc + (m.charts?.length || 0), 0);
    return { userCount, aiCount, chartCount };
  }, [messages]);

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
    <div className="flex h-screen w-screen bg-white overflow-hidden text-gray-900">
      <Sidebar
        currentThreadId={threadId}
        onSelectThread={handleSelectThread}
        onNewChat={handleNewChat}
        refreshKey={refreshKey}
      />

      <main className="flex-1 flex flex-col min-w-0 bg-white relative">
        {/* 动态 Header */}
        <header className="flex items-center justify-between px-6 py-3 border-b border-gray-100 bg-white/80 backdrop-blur-sm z-10 sticky top-0 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            {chatTopic ? (
              <div className="flex items-center gap-2 min-w-0">
                <div className="text-base font-semibold text-gray-800 truncate max-w-md">
                  {chatTopic}
                </div>
                {chatStats && (
                  <div className="flex items-center gap-2 text-xs text-gray-400 shrink-0">
                    <span className="flex items-center gap-1">
                      <HashIcon size={12} />
                      {chatStats.userCount + chatStats.aiCount} 条消息
                    </span>
                    {chatStats.chartCount > 0 && (
                      <span className="flex items-center gap-1">
                        <BarChartIcon size={12} />
                        {chatStats.chartCount} 个图表
                      </span>
                    )}
                    {isStreaming && (
                      <span className="flex items-center gap-1 text-brand-500">
                        <span className="w-1.5 h-1.5 rounded-full bg-brand-500 animate-pulse" />
                        生成中
                      </span>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-base font-semibold text-gray-800">新对话</div>
            )}
          </div>
          <div className="flex items-center">
            <button
              className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md border border-gray-200 hover:bg-gray-50 transition-colors text-gray-600"
              onClick={() => setShowDbPanel(true)}
              title="配置数据库连接"
            >
              <DatabaseIcon size={16} />
              <span className={`w-2 h-2 rounded-full ${dbConnected ? 'bg-green-500' : 'bg-red-500'}`} />
              <span>{dbConnected ? '数据库已连接' : '连接数据库'}</span>
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-hidden flex flex-col relative pb-32">
          <ChatMessages
            messages={messages}
            isStreaming={isStreaming}
            onViewReport={(msg: any) => setReportMsg(msg)}
          />
        </div>

        <div className="absolute bottom-0 left-0 right-0 w-full bg-gradient-to-t from-white via-white to-transparent pt-10 pb-6 pointer-events-none">
          <div className="pointer-events-auto">
            <ChatInput
              onSend={sendMessage}
              isStreaming={isStreaming}
              onStop={stopStreaming}
            />
          </div>
        </div>
      </main>

      <DbConnectionPanel
        isOpen={showDbPanel}
        onClose={() => setShowDbPanel(false)}
        onConnect={handleDbConnect}
      />

      <FullReportModal
        isOpen={!!reportMsg}
        onClose={() => setReportMsg(null)}
        message={reportMsg}
      />
    </div>
  );
}
