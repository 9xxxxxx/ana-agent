'use client';

/**
 * 侧边栏组件 — 极简白雅风格 (ChatGPT Style)
 * 支持折叠/展开，分为固定操作区与滚动聊天记录区。
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { fetchThreads, deleteThread, clearAllHistory } from '@/lib/api';
import {
  EditIcon, SearchIcon, DatabaseIcon, MessageIcon, 
  MoreIcon, StarIcon, ShareIcon, DownloadIcon, TrashIcon,
  SettingsIcon, PanelLeftCloseIcon, PanelLeftOpenIcon,
  SparklesIcon, LayoutGridIcon, BellIcon
} from './Icons';
import ConfirmDialog from './ConfirmDialog';
import SearchModal from './SearchModal';
import SettingsModal from './SettingsModal';
import ReportsDashboard from './ReportsDashboard';
import WatchdogPanel from './WatchdogPanel';
// 移除 ThemeToggle 引用

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
    { icon: <DownloadIcon size={14} />, label: '全景导出', onClick: () => { onClose(); } },
    { divider: true },
    { icon: <TrashIcon size={14} />, label: '删除', danger: true, onClick: () => { onDelete(threadId); onClose(); } },
  ];

  return (
    <div
      ref={menuRef}
      className="absolute right-0 top-8 z-50 w-36 bg-popover border border-border rounded-xl shadow-lg py-1 animate-in fade-in zoom-in-95 duration-150"
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
                ? 'text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
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

export default function Sidebar({ currentThreadId, onSelectThread, onNewChat, refreshKey, onToggleDatabase }) {
  const [threads, setThreads] = useState([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState(null);
  const [activeMenu, setActiveMenu] = useState(null);
  const [isCollapsed, setIsCollapsed] = useState(false); // 控制侧边栏展开/折叠
  
  // 模态框控制状态
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showReportsDashboard, setShowReportsDashboard] = useState(false);
  const [showWatchdogPanel, setShowWatchdogPanel] = useState(false);

  // 快捷折叠提示窗态
  const [showTooltip, setShowTooltip] = useState('');

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

  // 折叠状态下的侧边栏
  if (isCollapsed) {
    return (
      <aside className="w-[60px] bg-sidebar-bg flex flex-col h-full shrink-0 border-r border-border transition-all duration-300">
        <div className="flex flex-col items-center pt-4 pb-2 gap-4">
          {/* Logo 简化 - 浅色风格 */}
          <div 
            className="flex items-center justify-center w-8 h-8 rounded-lg bg-indigo-600 cursor-pointer shadow-sm hover:ring-2 hover:ring-indigo-200 transition-all" 
            onClick={() => setIsCollapsed(false)} 
            title="展开侧边栏"
          >
            <SparklesIcon size={16} className="text-white" />
          </div>
          
          <button className="p-2 hover:bg-sidebar-hover rounded-lg text-sidebar-foreground transition mt-4" onClick={onNewChat} title="新建聊天">
            <EditIcon size={20} />
          </button>
          <button 
            className="p-2 hover:bg-sidebar-hover rounded-lg text-sidebar-foreground transition" 
            title="搜索聊天"
            onClick={() => setShowSearchModal(true)}
          >
            <SearchIcon size={20} />
          </button>
          <button className="p-2 hover:bg-sidebar-hover rounded-lg text-sidebar-foreground transition" onClick={onToggleDatabase} title="数据连接参数">
            <DatabaseIcon size={20} />
          </button>
        </div>
        <div className="mt-auto flex flex-col items-center pb-4 gap-4">
          {/* 移除 ThemeToggle */}
          <button 
            className="p-2 hover:bg-sidebar-hover rounded-lg text-sidebar-foreground transition" 
            title="系统设置"
            onClick={() => setShowSettingsModal(true)}
          >
            <SettingsIcon size={20} />
          </button>
        </div>
      </aside>
    );
  }

  // 展开状态的侧边栏
  return (
    <>
      <aside className="w-[260px] bg-sidebar-bg text-sidebar-foreground flex flex-col h-full shrink-0 transition-all duration-300 relative group">
        
        {/* 顶部悬浮控制栏（如 Logo + Collapse） */}
        <div className="flex items-center justify-between px-3 pt-3 pb-2">
          <div className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-sidebar-hover cursor-pointer transition text-sidebar-foreground">
            <div className="w-5 h-5 rounded bg-indigo-600 flex items-center justify-center shadow-sm">
               <SparklesIcon size={12} className="text-white" />
            </div>
            <span className="text-sm font-bold tracking-wide">SQL Agent</span>
          </div>
          <div className="flex items-center gap-1">
            <button 
              className="p-1.5 text-gray-500 hover:text-gray-800 hover:bg-gray-200 rounded-lg transition opacity-0 group-hover:opacity-100" 
              onClick={() => setIsCollapsed(true)}
              title="关闭侧边栏"
            >
              <PanelLeftCloseIcon size={18} />
            </button>
            <button 
              className="p-1.5 text-gray-500 hover:text-gray-800 hover:bg-gray-200 rounded-lg transition"
              onClick={onNewChat}
              title="新聊天"
            >
              <EditIcon size={18} />
            </button>
          </div>
        </div>

        {/* 第一段：固定的功能导航区 */}
        <div className="px-3 py-2 flex flex-col gap-0.5">
          <button 
            className="flex items-center gap-3 w-full px-3 py-2.5 text-sm text-gray-800 hover:bg-gray-200 rounded-xl transition"
            onClick={onNewChat}
          >
            <EditIcon size={18} />
            <span className="font-medium">新聊天</span>
          </button>
          
          <button 
            className="flex items-center gap-3 w-full px-3 py-2.5 text-sm text-gray-800 hover:bg-gray-200 rounded-xl transition"
            onClick={() => setShowSearchModal(true)}
          >
            <SearchIcon size={18} />
            <span className="font-medium">搜索聊天</span>
          </button>

          <button 
            className="flex items-center gap-3 w-full px-3 py-2.5 text-sm text-gray-800 hover:bg-gray-200 rounded-xl transition"
            onClick={() => setShowReportsDashboard(true)}
          >
            <LayoutGridIcon size={18} />
            <span className="font-medium">全部报告</span>
          </button>
        </div>

        {/* 插件/应用导航区 */}
        <div className="px-3 py-1 flex flex-col gap-0.5">
          <button 
            className="flex items-center gap-3 w-full px-3 py-2.5 text-sm text-gray-800 hover:bg-gray-200 rounded-xl transition"
            onClick={onToggleDatabase}
          >
            <DatabaseIcon size={18} />
            <span className="font-medium">数据表连接参数</span>
          </button>

          <button 
            className="flex items-center gap-3 w-full px-3 py-2.5 text-sm text-gray-800 hover:bg-gray-200 rounded-xl transition font-semibold text-indigo-600"
            onClick={() => setShowWatchdogPanel(true)}
          >
            <BellIcon size={18} className="text-indigo-600" />
            <span>数据值班室 (Watchdog)</span>
          </button>
        </div>

        <div className="px-5 py-2">
          <div className="h-px bg-border/60 w-full" />
        </div>

        {/* 第二段：滚动的历史聊天记录区 */}
        <nav className="flex-1 overflow-y-auto px-3 py-1 sidebar-scroller">
          <div className="px-3 pt-2 pb-1 text-xs font-semibold text-gray-400">
            你的聊天
          </div>

          {threads.length === 0 ? (
            <div className="px-3 py-4 text-xs text-gray-400">暂无历史记录</div>
          ) : (
            Object.entries(grouped).map(([label, items], idx) => {
              if (items.length === 0) return null;
              return (
                <div key={label} className="mt-3">
                  <div className="px-3 pb-1 text-[11px] font-semibold text-gray-400 tracking-wider hidden">{label}</div>
                  <div className="flex flex-col gap-0.5">
                    {items.map(t => (
                      <div
                        key={t.thread_id}
                        className={`group/item relative flex items-center px-3 py-2.5 rounded-xl cursor-pointer transition-all text-sm border border-transparent ${
                          currentThreadId === t.thread_id
                            ? 'bg-white text-indigo-600 font-semibold shadow-sm border-sidebar-border'
                            : 'text-sidebar-foreground/80 hover:bg-sidebar-hover hover:text-indigo-600'
                        }`}
                        onClick={() => onSelectThread(t.thread_id)}
                      >
                        {/* 极简风：不显示前缀图标，仅文本 */}
                        <span className="flex-1 truncate pr-7">{t.title || '新对话'}</span>
                        
                        {/* 更多操作 */}
                        <button
                          className="absolute right-2 p-1 text-gray-500 hover:text-gray-900 hover:bg-white rounded-md opacity-0 group-hover/item:opacity-100 transition shadow-sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveMenu(activeMenu === t.thread_id ? null : t.thread_id);
                          }}
                        >
                          <MoreIcon size={14} />
                        </button>

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

        {/* 底部设置区 */}
        <div className="px-3 py-3 border-t border-sidebar-border/50 mt-auto bg-sidebar-bg flex flex-col gap-1">
          {/* 移除 ThemeToggle */}
          <button 
            className="flex items-center gap-3 w-full px-3 py-2.5 text-sm hover:bg-sidebar-hover rounded-xl transition text-sidebar-foreground"
            onClick={() => setShowSettingsModal(true)}
          >
            <SettingsIcon size={18} />
            <span className="font-medium">系统设置</span>
          </button>
        </div>
      </aside>

      <ConfirmDialog
        isOpen={confirmOpen}
        title={confirmTarget === '__all__' ? '清空所有对话' : '删除对话'}
        message={confirmTarget === '__all__' ? '确定要清空所有对话记录吗？此操作不可撤销。' : '确定要删除此对话吗？'}
        onConfirm={handleConfirm}
        onCancel={() => { setConfirmOpen(false); setConfirmTarget(null); }}
      />
      
      {/* Search Modal */}
      <SearchModal 
        isOpen={showSearchModal} 
        onClose={() => setShowSearchModal(false)}
        threads={threads}
        onSelectThread={onSelectThread}
      />

      {/* Settings Modal */}
      <SettingsModal 
        isOpen={showSettingsModal} 
        onClose={() => setShowSettingsModal(false)} 
      />

      {/* Reports Dashboard */}
      <ReportsDashboard 
        isOpen={showReportsDashboard}
        onClose={() => setShowReportsDashboard(false)}
        threads={threads}
        onSelectThread={onSelectThread}
      />
      {/* Watchdog Panel */}
      <WatchdogPanel 
        isOpen={showWatchdogPanel}
        onClose={() => setShowWatchdogPanel(false)}
      />
    </>
  );
}
