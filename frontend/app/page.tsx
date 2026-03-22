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
import { TrashIcon, ShareIcon } from '@/components/Icons';
import { useChat } from '@/hooks/useChat';
import { checkHealth, setDbConnection, deleteThread } from '@/lib/api';

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
  const [selectedModel, setSelectedModel] = useState('deepseek-chat');

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
    <div className="flex h-screen w-screen bg-white overflow-hidden text-gray-900">
      <Sidebar
        currentThreadId={threadId}
        onSelectThread={handleSelectThread}
        onNewChat={handleNewChat}
        refreshKey={refreshKey}
        onToggleDatabase={() => setShowDbPanel(true)}
      />

      <main className="flex-1 flex flex-col min-w-0 bg-white relative">
        {/* 极简动态 Header (仿 ChatGPT) */}
        <header className="flex flex-col sm:flex-row items-center justify-between px-4 py-3 bg-white z-10 sticky top-0 shrink-0">
          {/* 左侧：模型选择器 */}
          <div className="flex items-center">
            <div className="relative">
              <select 
                className="appearance-none pl-3 pr-8 py-1.5 focus:bg-white hover:bg-gray-100 rounded-lg transition text-gray-700 text-[15px] font-semibold outline-none cursor-pointer bg-transparent border-0 ring-0 focus:ring-2 focus:ring-gray-200"
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                disabled={isStreaming}
              >
                <option value="deepseek-chat">DeepSeek-Chat (标准智增)</option>
                <option value="deepseek-reasoner">DeepSeek-Reasoner (深度思考)</option>
                <option value="gpt-4o">GPT-4o (全能旗舰)</option>
                <option value="claude-3-5-sonnet">Claude 3.5 Sonnet (编码专家)</option>
              </select>
              <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400 text-xs">▼</div>
            </div>
          </div>
          
          {/* 右侧：快捷操作 */}
          <div className="flex items-center gap-1">
            <button
              className="p-2 text-gray-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
              title="删除当前对话"
              onClick={async () => {
                if (window.confirm('确定要删除当前数据洞察历史吗？此操作不可逆。')) {
                  try {
                    await deleteThread(threadId);
                    handleNewChat();
                  } catch (e) {
                    console.error(e);
                  }
                }
              }}
            >
              <TrashIcon size={16} />
            </button>
            <button 
              className="p-2 text-gray-500 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition" 
              title="分享数据洞察"
              onClick={() => {
                window.alert('分享链接功能将在下一版本开放。当前您可以通过左下角的「导出报告」来分享洞察结论！');
              }}
            >
              <ShareIcon size={16} />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-hidden flex flex-col relative pb-32">
          <ChatMessages
            messages={messages}
            isStreaming={isStreaming}
            onViewReport={(msg: any) => setReportMsg(msg)}
            onEditSend={(msgId: string, newContent: string) => {
              sendMessage(`[用户更正了问题]：\n${newContent}`, selectedModel);
            }}
          />
        </div>

        <div className="absolute bottom-0 left-0 right-0 w-full bg-gradient-to-t from-white via-white to-transparent pt-10 pb-6 pointer-events-none">
          <div className="pointer-events-auto">
            <ChatInput
              onSend={(text: string) => sendMessage(text, selectedModel)}
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
