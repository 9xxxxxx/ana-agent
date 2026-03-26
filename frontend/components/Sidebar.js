'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { fetchThreads, deleteThread, clearAllHistory } from '@/lib/api';
import {
  EditIcon,
  SearchIcon,
  DatabaseIcon,
  MoreIcon,
  StarIcon,
  ShareIcon,
  DownloadIcon,
  TrashIcon,
  SettingsIcon,
  PanelLeftCloseIcon,
  SparklesIcon,
  LayoutGridIcon,
  BellIcon,
  InfoIcon,
} from './Icons';
import ConfirmDialog from './ConfirmDialog';
import SearchModal from './SearchModal';
import SettingsModal from './SettingsModal';
import ReportsDashboard from './ReportsDashboard';
import WatchdogPanel from './WatchdogPanel';
import OrchestrationPanel from './OrchestrationPanel';
import SystemDiagnosticsPanel from './SystemDiagnosticsPanel';
import { cn, ui } from './ui';
import { StatusBadge } from './status';

function groupThreadsByDate(threads) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today - 86400000);
  const week = new Date(today - 7 * 86400000);

  const groups = {
    今天: [],
    昨天: [],
    '过去 7 天': [],
    更早: [],
  };

  threads.forEach((thread) => {
    const date = new Date(thread.updated_at || thread.created_at || 0);
    if (date >= today) groups['今天'].push(thread);
    else if (date >= yesterday) groups['昨天'].push(thread);
    else if (date >= week) groups['过去 7 天'].push(thread);
    else groups['更早'].push(thread);
  });

  return groups;
}

function ThreadActionMenu({ threadId, onClose, onDelete }) {
  const menuRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  const actions = [
    { icon: <StarIcon size={14} />, label: '收藏', onClick: () => onClose() },
    { icon: <ShareIcon size={14} />, label: '分享', onClick: () => onClose() },
    { icon: <DownloadIcon size={14} />, label: '全景导出', onClick: () => onClose() },
    { divider: true },
    { icon: <TrashIcon size={14} />, label: '删除', danger: true, onClick: () => { onDelete(threadId); onClose(); } },
  ];

  return (
    <div
      ref={menuRef}
      className="absolute right-0 top-9 z-50 w-36 rounded-xl border border-white/90 bg-white py-1 shadow-xl"
    >
      {actions.map((action, index) => {
        if (action.divider) {
          return <div key={index} className="my-1 border-t border-slate-100" />;
        }

        return (
          <button
            key={index}
            className={`flex w-full items-center gap-2.5 px-3 py-2 text-xs transition-colors ${
              action.danger
                ? 'text-rose-600 hover:bg-rose-50'
                : 'text-slate-600 hover:bg-brand-50 hover:text-slate-950'
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

export default function Sidebar({
  currentThreadId,
  onSelectThread,
  onNewChat,
  refreshKey,
  onToggleDatabase,
  onOpenModelCenter = () => {},
  onOpenBrainstorm = () => {},
  compactMode = true,
  sidebarTitle = 'My SQL Agent',
  watchdogEnabled = true,
  onToggleWatchdog = () => {},
  mobileMode = false,
  onMobileClose = () => {},
}) {
  const [threads, setThreads] = useState([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState(null);
  const [activeMenu, setActiveMenu] = useState(null);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showReportsDashboard, setShowReportsDashboard] = useState(false);
  const [showWatchdogPanel, setShowWatchdogPanel] = useState(false);
  const [showOrchestrationPanel, setShowOrchestrationPanel] = useState(false);
  const [showDiagnosticsPanel, setShowDiagnosticsPanel] = useState(false);

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

  const handleDelete = (threadId) => {
    setConfirmTarget(threadId);
    setConfirmOpen(true);
  };

  const handleConfirm = async () => {
    if (confirmTarget === '__all__') {
      await clearAllHistory();
      onNewChat?.();
    } else {
      await deleteThread(confirmTarget);
    }
    setConfirmOpen(false);
    setConfirmTarget(null);
    loadThreads();
  };

  const getThreadTitle = (thread) => {
    const raw = String(thread?.title || '').trim();
    if (!raw) return '新对话';
    const maybeDecoded = (() => {
      try {
        return decodeURIComponent(raw);
      } catch {
        return raw;
      }
    })();
    const normalized = maybeDecoded.replace(/\s+/g, ' ').trim();
    const looksLikeId =
      /^t-\d{10,}-[a-z0-9]{4,}$/i.test(normalized) ||
      /^[a-f0-9-]{18,}$/i.test(normalized) ||
      normalized.length > 90;
    if (!looksLikeId) return normalized;
    return '未命名会话';
  };

  if (!mobileMode && isCollapsed) {
    return (
      <>
        <aside className="glass-panel relative z-10 m-3 mr-0 flex h-[calc(100%-1.5rem)] w-[66px] shrink-0 flex-col rounded-[24px] border border-white/80 text-sidebar-foreground shadow-[0_18px_44px_rgba(30,41,59,0.10)] transition-all duration-300">
          <div className="flex flex-col items-center gap-4 pb-2 pt-4">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-brand-100 bg-white text-zinc-950 shadow-sm transition-all hover:border-brand-200 hover:bg-brand-50"
              onClick={() => setIsCollapsed(false)}
              title="展开侧边栏"
            >
              <SparklesIcon size={16} className="text-brand-700" />
            </div>

            <button className="mt-3 rounded-xl p-2 text-sidebar-foreground transition hover:bg-sidebar-hover" onClick={onNewChat} title="新建聊天">
              <EditIcon size={16} />
            </button>
            <button className="rounded-xl p-2 text-sidebar-foreground transition hover:bg-sidebar-hover" title="搜索聊天" onClick={() => setShowSearchModal(true)}>
              <SearchIcon size={16} />
            </button>
            <button className="rounded-xl p-2 text-sidebar-foreground transition hover:bg-sidebar-hover" onClick={onToggleDatabase} title="数据连接参数">
              <DatabaseIcon size={16} />
            </button>
            <button className="rounded-xl p-2 text-sidebar-foreground transition hover:bg-sidebar-hover" title="模型中心" onClick={onOpenModelCenter}>
              <SparklesIcon size={16} />
            </button>
            <button className="rounded-xl p-2 text-sidebar-foreground transition hover:bg-sidebar-hover" title="群智镜议" onClick={onOpenBrainstorm}>
              <SparklesIcon size={16} />
            </button>
            <button className="rounded-xl p-2 text-sidebar-foreground transition hover:bg-sidebar-hover" title="系统诊断" onClick={() => setShowDiagnosticsPanel(true)}>
              <InfoIcon size={16} />
            </button>
          </div>

          <div className="mt-auto flex flex-col items-center gap-4 pb-4">
            <button className="rounded-xl p-2 text-sidebar-foreground transition hover:bg-sidebar-hover" title="系统设置" onClick={() => setShowSettingsModal(true)}>
              <SettingsIcon size={16} />
            </button>
          </div>
        </aside>

        <SearchModal isOpen={showSearchModal} onClose={() => setShowSearchModal(false)} threads={threads} onSelectThread={onSelectThread} />
        <SettingsModal isOpen={showSettingsModal} onClose={() => setShowSettingsModal(false)} initialTab="workspace" />
        <OrchestrationPanel isOpen={showOrchestrationPanel} onClose={() => setShowOrchestrationPanel(false)} />
        <SystemDiagnosticsPanel isOpen={showDiagnosticsPanel} onClose={() => setShowDiagnosticsPanel(false)} />
      </>
    );
  }

  return (
    <>
      {mobileMode && (
        <button
          className="absolute right-3 top-3 rounded-full border border-slate-200 bg-white p-2 text-slate-500 transition hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700"
          onClick={onMobileClose}
          title="关闭侧边栏"
        >
          <PanelLeftCloseIcon size={18} />
        </button>
      )}
      <aside className={`glass-panel group relative z-10 flex shrink-0 flex-col rounded-[26px] border border-white/80 text-sidebar-foreground shadow-[0_18px_52px_rgba(30,41,59,0.10)] transition-all duration-300 ${
        mobileMode ? 'h-full w-full max-w-[300px]' : compactMode ? 'm-2.5 mr-0 h-[calc(100%-1.25rem)] w-[248px]' : 'm-3 mr-0 h-[calc(100%-1.5rem)] w-[260px]'
      }`}>
        <div className={compactMode ? 'flex items-center justify-between px-3.5 pb-2.5 pt-3.5' : 'flex items-center justify-between px-4 pb-3 pt-4'}>
          <div className="flex cursor-pointer items-center gap-2 rounded-[16px] border border-white/80 bg-white/80 px-2.5 py-2 text-sidebar-foreground shadow-sm transition">
            <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-brand-700 shadow-sm">
              <SparklesIcon size={12} className="text-white" />
            </div>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Studio</div>
              <span className="text-xs font-bold tracking-wide text-slate-900">{sidebarTitle}</span>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              className="rounded-2xl p-2 text-slate-500 opacity-0 transition hover:bg-brand-50 hover:text-brand-700 group-hover:opacity-100"
              onClick={() => {
                if (mobileMode) {
                  onMobileClose?.();
                } else {
                  setIsCollapsed(true);
                }
              }}
              title="关闭侧边栏"
            >
              <PanelLeftCloseIcon size={18} />
            </button>
            <button className="rounded-xl p-1.5 text-slate-500 transition hover:bg-brand-50 hover:text-brand-700" onClick={onNewChat} title="新聊天">
              <EditIcon size={15} />
            </button>
          </div>
        </div>

        <div className={compactMode ? 'flex flex-col gap-0.5 px-3.5 py-1.5' : 'flex flex-col gap-1 px-4 py-2'}>
          <button className="flex w-full items-center gap-2 rounded-[14px] px-3 py-2 text-xs text-slate-700 transition hover:bg-brand-50" onClick={onOpenModelCenter}>
            <SparklesIcon size={14} />
            <span className="font-medium">模型中心</span>
          </button>
          <button className="flex w-full items-center gap-2 rounded-[14px] px-3 py-2 text-xs text-slate-700 transition hover:bg-brand-50" onClick={onOpenBrainstorm}>
            <SparklesIcon size={14} />
            <span className="font-semibold">群智镜议</span>
          </button>

          <button className="flex w-full items-center gap-2 rounded-[14px] px-3 py-2 text-xs text-slate-700 transition hover:bg-brand-50" onClick={onNewChat}>
            <EditIcon size={14} />
            <span className="font-medium">新聊天</span>
          </button>
          <button className="flex w-full items-center gap-2 rounded-[14px] px-3 py-2 text-xs text-slate-700 transition hover:bg-brand-50" onClick={() => setShowSearchModal(true)}>
            <SearchIcon size={14} />
            <span className="font-medium">搜索聊天</span>
          </button>
          <button className="flex w-full items-center gap-2 rounded-[14px] px-3 py-2 text-xs text-slate-700 transition hover:bg-brand-50" onClick={() => setShowReportsDashboard(true)}>
            <LayoutGridIcon size={14} />
            <span className="font-medium">全部报告</span>
          </button>
          <button className="flex w-full items-center gap-2 rounded-[14px] px-3 py-2 text-xs text-slate-700 transition hover:bg-brand-50" onClick={() => setShowOrchestrationPanel(true)}>
            <LayoutGridIcon size={14} />
            <span className="font-medium">任务编排</span>
          </button>
          <button className="flex w-full items-center gap-2 rounded-[14px] px-3 py-2 text-xs text-slate-700 transition hover:bg-brand-50" onClick={() => setShowDiagnosticsPanel(true)}>
            <InfoIcon size={14} />
            <span className="font-medium">系统诊断</span>
          </button>
        </div>

        <div className={compactMode ? 'flex flex-col gap-0.5 px-3.5 py-0.5' : 'flex flex-col gap-1 px-4 py-1'}>
          <button className="flex w-full items-center gap-2 rounded-[14px] px-3 py-2 text-xs text-slate-700 transition hover:bg-brand-50" onClick={onToggleDatabase}>
            <DatabaseIcon size={14} />
            <span className="font-medium">数据库管理</span>
          </button>

          <div
            className={cn(
              'flex w-full items-center gap-2 rounded-[14px] border px-2.5 py-2 text-xs font-semibold transition',
              watchdogEnabled
                ? 'border-amber-200 bg-gradient-to-r from-amber-50 to-white text-amber-700 hover:bg-amber-100'
                : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
            )}
          >
            <button
              className="flex flex-1 items-center gap-2 text-left"
              onClick={() => {
                if (watchdogEnabled) setShowWatchdogPanel(true);
              }}
            >
              <BellIcon size={14} className={watchdogEnabled ? 'text-amber-700' : 'text-slate-400'} />
              <span>数据值班室</span>
            </button>
            <button
              className={cn(
                'relative h-5 w-9 rounded-full border transition',
                watchdogEnabled ? 'border-amber-300 bg-amber-200' : 'border-slate-300 bg-slate-200'
              )}
              onClick={(event) => {
                event.stopPropagation();
                onToggleWatchdog();
              }}
              title="开关"
            >
              <span
                className={cn(
                  'absolute top-0.5 h-3.5 w-3.5 rounded-full bg-white shadow transition',
                  watchdogEnabled ? 'right-0.5' : 'left-0.5'
                )}
              />
            </button>
            <StatusBadge tone={watchdogEnabled ? 'success' : 'warning'}>
              {watchdogEnabled ? 'ON' : 'OFF'}
            </StatusBadge>
          </div>
        </div>

        <div className={compactMode ? 'px-5 py-2.5' : 'px-6 py-3'}>
          <div className="h-px w-full bg-slate-200/80" />
        </div>

        <nav className={compactMode ? 'sidebar-scroller flex-1 overflow-y-auto px-3.5 py-0.5' : 'sidebar-scroller flex-1 overflow-y-auto px-4 py-1'}>
          <div className="flex items-center justify-between px-3 pb-1 pt-2">
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">你的聊天</div>
            {threads.length > 0 && (
              <button
                className="rounded-full border border-transparent px-2.5 py-1 text-[11px] font-semibold text-slate-500 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
                onClick={() => {
                  setConfirmTarget('__all__');
                  setConfirmOpen(true);
                }}
                title="清空全部聊天记录"
              >
                全部删除
              </button>
            )}
          </div>

          {threads.length === 0 ? (
            <div className="rounded-[20px] border border-dashed border-slate-200 bg-white/50 px-4 py-4 text-xs text-slate-500">暂无历史记录</div>
          ) : (
            Object.entries(grouped).map(([label, items]) => {
              if (items.length === 0) return null;
              return (
                <div key={label} className="mt-3">
                  <div className="px-3 pb-1 text-[10px] font-semibold tracking-[0.18em] text-slate-400">{label}</div>
                  <div className="flex flex-col gap-1">
                    {items.map((thread) => (
                      <div
                        key={thread.thread_id}
                        className={`group/item relative flex cursor-pointer items-center rounded-[14px] border px-3 py-2 text-xs transition-all ${
                          currentThreadId === thread.thread_id
                            ? 'border-white bg-white text-slate-900 shadow-[0_12px_30px_rgba(30,41,59,0.08)]'
                            : 'border-transparent text-slate-600 hover:bg-brand-50 hover:text-slate-900'
                        }`}
                        onClick={() => onSelectThread(thread.thread_id)}
                      >
                        <span className="flex-1 truncate pr-7">{getThreadTitle(thread)}</span>
                        <button
                          className={cn(ui.iconButton, 'absolute right-2 rounded-xl p-1.5 text-slate-500 opacity-0 shadow-sm hover:bg-white hover:text-brand-700 group-hover/item:opacity-100')}
                          onClick={(event) => {
                            event.stopPropagation();
                            setActiveMenu(activeMenu === thread.thread_id ? null : thread.thread_id);
                          }}
                        >
                          <MoreIcon size={14} />
                        </button>
                        {activeMenu === thread.thread_id && (
                          <ThreadActionMenu threadId={thread.thread_id} onClose={() => setActiveMenu(null)} onDelete={handleDelete} />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </nav>

        <div className="mt-auto flex flex-col gap-1 border-t border-white/80 bg-white/20 px-4 py-4">
          <button className="flex w-full items-center gap-3 rounded-[20px] px-4 py-3 text-sm text-sidebar-foreground transition hover:bg-brand-50" onClick={() => setShowSettingsModal(true)}>
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
        onCancel={() => {
          setConfirmOpen(false);
          setConfirmTarget(null);
        }}
      />

      <SearchModal isOpen={showSearchModal} onClose={() => setShowSearchModal(false)} threads={threads} onSelectThread={onSelectThread} />
      <SettingsModal isOpen={showSettingsModal} onClose={() => setShowSettingsModal(false)} initialTab="workspace" />
      <ReportsDashboard isOpen={showReportsDashboard} onClose={() => setShowReportsDashboard(false)} threads={threads} onSelectThread={onSelectThread} />
      <WatchdogPanel isOpen={showWatchdogPanel} onClose={() => setShowWatchdogPanel(false)} />
      <OrchestrationPanel isOpen={showOrchestrationPanel} onClose={() => setShowOrchestrationPanel(false)} />
      <SystemDiagnosticsPanel isOpen={showDiagnosticsPanel} onClose={() => setShowDiagnosticsPanel(false)} />
    </>
  );
}
