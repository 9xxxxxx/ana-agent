'use client';

/**
 * 聊天输入组件 — 纯 Tailwind 实现
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { SendIcon, StopIcon, CloseIcon, PaperclipIcon, ImageIcon } from './Icons';
import { uploadFile, getUploadUrl } from '@/lib/api';

export default function ChatInput({ onSend, isStreaming, onStop }) {
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const imageInputRef = useRef(null);

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

      {/* 核心输入框容器 */}
      <div className="flex items-end gap-2 bg-white border border-gray-200 rounded-2xl shadow-sm focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/20 transition-all p-2 pl-3">
        
        {/* 工具按钮栏 */}
        <div className="flex items-center gap-1 pb-1 shrink-0">
          <button
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg overflow-hidden transition-colors"
            onClick={() => fileInputRef.current?.click()}
            disabled={isStreaming || uploading}
            title="上传文件"
          >
            <PaperclipIcon size={18} />
          </button>
          <button
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg overflow-hidden transition-colors"
            onClick={() => imageInputRef.current?.click()}
            disabled={isStreaming || uploading}
            title="上传图片"
          >
            <ImageIcon size={18} />
          </button>
        </div>

        {/* 隐藏输入框 */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => handleFileSelect(e.target.files)}
        />
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => handleFileSelect(e.target.files)}
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
        <div className="pb-0.5 shrink-0 pl-1">
          {isStreaming ? (
            <button 
              className="flex items-center justify-center w-8 h-8 bg-red-500 text-white rounded-full hover:bg-red-600 hover:scale-105 transition-all shadow-sm animate-pulse" 
              onClick={onStop} 
              title="停止生成"
            >
              <StopIcon size={14} fill="currentColor" />
            </button>
          ) : (
            <button
              className="flex items-center justify-center w-8 h-8 rounded-full transition-all shadow-sm disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed disabled:shadow-none bg-brand-600 text-white hover:bg-brand-700 hover:scale-105"
              onClick={handleSend}
              disabled={(!text.trim() && attachments.length === 0) || uploading}
              title="发送"
            >
              <SendIcon size={14} className={(!text.trim() && attachments.length === 0) || uploading ? "opacity-50" : "opacity-100"} />
            </button>
          )}
        </div>
      </div>

      <div className="text-center text-[0.7rem] text-gray-400 mt-2">
        按 Enter 发送，Shift+Enter 换行，支持拖拽上传文件
      </div>
    </div>
  );
}
