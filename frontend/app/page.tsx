'use client';

/**
 * SQL Agent 主页面 — 集成所有组件
 */

import { useState, useEffect, useCallback } from 'react';
import Sidebar from '@/components/Sidebar';
import ChatMessages from '@/components/ChatMessages';
import ChatInput from '@/components/ChatInput';
import DbConnectionPanel from '@/components/DbConnectionPanel';
import FullReportModal from '@/components/FullReportModal';
import BrainstormModal from '@/components/BrainstormModal';
import ReportViewer from '@/components/report/ReportViewer';
import { TrashIcon, ShareIcon } from '@/components/Icons';
import { useChat } from '@/hooks/useChat';
import { checkHealth, setDbConnection, deleteThread } from '@/lib/api';

// 生成新的 thread ID
function newThreadId() {
  return `t-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

type ChatMessage = {
  id: string;
  role: string;
  content: string;
  charts?: Array<{ id: string; json: unknown }>;
  toolSteps?: unknown[];
  files?: unknown[];
};

export default function Home() {
  const [threadId, setThreadId] = useState(() => newThreadId());
  const [dbConnected, setDbConnected] = useState(false);
  const [dbUrl, setDbUrl] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [showDbPanel, setShowDbPanel] = useState(false);
  const [reportMsg, setReportMsg] = useState<ChatMessage | null>(null); // 查看完整报告的消息
  const [showBrainstormModal, setShowBrainstormModal] = useState(false);
  const [brainstormReport, setBrainstormReport] = useState<Record<string, unknown> | null>(null);
  const [selectedModel, setSelectedModel] = useState('deepseek-chat');

  const { messages, isStreaming, sendMessage, stopStreaming, loadHistory, clearMessages } = useChat(threadId);

  // 监听流式状态变化，结束时刷新侧边栏
  useEffect(() => {
    if (!isStreaming) {
      setRefreshKey((prev) => prev + 1);
    }
  }, [isStreaming]);

  // 健康检查与初始化配置
  useEffect(() => {
    checkHealth()
      .then((data) => {
        setDbConnected(data.database_connected);
        if (data.database_url) {
          setDbUrl(data.database_url);
        }
      })
      .catch(() => setDbConnected(false));

    // 加载保存的模型配置
    const savedModel = localStorage.getItem('sqlAgentModel');
    if (savedModel) {
      setSelectedModel(savedModel);
    }
  }, []);

  // 监听来自 SettingsModal 的全局设置更新事件
  useEffect(() => {
    const handleSettingsUpdate = (event: Event) => {
      const customEvent = event as CustomEvent<{ model?: string }>;
      if (customEvent.detail?.model) {
        setSelectedModel(customEvent.detail.model);
      }
    };
    window.addEventListener('sql-agent-settings-updated', handleSettingsUpdate);
    return () => window.removeEventListener('sql-agent-settings-updated', handleSettingsUpdate);
  }, []);

  // 处理模型手动切换
  const handleModelChange = useCallback((model: string) => {
    setSelectedModel(model);
    localStorage.setItem('sqlAgentModel', model);
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
                className="appearance-none pl-3 pr-8 py-1.5 focus:bg-white hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition text-gray-700 dark:text-gray-300 text-[15px] font-semibold outline-none cursor-pointer bg-transparent border-0 ring-0 focus:ring-2 focus:ring-gray-200"
                value={selectedModel}
                onChange={(e) => handleModelChange(e.target.value)}
                disabled={isStreaming}
              >
                <option value="deepseek-chat">DeepSeek-Chat (标准智增)</option>
                <option value="deepseek-reasoner">DeepSeek-Reasoner (深度思考)</option>
                <option value="gpt-4o">GPT-4o (全能旗舰)</option>
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
              className="px-3 py-2 text-xs font-semibold text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition"
              title="多专家会商"
              onClick={() => setShowBrainstormModal(true)}
            >
              多专家会商
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
            onViewReport={(msg: ChatMessage) => setReportMsg(msg)}
            onEditSend={(_msgId: string, newContent: string) => {
              sendMessage(`[用户更正了问题]：\n${newContent}`, selectedModel, dbUrl);
            }}
          />
        </div>

        <div className="absolute bottom-0 left-0 right-0 w-full bg-gradient-to-t from-white via-white to-transparent pt-10 pb-6 pointer-events-none">
          <div className="pointer-events-auto">
            <ChatInput
              onSend={(text: string) => sendMessage(text, selectedModel, dbUrl)}
              isStreaming={isStreaming}
              onStop={stopStreaming}
              dbConnected={dbConnected}
              dbUrl={dbUrl}
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

      <BrainstormModal
        isOpen={showBrainstormModal}
        onClose={() => setShowBrainstormModal(false)}
        onAdopt={(report: string) => {
          setShowBrainstormModal(false);
          sendMessage(`请基于以下多专家会商结论继续形成最终分析与执行方案：\n\n${report}`, selectedModel, dbUrl);
        }}
        onOpenReport={(report: Record<string, unknown> | null) => {
          if (!report) return;
          setShowBrainstormModal(false);
          setBrainstormReport(report);
        }}
      />

      {brainstormReport && (
        <div className="fixed inset-0 z-[10001] bg-background">
          <ReportViewer
            report={brainstormReport}
            onClose={() => setBrainstormReport(null)}
            onExport={() => {}}
          />
        </div>
      )}
    </div>
  );
}
