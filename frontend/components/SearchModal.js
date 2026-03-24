'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { SearchIcon, CloseIcon, MessageIcon } from './Icons';
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

  return date.toLocaleString();
}

export default function SearchModal({ isOpen, onClose, threads, onSelectThread }) {
  const [query, setQuery] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      // Auto focus input when opened
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      document.body.style.overflow = '';
      setQuery('');
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  const filteredThreads = useMemo(() => {
    if (!query.trim()) return [];
    const lowerQuery = query.toLowerCase();
    return threads.filter(t => 
      (t.title && t.title.toLowerCase().includes(lowerQuery)) ||
      (t.thread_id && t.thread_id.toLowerCase().includes(lowerQuery))
    );
  }, [query, threads]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-start justify-center bg-black/45 px-4 pt-[10vh] backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="fixed inset-0"
        onClick={onClose}
      />
      <div className="relative flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-[28px] border border-zinc-200 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.2)] animate-in zoom-in-95 slide-in-from-top-4 duration-300">
        
        {/* Search Input Area */}
        <div className="flex items-center border-b border-zinc-200 bg-white px-4 py-3">
          <SearchIcon size={20} className="text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            type="text"
            className="w-full flex-1 border-none bg-transparent px-3 py-2 text-base text-foreground outline-none focus:ring-0 placeholder:text-muted-foreground"
            placeholder="搜索您的历史对话..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose();
            }}
          />
          {query && (
            <button 
              onClick={() => { setQuery(''); inputRef.current?.focus(); }}
              className={cn(ui.iconButton, 'mr-2 rounded-md p-1')}
            >
              <CloseIcon size={16} />
            </button>
          )}
          <button 
            onClick={onClose}
            className="shrink-0 rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-zinc-100"
          >
            ESC
          </button>
        </div>

        {/* Results Area */}
        <div className="flex-1 overflow-y-auto w-full">
          {!query.trim() ? (
            <div className="py-12 flex flex-col items-center justify-center text-muted-foreground">
              <SearchIcon size={48} className="text-muted-foreground/20 mb-4" />
              <p className="text-sm">输入关键词检索所有的历史分析与对话</p>
            </div>
          ) : filteredThreads.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center text-muted-foreground">
              <p className="text-sm">未找到与 &quot;{query}&quot; 匹配的结果</p>
            </div>
          ) : (
            <div className="p-2 space-y-1">
              <div className="px-3 py-1 text-xs font-semibold text-muted-foreground tracking-wider">
                搜索结果 ({filteredThreads.length})
              </div>
              {filteredThreads.map(thread => (
                <button
                  key={thread.thread_id}
                  onClick={() => {
                    onSelectThread(thread.thread_id);
                    onClose();
                  }}
                  className="group flex w-full items-start gap-4 rounded-xl px-3 py-3 text-left transition hover:bg-zinc-50"
                >
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-muted-foreground transition-colors group-hover:bg-white">
                    <MessageIcon size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-medium text-foreground truncate">
                      {thread.title || '新对话'}
                    </h4>
                    <p className="text-xs text-muted-foreground mt-1 truncate">
                      {formatThreadDate(thread)}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
        
        {/* Footer hints */}
        <div className="flex items-center gap-4 border-t border-zinc-200 bg-zinc-50 px-4 py-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><kbd className="rounded border border-zinc-200 bg-white px-1.5 py-0.5 font-sans text-muted-foreground shadow-sm">↑</kbd><kbd className="rounded border border-zinc-200 bg-white px-1.5 py-0.5 font-sans text-muted-foreground shadow-sm">↓</kbd> 切换</span>
          <span className="flex items-center gap-1"><kbd className="rounded border border-zinc-200 bg-white px-1.5 py-0.5 font-sans text-muted-foreground shadow-sm">Enter</kbd> 确认</span>
        </div>
      </div>
    </div>
  );
}
