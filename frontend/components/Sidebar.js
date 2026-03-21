'use client';

/**
 * 侧边栏组件 — ChatGPT 风格对话列表
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { fetchThreads, deleteThread, clearAllHistory } from '@/lib/api';
import { PlusIcon, TrashIcon, MessageIcon, SparklesIcon } from './Icons';
import ConfirmDialog from './ConfirmDialog';

// 按日期分组对话
function groupThreadsByDate(threads) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today - 86400000);
  const week = new Date(today - 7 * 86400000);

  const groups = {
    '今天': [],
    '昨天': [],
    '过去 7 天': [],
    '更早': [],
  };

  threads.forEach(t => {
    const date = new Date(t.updated_at || t.created_at || 0);
    if (date >= today) groups['今天'].push(t);
    else if (date >= yesterday) groups['昨天'].push(t);
    else if (date >= week) groups['过去 7 天'].push(t);
    else groups['更早'].push(t);
  });

  return groups;
}

export default function Sidebar({ currentThreadId, onSelectThread, onNewChat, refreshKey }) {
  const [threads, setThreads] = useState([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState(null);
  const [hoveredThread, setHoveredThread] = useState(null);

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

  const grouped = useMemo(() => groupThreadsByDate(threads), [threads]);

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
        {/* 顶部新建按钮 */}
        <div className="sidebar-top">
          <button className="new-chat-btn" onClick={onNewChat}>
            <PlusIcon size={16} />
            <span>新建对话</span>
          </button>
        </div>

        {/* 对话列表 */}
        <nav className="sidebar-threads">
          {threads.length === 0 ? (
            <div className="sidebar-empty">
              <SparklesIcon size={24} className="empty-icon" />
              <span>开始你的第一次对话</span>
            </div>
          ) : (
            Object.entries(grouped).map(([label, items]) => {
              if (items.length === 0) return null;
              return (
                <div key={label} className="thread-group">
                  <div className="thread-group-label">{label}</div>
                  {items.map(t => (
                    <div
                      key={t.thread_id}
                      className={`sidebar-thread ${currentThreadId === t.thread_id ? 'active' : ''}`}
                      onClick={() => onSelectThread(t.thread_id)}
                      onMouseEnter={() => setHoveredThread(t.thread_id)}
                      onMouseLeave={() => setHoveredThread(null)}
                    >
                      <MessageIcon size={16} className="thread-icon" />
                      <span className="thread-title">{t.title || '新对话'}</span>
                      {(hoveredThread === t.thread_id || currentThreadId === t.thread_id) && (
                        <button
                          className="thread-delete-btn"
                          onClick={(e) => handleDelete(e, t.thread_id)}
                          title="删除"
                        >
                          <TrashIcon size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              );
            })
          )}
        </nav>

        {/* 底部 */}
        {threads.length > 0 && (
          <div className="sidebar-footer">
            <button className="clear-all-btn" onClick={handleClearAll}>
              <TrashIcon size={14} />
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
