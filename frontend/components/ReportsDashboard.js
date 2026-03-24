'use client';

import { useEffect } from 'react';
import { CloseIcon, LayoutGridIcon, BarChartIcon, MessageIcon } from './Icons';
import { cn, ui } from './ui';

function formatThreadDate(thread) {
  const timestamp = thread.updated_at || thread.created_at;
  if (!timestamp) {
    return '未知时间';
  }

  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return '未知时间';
  }

  return date.toLocaleDateString();
}

export default function ReportsDashboard({ isOpen, onClose, threads, onSelectThread }) {
  useEffect(() => {
    if (isOpen) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9990] flex flex-col bg-[linear-gradient(180deg,#f8fafc_0%,#f3f4f6_100%)] animate-in fade-in slide-in-from-bottom-8 duration-300">
      {/* 顶部 Header栏 */}
      <div className="z-10 flex h-16 shrink-0 items-center justify-between border-b border-zinc-200 bg-white px-6 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-inner">
            <LayoutGridIcon size={20} />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground leading-tight">全部报告大盘</h1>
            <p className="text-[11px] text-muted-foreground font-medium tracking-wide uppercase">All Generated Reports</p>
          </div>
        </div>
        <button 
          onClick={onClose}
          className={cn(ui.buttonSecondary, 'rounded-xl px-3 py-2')}
        >
          <span className="text-sm font-medium hidden sm:block">返回工作区</span>
          <CloseIcon size={20} />
        </button>
      </div>

      {/* 报告瀑布流/网格展示区 */}
      <div className="flex-1 overflow-y-auto p-6 md:p-10">
        <div className="max-w-7xl mx-auto">
          {threads.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-[50vh] text-muted-foreground">
              <BarChartIcon size={64} className="mb-6 opacity-20" />
              <h3 className="text-xl font-semibold text-foreground mb-2">暂无任何数据报告</h3>
              <p className="text-sm">在工作区发送您的第一个查询指令，即可在此处沉淀分析资产</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {threads.map((thread, i) => {
                // mock randomly assigns an icon to make it look rich
                const isChart = i % 3 === 0; 
                
                return (
                  <div 
                    key={thread.thread_id}
                    onClick={() => {
                      onSelectThread(thread.thread_id);
                      onClose();
                    }}
                    className="group relative flex h-48 cursor-pointer flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white p-5 transition-all hover:-translate-y-1 hover:shadow-xl"
                  >
                    {/* 装饰性背景光效 */}
                    <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-gradient-to-br from-emerald-500/5 to-emerald-500/10 opacity-0 blur-2xl transition-opacity group-hover:opacity-100"></div>
                    
                    <div className="flex items-start justify-between mb-4 relative z-10">
                      <div className={`rounded-xl p-2.5 transition-all group-hover:bg-white group-hover:shadow-sm ${isChart ? 'bg-emerald-50 text-emerald-700' : 'bg-zinc-100 text-muted-foreground'}`}>
                        {isChart ? <BarChartIcon size={20} /> : <MessageIcon size={20} />}
                      </div>
                      <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground transition-all group-hover:bg-white group-hover:shadow-sm">
                        {isChart ? '数据可视化' : '分析简报'}
                      </span>
                    </div>

                    <h3 className="relative z-10 line-clamp-2 flex-1 text-[15px] font-bold leading-snug text-foreground transition-colors group-hover:text-emerald-700">
                      {thread.title || '探索性数据 analysis'}
                    </h3>

                    <div className="mt-auto pt-4 border-t border-border flex items-center justify-between text-xs text-muted-foreground relative z-10">
                      <span>{formatThreadDate(thread)}</span>
                      <span className="flex items-center gap-1 font-medium group-hover:text-primary transition-colors">
                        查看详情 &rarr;
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
