'use client';

/**
 * 聊天输入组件 — 纯 Tailwind 实现
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { SendIcon, StopIcon, CloseIcon, PlusIcon, PaperclipIcon, ImageIcon } from './Icons';
import { uploadFile, getUploadUrl } from '@/lib/api';

export default function ChatInput({ onSend, isStreaming, onStop }) {
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [acceptType, setAcceptType] = useState('*/*');
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const menuRef = useRef(null);

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
      {/* 附件预览区 */}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {attachments.map(att => (
            <div key={att.id} className={`relative flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg max-w-[200px] ${att.isImage ? 'p-1 h-16 w-16 justify-center' : 'p-2'}`}>
              {att.isImage && att.previewUrl ? (
                <img src={att.previewUrl} alt={att.originalName} className="w-full h-full object-cover rounded-md" />
              ) : (
                <div className="flex items-center justify-center text-gray-400 p-1">
                  <PaperclipIcon size={18} />
                </div>
              )}
              {!att.isImage && (
                <div className="flex flex-col min-w-0 pr-4">
                  <span className="text-[0.75rem] font-medium text-gray-700 truncate">{att.originalName}</span>
                  <span className="text-[0.65rem] text-gray-400">{formatSize(att.size)}</span>
                </div>
              )}
              <button 
                className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-white border border-gray-200 rounded-full flex items-center justify-center text-gray-400 hover:text-red-500 hover:border-red-200 hover:bg-red-50 transition-colors shadow-sm"
                onClick={() => removeAttachment(att.id)}
              >
                <CloseIcon size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 核心输入框容器：大圆角、淡色背景衬托 (仿 ChatGPT 极简风) */}
      <div className="flex items-end gap-2 bg-gray-50/80 hover:bg-white border border-gray-200 rounded-[28px] focus-within:bg-white focus-within:ring-2 focus-within:ring-gray-200 transition-all px-2.5 py-2.5 shadow-sm">
        
        {/* 工具按钮栏 */}
        <div className="flex items-center pb-0.5 shrink-0 relative" ref={menuRef}>
          <button
            className="flex items-center justify-center w-8 h-8 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-all"
            onClick={() => setShowMenu(!showMenu)}
            disabled={isStreaming || uploading}
            title="添加附件"
          >
            <PlusIcon size={20} />
          </button>
          
          {showMenu && (
            <div className="absolute bottom-12 left-0 bg-white border border-gray-100 shadow-xl rounded-xl py-1.5 w-32 animate-in fade-in zoom-in-95 duration-100 z-50">
              <button 
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                onClick={() => { setAcceptType('*/*'); setTimeout(() => fileInputRef.current?.click(), 0); setShowMenu(false); }}
              >
                <PaperclipIcon size={16} /> <span>上传文件</span>
              </button>
              <button 
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
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
          className="flex-1 max-h-[200px] min-h-[24px] bg-transparent border-0 outline-none resize-none py-1.5 text-[0.95rem] text-gray-900 placeholder:text-gray-400 leading-relaxed"
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
              className="flex items-center justify-center w-8 h-8 bg-black text-white rounded-full hover:bg-gray-800 transition-all shadow-sm" 
              onClick={onStop} 
              title="停止生成"
            >
              <StopIcon size={14} fill="currentColor" />
            </button>
          ) : (
            <button
              className="flex items-center justify-center w-8 h-8 rounded-full transition-all disabled:bg-gray-100 disabled:text-gray-300 bg-black text-white hover:bg-gray-800"
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
