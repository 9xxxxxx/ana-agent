'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import Image from 'next/image';
import { SendIcon, StopIcon, CloseIcon, PlusIcon, PaperclipIcon, ImageIcon } from './Icons';
import { uploadFile, getUploadUrl } from '@/lib/api';
import { useToast } from './Toast';
import { cn, ui, ToolbarButton } from './ui';
import { InlineFeedback, StatusBadge } from './status';

export default function ChatInput({ onSend, isStreaming, onStop, compactMode = true }) {
  const { error, success } = useToast();
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState(null);
  const [showMenu, setShowMenu] = useState(false);
  const [acceptType, setAcceptType] = useState('*/*');
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const menuRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setShowMenu(false);
      }
    };
    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showMenu]);

  useEffect(() => {
    const element = textareaRef.current;
    if (element) {
      element.style.height = 'auto';
      element.style.height = `${Math.min(element.scrollHeight, compactMode ? 220 : 250)}px`;
    }
  }, [text, compactMode]);

  const handleFileSelect = useCallback(async (files) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    setUploadStatus(null);

    try {
      const uploaded = [];
      for (const file of Array.from(files)) {
        const result = await uploadFile(file);
        if (!result.success) {
          throw new Error(result.message || `上传 ${file.name} 失败`);
        }
        const isImage = file.type.startsWith('image/');
        uploaded.push({
          id: Date.now() + Math.random(),
          filename: result.filename,
          originalName: result.original_name,
          url: result.url,
          size: result.size,
          type: result.content_type,
          isImage,
          previewUrl: isImage ? getUploadUrl(result.filename) : null,
        });
      }

      setAttachments((previous) => [...previous, ...uploaded]);
      setUploadStatus({ tone: 'success', title: '附件已准备就绪', message: `已添加 ${uploaded.length} 个附件，可以直接发送。` });
      success(`已添加 ${uploaded.length} 个附件`);
    } catch (currentError) {
      const message = currentError.message || '文件上传失败';
      setUploadStatus({ tone: 'danger', title: '上传失败', message });
      error(message);
    } finally {
      setUploading(false);
    }
  }, [error, success]);

  const removeAttachment = useCallback((id) => {
    setAttachments((previous) => previous.filter((attachment) => attachment.id !== id));
  }, []);

  const handleDragOver = (event) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const handleDrop = (event) => {
    event.preventDefault();
    event.stopPropagation();
    handleFileSelect(event.dataTransfer.files);
  };

  const handleSend = useCallback(() => {
    if ((!text.trim() && attachments.length === 0) || isStreaming) return;

    let content = text.trim();
    if (attachments.length > 0) {
      const fileInfo = attachments.map((attachment) => `[附件: ${attachment.originalName}](${attachment.url})`).join('\n');
      content = content ? `${content}\n\n${fileInfo}` : fileInfo;
    }

    onSend(content);
    setText('');
    setAttachments([]);
    setUploadStatus(null);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [text, attachments, isStreaming, onSend]);

  const handleKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  };

  const formatSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-6" onDragOver={handleDragOver} onDrop={handleDrop}>
      {attachments.length > 0 && (
        <div className="mb-1.5 flex justify-end px-1 text-[10px] text-slate-500">
          <span className="shrink-0 rounded-full border border-brand-100 bg-brand-50 px-2 py-0.5 font-semibold text-brand-700">附件 {attachments.length}</span>
        </div>
      )}

      {uploadStatus && (
        <div className="mb-3">
          <InlineFeedback tone={uploadStatus.tone} title={uploadStatus.title} message={uploadStatus.message} />
        </div>
      )}

      {attachments.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {attachments.map((attachment) => (
            <div key={attachment.id} className={`relative flex max-w-[200px] items-center gap-2 rounded-xl border border-white/80 bg-white/85 ${attachment.isImage ? 'h-16 w-16 justify-center p-1' : 'p-2.5 shadow-sm'}`}>
              {attachment.isImage && attachment.previewUrl ? (
                <Image
                  src={attachment.previewUrl}
                  alt={attachment.originalName}
                  width={64}
                  height={64}
                  unoptimized
                  className="h-full w-full rounded-md object-cover"
                />
              ) : (
                <div className="flex items-center justify-center p-1 text-muted-foreground">
                  <PaperclipIcon size={18} />
                </div>
              )}
              {!attachment.isImage && (
                <div className="min-w-0 pr-4">
                  <div className="truncate text-[0.75rem] font-medium text-foreground">{attachment.originalName}</div>
                  <div className="text-[0.65rem] text-muted-foreground">{formatSize(attachment.size)}</div>
                </div>
              )}
              <button
                className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-zinc-200 bg-white text-muted-foreground shadow-sm transition-colors hover:border-rose-200 hover:bg-rose-50 hover:text-rose-500"
                onClick={() => removeAttachment(attachment.id)}
              >
                <CloseIcon size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className={cn(
        'glass-panel flex items-end gap-2 border border-white/80 px-2.5 shadow-[0_18px_50px_rgba(30,41,59,0.12)] transition-all hover:border-brand-100 focus-within:border-brand-200 focus-within:ring-4 focus-within:ring-brand-100/70',
        compactMode ? 'rounded-[20px] py-2' : 'rounded-[22px] py-2.5'
      )}>
        <div className="relative flex shrink-0 items-center pb-0.5" ref={menuRef}>
          <button
            className={cn(ui.iconButton, 'flex h-8 w-8 items-center justify-center')}
            onClick={() => setShowMenu(!showMenu)}
            disabled={isStreaming || uploading}
            title="添加附件"
          >
            <PlusIcon size={20} />
          </button>

          {showMenu && (
            <div className="absolute bottom-12 left-0 z-50 w-36 rounded-xl border border-white/90 bg-white py-1.5 shadow-xl">
              <button
                className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-foreground transition-colors hover:bg-brand-50"
                onClick={() => {
                  setAcceptType('*/*');
                  setTimeout(() => fileInputRef.current?.click(), 0);
                  setShowMenu(false);
                }}
              >
                <PaperclipIcon size={16} />
                <span>上传文件</span>
              </button>
              <button
                className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-foreground transition-colors hover:bg-brand-50"
                onClick={() => {
                  setAcceptType('image/*');
                  setTimeout(() => fileInputRef.current?.click(), 0);
                  setShowMenu(false);
                }}
              >
                <ImageIcon size={16} />
                <span>上传图片</span>
              </button>
            </div>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={acceptType}
          className="hidden"
          onChange={(event) => {
            handleFileSelect(event.target.files);
            if (event.target) event.target.value = '';
          }}
        />

        <textarea
          ref={textareaRef}
          aria-label="输入消息"
          className={cn(
            'flex-1 resize-none border-0 bg-transparent py-2 text-[0.95rem] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground',
            compactMode ? 'max-h-[220px] min-h-[44px]' : 'max-h-[250px] min-h-[56px]'
          )}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={uploading ? '正在上传附件...' : '给 SQL Agent 发消息...'}
          rows={compactMode ? 2 : 3}
          disabled={uploading}
        />

        <div className="flex shrink-0 items-center gap-2 pb-0.5 pr-1">
          {uploading && <StatusBadge tone="info">上传中</StatusBadge>}
          {isStreaming ? (
            <ToolbarButton
              variant="primary"
              className="flex h-8 w-8 items-center justify-center rounded-full p-0 shadow-sm"
              onClick={onStop}
              title="停止生成"
            >
              <StopIcon size={14} fill="currentColor" />
            </ToolbarButton>
          ) : (
            <ToolbarButton
              variant="primary"
              className="flex h-8 w-8 items-center justify-center rounded-full p-0 disabled:border-zinc-100 disabled:bg-zinc-100 disabled:text-zinc-400"
              onClick={handleSend}
              disabled={(!text.trim() && attachments.length === 0) || uploading}
              title="发送"
            >
              <SendIcon size={14} className={(!text.trim() && attachments.length === 0) || uploading ? 'opacity-50' : 'opacity-100'} />
            </ToolbarButton>
          )}
        </div>
      </div>
    </div>
  );
}
