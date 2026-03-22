'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { SearchIcon, CloseIcon, MessageIcon } from './Icons';

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
      (t.id && t.id.toLowerCase().includes(lowerQuery))
    );
  }, [query, threads]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-start justify-center pt-[10vh] px-4 bg-gray-900/40 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="fixed inset-0"
        onClick={onClose}
      />
      <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden flex flex-col max-h-[80vh] animate-in zoom-in-95 slide-in-from-top-4 duration-300">
        
        {/* Search Input Area */}
        <div className="flex items-center px-4 py-3 border-b border-gray-100 bg-white">
          <SearchIcon size={20} className="text-gray-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            className="flex-1 w-full bg-transparent border-none outline-none focus:ring-0 px-3 py-2 text-base text-gray-900 placeholder:text-gray-400"
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
              className="p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors mr-2"
            >
              <CloseIcon size={16} />
            </button>
          )}
          <button 
            onClick={onClose}
            className="px-2.5 py-1.5 text-xs font-medium text-gray-500 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors shrink-0"
          >
            ESC
          </button>
        </div>

        {/* Results Area */}
        <div className="flex-1 overflow-y-auto w-full">
          {!query.trim() ? (
            <div className="py-12 flex flex-col items-center justify-center text-gray-400">
              <SearchIcon size={48} className="text-gray-200 mb-4 opacity-50" />
              <p className="text-sm">输入关键词检索所有的历史分析与对话</p>
            </div>
          ) : filteredThreads.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center text-gray-500">
              <p className="text-sm">未找到与 "{query}" 匹配的结果</p>
            </div>
          ) : (
            <div className="p-2 space-y-1">
              <div className="px-3 py-1 text-xs font-semibold text-gray-400 tracking-wider">
                搜索结果 ({filteredThreads.length})
              </div>
              {filteredThreads.map(thread => (
                <button
                  key={thread.thread_id}
                  onClick={() => {
                    onSelectThread(thread.thread_id);
                    onClose();
                  }}
                  className="w-full text-left flex items-start gap-4 px-3 py-3 rounded-xl hover:bg-gray-100 transition group"
                >
                  <div className="shrink-0 mt-0.5 w-8 h-8 rounded-lg bg-gray-100 text-gray-500 flex items-center justify-center group-hover:bg-white transition-colors">
                    <MessageIcon size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-medium text-gray-900 truncate">
                      {thread.title || '新对话'}
                    </h4>
                    <p className="text-xs text-gray-400 mt-1 truncate">
                      {new Date(thread.updated_at || thread.created_at || Date.now()).toLocaleString()}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
        
        {/* Footer hints */}
        <div className="px-4 py-2 border-t border-gray-100 bg-gray-50/50 flex items-center gap-4 text-xs text-gray-500">
          <span className="flex items-center gap-1"><kbd className="px-1.5 py-0.5 bg-white border border-gray-200 rounded text-gray-600 font-sans shadow-sm">↑</kbd><kbd className="px-1.5 py-0.5 bg-white border border-gray-200 rounded text-gray-600 font-sans shadow-sm">↓</kbd> 切换</span>
          <span className="flex items-center gap-1"><kbd className="px-1.5 py-0.5 bg-white border border-gray-200 rounded text-gray-600 font-sans shadow-sm">Enter</kbd> 确认</span>
        </div>
      </div>
    </div>
  );
}
