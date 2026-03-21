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
      <aside className="w-[260px] bg-white flex flex-col h-full shrink-0 border-r border-gray-200 shadow-sm z-10">
        {/* 顶部新建按钮 */}
        <div className="p-3">
          <button
            className="flex items-center gap-2 w-full px-4 py-3 bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 hover:border-gray-300 rounded-xl transition-all duration-200 shadow-sm group"
            onClick={onNewChat}
          >
            <PlusIcon size={18} className="text-gray-400 group-hover:text-brand-500 transition-colors" />
            <span className="text-sm font-semibold">新建对话</span>
          </button>
        </div>

        {/* 对话列表 */}
        <nav className="flex-1 overflow-y-auto px-3 py-2 sidebar-scroller">
          {threads.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-400 opacity-80 mt-10">
              <SparklesIcon size={28} className="mb-3 text-gray-300" />
              <span className="text-sm font-medium">开始你的第一次探索</span>
            </div>
          ) : (
            Object.entries(grouped).map(([label, items], idx) => {
              if (items.length === 0) return null;
              return (
                <div key={label} className={idx > 0 ? "mt-6" : "mt-2"}>
                  <div className="px-3 pb-2 text-xs font-bold text-gray-400 uppercase tracking-wider">{label}</div>
                  <div className="flex flex-col gap-0.5">
                    {items.map(t => (
                      <div
                        key={t.thread_id}
                        className={`group relative flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-all duration-200 text-sm ${
                          currentThreadId === t.thread_id
                            ? 'bg-brand-50 text-brand-700 font-semibold shadow-sm ring-1 ring-brand-200/50'
                            : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                        }`}
                        onClick={() => onSelectThread(t.thread_id)}
                        onMouseEnter={() => setHoveredThread(t.thread_id)}
                        onMouseLeave={() => setHoveredThread(null)}
                      >
                        <MessageIcon size={16} className={`shrink-0 ${currentThreadId === t.thread_id ? 'text-brand-500' : 'text-gray-400'}`} />
                        <span className="flex-1 truncate pr-6">{t.title || '新对话'}</span>
                        
                        {(hoveredThread === t.thread_id || currentThreadId === t.thread_id) && (
                          <button
                            className="absolute right-2 p-1 text-gray-400 hover:text-rose-500 hover:bg-rose-50 rounded-md opacity-0 group-hover:opacity-100 transition-all shadow-sm"
                            onClick={(e) => handleDelete(e, t.thread_id)}
                            title="删除对话"
                          >
                            <TrashIcon size={14} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </nav>

        {/* 底部 */}
        {threads.length > 0 && (
          <div className="p-3 border-t border-gray-100 bg-gray-50/50">
            <button
              className="flex items-center justify-center gap-2 w-full px-3 py-2.5 text-sm text-gray-500 hover:text-rose-600 hover:bg-rose-50 hover:border-rose-200 border border-transparent rounded-lg transition-all"
              onClick={handleClearAll}
            >
              <TrashIcon size={16} />
              <span className="font-medium">清空所有历史</span>
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
