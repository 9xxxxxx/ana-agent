'use client';

/**
 * 侧边栏组件 — 品牌 Logo + 对话列表 + 操作菜单
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { fetchThreads, deleteThread, clearAllHistory } from '@/lib/api';
import {
  PlusIcon, TrashIcon, MessageIcon, SparklesIcon,
  MoreIcon, StarIcon, ShareIcon, DownloadIcon, SettingsIcon
} from './Icons';
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

// 对话操作菜单（下拉弹层）
function ThreadActionMenu({ threadId, onClose, onDelete }) {
  const menuRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  const actions = [
    { icon: <StarIcon size={14} />, label: '收藏', onClick: () => { onClose(); } },
    { icon: <ShareIcon size={14} />, label: '分享', onClick: () => { onClose(); } },
    { icon: <DownloadIcon size={14} />, label: '导出', onClick: () => { onClose(); } },
    { divider: true },
    { icon: <TrashIcon size={14} />, label: '删除', danger: true, onClick: () => { onDelete(threadId); onClose(); } },
  ];

  return (
    <div
      ref={menuRef}
      className="absolute right-0 top-8 z-50 w-36 bg-white border border-gray-200 rounded-lg shadow-lg py-1 animate-in fade-in zoom-in-95 duration-150"
    >
      {actions.map((action, i) => {
        if (action.divider) {
          return <div key={i} className="border-t border-gray-100 my-1" />;
        }
        return (
          <button
            key={i}
            className={`flex items-center gap-2.5 w-full px-3 py-2 text-xs transition-colors ${
              action.danger
                ? 'text-rose-600 hover:bg-rose-50'
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            }`}
            onClick={action.onClick}
          >
            {action.icon}
            <span>{action.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export default function Sidebar({ currentThreadId, onSelectThread, onNewChat, refreshKey }) {
  const [threads, setThreads] = useState([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState(null);
  const [activeMenu, setActiveMenu] = useState(null);

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

  const handleDelete = (tid) => {
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
        {/* 品牌 Logo 区域 */}
        <div className="px-4 pt-4 pb-2">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-500 to-indigo-600 flex items-center justify-center shadow-sm">
              <SparklesIcon size={16} className="text-white" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-gray-900 leading-tight">SQL Agent</h1>
              <p className="text-[10px] text-gray-400 leading-tight">智能数据分析助手</p>
            </div>
          </div>
          <button
            className="flex items-center gap-2 w-full px-4 py-2.5 bg-gradient-to-r from-brand-500 to-brand-600 hover:from-brand-600 hover:to-brand-700 text-white rounded-xl transition-all duration-200 shadow-sm hover:shadow-md group text-sm font-medium"
            onClick={onNewChat}
          >
            <PlusIcon size={16} className="opacity-80 group-hover:opacity-100" />
            <span>新建对话</span>
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
                <div key={label} className={idx > 0 ? "mt-5" : "mt-1"}>
                  <div className="px-3 pb-1.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">{label}</div>
                  <div className="flex flex-col gap-0.5">
                    {items.map(t => (
                      <div
                        key={t.thread_id}
                        className={`group relative flex items-center gap-2.5 px-3 py-2.5 rounded-lg cursor-pointer transition-all duration-200 text-sm ${
                          currentThreadId === t.thread_id
                            ? 'bg-brand-50 text-brand-700 font-semibold ring-1 ring-brand-200/50'
                            : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                        }`}
                        onClick={() => onSelectThread(t.thread_id)}
                      >
                        <MessageIcon size={15} className={`shrink-0 ${currentThreadId === t.thread_id ? 'text-brand-500' : 'text-gray-400'}`} />
                        <span className="flex-1 truncate pr-7 text-[13px]">{t.title || '新对话'}</span>
                        
                        {/* 操作按钮 -- hover 时显示 */}
                        <button
                          className="absolute right-2 p-1 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-md opacity-0 group-hover:opacity-100 transition-all"
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveMenu(activeMenu === t.thread_id ? null : t.thread_id);
                          }}
                          title="更多操作"
                        >
                          <MoreIcon size={14} />
                        </button>

                        {/* 操作菜单下拉 */}
                        {activeMenu === t.thread_id && (
                          <ThreadActionMenu
                            threadId={t.thread_id}
                            onClose={() => setActiveMenu(null)}
                            onDelete={handleDelete}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </nav>

        {/* 底部区域 */}
        <div className="p-3 border-t border-gray-100">
          <div className="flex items-center gap-2">
            {threads.length > 0 && (
              <button
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                onClick={handleClearAll}
              >
                <TrashIcon size={13} />
                <span>清空历史</span>
              </button>
            )}
            <button
              className="flex items-center justify-center p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-all"
              title="设置"
            >
              <SettingsIcon size={16} />
            </button>
          </div>
        </div>
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
