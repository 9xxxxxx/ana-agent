'use client';

import { useState, useEffect, useMemo } from 'react';
import { CloseIcon, LayoutGridIcon, BarChartIcon, MessageIcon } from './Icons';

export default function ReportsDashboard({ isOpen, onClose, threads, onSelectThread }) {
  useEffect(() => {
    if (isOpen) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9990] bg-gray-50 flex flex-col animate-in fade-in slide-in-from-bottom-8 duration-300">
      {/* 顶部 Header栏 */}
      <div className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6 shrink-0 shadow-sm z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center text-white shadow-inner">
            <LayoutGridIcon size={20} />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900 leading-tight">全部报告大盘</h1>
            <p className="text-[11px] text-gray-500 font-medium tracking-wide uppercase">All Generated Reports</p>
          </div>
        </div>
        <button 
          onClick={onClose}
          className="p-2 text-gray-400 hover:text-gray-800 hover:bg-gray-100 rounded-xl transition flex items-center gap-2"
        >
          <span className="text-sm font-medium hidden sm:block">返回工作区</span>
          <CloseIcon size={20} />
        </button>
      </div>

      {/* 报告瀑布流/网格展示区 */}
      <div className="flex-1 overflow-y-auto p-6 md:p-10">
        <div className="max-w-7xl mx-auto">
          {threads.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-[50vh] text-gray-400">
              <BarChartIcon size={64} className="mb-6 opacity-20" />
              <h3 className="text-xl font-semibold text-gray-700 mb-2">暂无任何数据报告</h3>
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
                    className="group bg-white border border-gray-200/80 rounded-2xl p-5 hover:shadow-xl hover:-translate-y-1 transition-all cursor-pointer flex flex-col h-48 relative overflow-hidden"
                  >
                    {/* 装饰性背景光效 */}
                    <div className="absolute top-0 right-0 -mt-4 -mr-4 w-24 h-24 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-full blur-2xl opacity-0 group-hover:opacity-100 transition-opacity"></div>
                    
                    <div className="flex items-start justify-between mb-4 relative z-10">
                      <div className={`p-2.5 rounded-xl ${isChart ? 'bg-indigo-50 text-indigo-600' : 'bg-gray-50 text-gray-600'} group-hover:bg-white group-hover:shadow-sm transition-all`}>
                        {isChart ? <BarChartIcon size={20} /> : <MessageIcon size={20} />}
                      </div>
                      <span className="text-[10px] font-semibold tracking-wider text-gray-400 uppercase bg-gray-50 px-2.5 py-1 rounded-full group-hover:bg-white group-hover:shadow-sm transition-all">
                        {isChart ? '数据可视化' : '分析简报'}
                      </span>
                    </div>

                    <h3 className="text-[15px] font-bold text-gray-900 line-clamp-2 leading-snug relative z-10 flex-1 group-hover:text-blue-600 transition-colors">
                      {thread.title || '探索性数据分析'}
                    </h3>

                    <div className="mt-auto pt-4 border-t border-gray-100 flex items-center justify-between text-xs text-gray-400 relative z-10">
                      <span>{new Date(thread.updated_at || thread.created_at || Date.now()).toLocaleDateString()}</span>
                      <span className="flex items-center gap-1 font-medium group-hover:text-blue-500 transition-colors">
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
