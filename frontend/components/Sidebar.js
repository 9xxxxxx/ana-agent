'use client';

/**
 * 侧边栏组件 — 对话列表与管理
 */

import { useState, useEffect, useCallback } from 'react';
import { fetchThreads, deleteThread, clearAllHistory } from '@/lib/api';
import { PlusIcon, TrashIcon, MessageIcon, HistoryIcon, SparklesIcon } from './Icons';
import ConfirmDialog from './ConfirmDialog';

export default function Sidebar({ currentThreadId, onSelectThread, onNewChat, refreshKey }) {
  const [threads, setThreads] = useState([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState(null);

  const loadThreads = useCallback(async () => {
    try {
      const data = await fetchThreads();
      setThreads(data.threads || []);
    } catch {
      setThreads([]);
    }
  }, []);

  useEffect(() => {
    loadThreads();
  }, [loadThreads, refreshKey]);

  const handleDelete = (e, tid) => {
    e.stopPropagation();
    setConfirmTarget(tid);
    setConfirmOpen(true);
  };

  const handleClearAll = () => {
    setConfirmTarget('__all__');
    setConfirmOpen(true);
  };

  const handleConfirm = async () => {
    if (confirmTarget === '__all__') {
      await clearAllHistory();
    } else {
      await deleteThread(confirmTarget);
    }
    setConfirmOpen(false);
    setConfirmTarget(null);
    loadThreads();
  };

  return (
    <>
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="sidebar-brand">
            <SparklesIcon size={18} className="brand-icon" />
            <span>SQL Agent</span>
          </div>
          <button
            className="sidebar-btn new-chat-btn"
            onClick={onNewChat}
            title="新建对话"
          >
            <PlusIcon size={18} />
          </button>
        </div>

        <div className="sidebar-section-title">
          <HistoryIcon size={14} />
          <span>对话历史</span>
        </div>

        <nav className="sidebar-threads">
          {threads.length === 0 ? (
            <div className="sidebar-empty">暂无对话记录</div>
          ) : (
            threads.map((t) => (
              <div
                key={t.thread_id}
                className={`sidebar-thread ${currentThreadId === t.thread_id ? 'active' : ''}`}
                onClick={() => onSelectThread(t.thread_id)}
              >
                <MessageIcon size={15} className="thread-icon" />
                <span className="thread-title">{t.title}</span>
                <button
                  className="thread-delete-btn"
                  onClick={(e) => handleDelete(e, t.thread_id)}
                  title="删除此对话"
                >
                  <TrashIcon size={14} />
                </button>
              </div>
            ))
          )}
        </nav>

        {threads.length > 0 && (
          <div className="sidebar-footer">
            <button className="sidebar-btn clear-all-btn" onClick={handleClearAll}>
              <TrashIcon size={15} />
              <span>清空所有对话</span>
            </button>
          </div>
        )}
      </aside>

      <ConfirmDialog
        isOpen={confirmOpen}
        title={confirmTarget === '__all__' ? '清空所有对话' : '删除对话'}
        message={confirmTarget === '__all__' ? '确定要清空所有对话记录吗？此操作不可撤销。' : '确定要删除此对话吗？'}
        onConfirm={handleConfirm}
        onCancel={() => { setConfirmOpen(false); setConfirmTarget(null); }}
      />
    </>
  );
}
