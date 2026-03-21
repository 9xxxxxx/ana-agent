'use client';

/**
 * 聊天输入组件 — 支持文件/图片上传
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { SendIcon, StopIcon, CloseIcon } from './Icons';
import { uploadFile, getUploadUrl } from '@/lib/api';

// 附件图标
function PaperclipIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  );
}

// 图片图标
function ImageIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </svg>
  );
}

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

  // 处理文件上传
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

  // 删除附件
  const removeAttachment = useCallback((id) => {
    setAttachments(prev => prev.filter(a => a.id !== id));
  }, []);

  // 拖拽上传
  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    handleFileSelect(e.dataTransfer.files);
  };

  // 发送消息
  const handleSend = useCallback(() => {
    if ((!text.trim() && attachments.length === 0) || isStreaming) return;

    // 构建消息内容
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

  // 格式化文件大小
  const formatSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  return (
    <div className="chat-input-wrapper" onDragOver={handleDragOver} onDrop={handleDrop}>
      {/* 附件预览区 */}
      {attachments.length > 0 && (
        <div className="attachments-preview">
          {attachments.map(att => (
            <div key={att.id} className={`attachment-item ${att.isImage ? 'image' : 'file'}`}>
              {att.isImage && att.previewUrl ? (
                <img src={att.previewUrl} alt={att.originalName} className="attachment-thumb" />
              ) : (
                <div className="attachment-file-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                </div>
              )}
              <div className="attachment-info">
                <span className="attachment-name">{att.originalName}</span>
                <span className="attachment-size">{formatSize(att.size)}</span>
              </div>
              <button className="attachment-remove" onClick={() => removeAttachment(att.id)}>
                <CloseIcon size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="chat-input-container">
        {/* 附件按钮 */}
        <button
          className="input-tool-btn"
          onClick={() => fileInputRef.current?.click()}
          disabled={isStreaming || uploading}
          title="上传文件"
        >
          <PaperclipIcon size={18} />
        </button>

        {/* 图片按钮 */}
        <button
          className="input-tool-btn"
          onClick={() => imageInputRef.current?.click()}
          disabled={isStreaming || uploading}
          title="上传图片"
        >
          <ImageIcon size={18} />
        </button>

        {/* 隐藏的文件输入 */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          style={{ display: 'none' }}
          onChange={(e) => handleFileSelect(e.target.files)}
        />
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          multiple
          style={{ display: 'none' }}
          onChange={(e) => handleFileSelect(e.target.files)}
        />

        {/* 文本输入 */}
        <textarea
          ref={textareaRef}
          className="chat-input-textarea"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={uploading ? '正在上传...' : '给 SQL Agent 发消息...'}
          rows={1}
          disabled={isStreaming || uploading}
        />

        {/* 发送/停止按钮 */}
        {isStreaming ? (
          <button className="chat-action-btn stop-btn" onClick={onStop} title="停止生成">
            <StopIcon size={18} />
          </button>
        ) : (
          <button
            className="chat-action-btn send-btn"
            onClick={handleSend}
            disabled={(!text.trim() && attachments.length === 0) || uploading}
            title="发送"
          >
            <SendIcon size={18} />
          </button>
        )}
      </div>

      <div className="chat-input-hint">
        按 Enter 发送，Shift+Enter 换行，支持拖拽上传文件
      </div>
    </div>
  );
}
