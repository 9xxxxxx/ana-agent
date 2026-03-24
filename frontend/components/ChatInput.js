'use client';

/**
 * 聊天输入组件 — 纯 Tailwind 实现
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import Image from 'next/image';
import { SendIcon, StopIcon, CloseIcon, PlusIcon, PaperclipIcon, ImageIcon } from './Icons';
import { uploadFile, getUploadUrl } from '@/lib/api';
import { cn, ui } from './ui';

export default function ChatInput({ onSend, isStreaming, onStop, dbConnected, dbUrl }) {
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [acceptType, setAcceptType] = useState('*/*');
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const menuRef = useRef(null);

  // 格式化显示数据库 URL
  const displayDbUrl = dbUrl ? (dbUrl.length > 40 ? dbUrl.substring(0, 40) + '...' : dbUrl) : '';

  // 监听点击外部关闭菜单
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setShowMenu(false);
      }
    };
    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showMenu]);

  // 自动调整文本框高度
  useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = Math.min(el.scrollHeight, 200) + 'px';
    }
  }, [text]);

  const handleFileSelect = useCallback(async (files) => {
    if (!files || files.length === 0) return;
    setUploading(true);

    try {
      for (const file of Array.from(files)) {
        const result = await uploadFile(file);
        if (result.success) {
          const isImage = file.type.startsWith('image/');
          setAttachments(prev => [...prev, {
            id: Date.now() + Math.random(),
            filename: result.filename,
            originalName: result.original_name,
            url: result.url,
            size: result.size,
            type: result.content_type,
            isImage,
            previewUrl: isImage ? getUploadUrl(result.filename) : null,
          }]);
        }
      }
    } catch (err) {
      console.error('文件上传失败:', err);
    } finally {
      setUploading(false);
    }
  }, []);

  const removeAttachment = useCallback((id) => {
    setAttachments(prev => prev.filter(a => a.id !== id));
  }, []);

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    handleFileSelect(e.dataTransfer.files);
  };

  const handleSend = useCallback(() => {
    if ((!text.trim() && attachments.length === 0) || isStreaming) return;

    let content = text.trim();
    if (attachments.length > 0) {
      const fileInfo = attachments.map(a =>
        `[附件: ${a.originalName}](${a.url})`
      ).join('\n');
      content = content ? `${content}\n\n${fileInfo}` : fileInfo;
    }

    onSend(content);
    setText('');
    setAttachments([]);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [text, attachments, isStreaming, onSend]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const formatSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  return (
    <div className="w-full max-w-3xl mx-auto px-6" onDragOver={handleDragOver} onDrop={handleDrop}>
      {/* 数据库状态栏 */}
      <div className={cn(ui.buttonSecondary, 'mx-auto mb-2 w-fit rounded-full border-zinc-200 bg-white/90 px-4 py-1.5 shadow-sm animate-in fade-in slide-in-from-bottom-2 duration-300')}>
        <div className={`w-2 h-2 rounded-full ${dbConnected ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.6)]'}`} />
        <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
          {dbConnected ? `已连接数据源: ${displayDbUrl}` : '未连接数据库 (仅纯文本对话模式)'}
        </span>
      </div>

      {/* 附件预览区 */}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {attachments.map(att => (
            <div key={att.id} className={`relative flex max-w-[200px] items-center gap-2 rounded-xl border border-zinc-200 bg-white ${att.isImage ? 'h-16 w-16 justify-center p-1' : 'p-2.5 shadow-sm'}`}>
              {att.isImage && att.previewUrl ? (
                <Image
                  src={att.previewUrl}
                  alt={att.originalName}
                  width={64}
                  height={64}
                  unoptimized
                  className="w-full h-full object-cover rounded-md"
                />
              ) : (
                <div className="flex items-center justify-center text-muted-foreground p-1">
                  <PaperclipIcon size={18} />
                </div>
              )}
              {!att.isImage && (
                <div className="flex flex-col min-w-0 pr-4">
                  <span className="text-[0.75rem] font-medium text-foreground truncate">{att.originalName}</span>
                  <span className="text-[0.65rem] text-muted-foreground">{formatSize(att.size)}</span>
                </div>
              )}
              <button 
                className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-zinc-200 bg-white text-muted-foreground shadow-sm transition-colors hover:border-rose-200 hover:bg-rose-50 hover:text-rose-500"
                onClick={() => removeAttachment(att.id)}
              >
                <CloseIcon size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 核心输入框容器：大圆角、淡色背景衬托 (仿 ChatGPT 极简风) */}
      <div className="flex items-end gap-2 rounded-[28px] border border-zinc-200 bg-white px-2.5 py-2.5 shadow-[0_8px_30px_rgba(15,23,42,0.08)] transition-all hover:border-zinc-300 focus-within:border-emerald-300 focus-within:ring-4 focus-within:ring-emerald-100">
        
        {/* 工具按钮栏 */}
        <div className="flex items-center pb-0.5 shrink-0 relative" ref={menuRef}>
          <button
            className={cn(ui.iconButton, 'flex h-8 w-8 items-center justify-center')}
            onClick={() => setShowMenu(!showMenu)}
            disabled={isStreaming || uploading}
            title="添加附件"
          >
            <PlusIcon size={20} />
          </button>
          
          {showMenu && (
            <div className="absolute bottom-12 left-0 z-50 w-32 rounded-xl border border-zinc-200 bg-white py-1.5 shadow-xl animate-in fade-in zoom-in-95 duration-100">
              <button 
                className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-foreground transition-colors hover:bg-zinc-50"
                onClick={() => { setAcceptType('*/*'); setTimeout(() => fileInputRef.current?.click(), 0); setShowMenu(false); }}
              >
                <PaperclipIcon size={16} /> <span>上传文件</span>
              </button>
              <button 
                className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-foreground transition-colors hover:bg-zinc-50"
                onClick={() => { setAcceptType('image/*'); setTimeout(() => fileInputRef.current?.click(), 0); setShowMenu(false); }}
              >
                 <ImageIcon size={16} /> <span>上传图片</span>
              </button>
            </div>
          )}
        </div>

        {/* 隐藏输入框 */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={acceptType}
          className="hidden"
          onChange={(e) => {
            handleFileSelect(e.target.files);
            // 重置以便下次触发 onChange
            if(e.target) e.target.value = '';
          }}
        />

        {/* 核心输入区 */}
        <textarea
          ref={textareaRef}
          className="max-h-[200px] min-h-[24px] flex-1 resize-none border-0 bg-transparent py-1.5 text-[0.95rem] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={uploading ? '正在上传...' : '给 SQL Agent 发消息...'}
          rows={1}
          disabled={uploading}
        />

        {/* 发送与停止控制 */}
        <div className="pb-0.5 shrink-0 pr-1">
          {isStreaming ? (
            <button 
              className={cn(ui.buttonPrimary, 'flex h-8 w-8 items-center justify-center rounded-full p-0 shadow-sm')} 
              onClick={onStop} 
              title="停止生成"
            >
              <StopIcon size={14} fill="currentColor" />
            </button>
          ) : (
            <button
              className={cn(ui.buttonPrimary, 'flex h-8 w-8 items-center justify-center rounded-full p-0 disabled:border-zinc-100 disabled:bg-zinc-100 disabled:text-zinc-400')}
              onClick={handleSend}
              disabled={(!text.trim() && attachments.length === 0) || uploading}
              title="发送"
            >
              <SendIcon size={14} className={(!text.trim() && attachments.length === 0) || uploading ? "opacity-50" : "opacity-100"} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
