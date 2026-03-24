'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { SearchIcon, CloseIcon, MessageIcon } from './Icons';

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
    <div className="fixed inset-0 z-[9999] flex items-start justify-center pt-[10vh] px-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="fixed inset-0"
        onClick={onClose}
      />
      <div className="relative w-full max-w-2xl bg-popover rounded-2xl shadow-2xl border border-border overflow-hidden flex flex-col max-h-[80vh] animate-in zoom-in-95 slide-in-from-top-4 duration-300">
        
        {/* Search Input Area */}
        <div className="flex items-center px-4 py-3 border-b border-border bg-popover">
          <SearchIcon size={20} className="text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            type="text"
            className="flex-1 w-full bg-transparent border-none outline-none focus:ring-0 px-3 py-2 text-base text-foreground placeholder:text-muted-foreground"
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
              className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors mr-2"
            >
              <CloseIcon size={16} />
            </button>
          )}
          <button 
            onClick={onClose}
            className="px-2.5 py-1.5 text-xs font-medium text-muted-foreground bg-muted hover:bg-muted/80 rounded-lg transition-colors shrink-0"
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
                  className="w-full text-left flex items-start gap-4 px-3 py-3 rounded-xl hover:bg-muted transition group"
                >
                  <div className="shrink-0 mt-0.5 w-8 h-8 rounded-lg bg-muted text-muted-foreground flex items-center justify-center group-hover:bg-popover transition-colors">
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
        <div className="px-4 py-2 border-t border-border bg-muted/30 flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><kbd className="px-1.5 py-0.5 bg-muted border border-border rounded text-muted-foreground font-sans shadow-sm">↑</kbd><kbd className="px-1.5 py-0.5 bg-muted border border-border rounded text-muted-foreground font-sans shadow-sm">↓</kbd> 切换</span>
          <span className="flex items-center gap-1"><kbd className="px-1.5 py-0.5 bg-muted border border-border rounded text-muted-foreground font-sans shadow-sm">Enter</kbd> 确认</span>
        </div>
      </div>
    </div>
  );
}
