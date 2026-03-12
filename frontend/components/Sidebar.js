'use client';

/**
 * 侧边栏组件 — 历史记录管理
 */

import { useState, useEffect } from 'react';
import { fetchThreads, deleteThread, clearAllHistory } from '@/lib/api';

export default function Sidebar({ currentThreadId, onSelectThread, onNewChat }) {
  const [threads, setThreads] = useState([]);

  // 加载对话列表
  const loadThreads = async () => {
    try {
      const data = await fetchThreads();
      setThreads(data.threads || []);
    } catch {
      setThreads([]);
    }
  };

  useEffect(() => {
    loadThreads();
  }, [currentThreadId]);

  // 删除单个对话
  const handleDelete = async (e, threadId) => {
    e.stopPropagation();
    if (!confirm('确定要删除这条对话记录吗？')) return;
    await deleteThread(threadId);
    loadThreads();
    if (threadId === currentThreadId) {
      onNewChat();
    }
  };

  // 清空全部
  const handleClearAll = async () => {
    if (!confirm('⚠️ 确定要清空所有历史记录吗？此操作不可恢复！')) return;
    await clearAllHistory();
    loadThreads();
    onNewChat();
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <span>🤖</span>
          SQL Agent
        </div>
        <button className="new-chat-btn" onClick={onNewChat}>
          ＋ 新对话
        </button>
      </div>

      <div className="sidebar-threads">
        {threads.length === 0 ? (
          <div style={{ padding: '16px', color: 'var(--text-muted)', fontSize: '0.82rem', textAlign: 'center' }}>
            暂无历史记录
          </div>
        ) : (
          threads.map((t) => (
            <div
              key={t.thread_id}
              className={`thread-item ${t.thread_id === currentThreadId ? 'active' : ''}`}
              onClick={() => onSelectThread(t.thread_id)}
            >
              <span className="thread-title">💬 {t.title}</span>
              <button
                className="thread-delete"
                onClick={(e) => handleDelete(e, t.thread_id)}
                title="删除"
              >
                ✕
              </button>
            </div>
          ))
        )}
      </div>

      {threads.length > 0 && (
        <div className="sidebar-footer">
          <button className="clear-all-btn" onClick={handleClearAll}>
            🗑️ 清空所有记录
          </button>
        </div>
      )}
    </aside>
  );
}
