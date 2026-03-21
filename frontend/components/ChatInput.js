'use client';

/**
 * 聊天输入组件
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { SendIcon, StopIcon } from './Icons';

export default function ChatInput({ onSend, isStreaming, onStop }) {
  const [text, setText] = useState('');
  const textareaRef = useRef(null);

  // 自动调整文本框高度
  useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = Math.min(el.scrollHeight, 200) + 'px';
    }
  }, [text]);

  const handleSend = useCallback(() => {
    if (!text.trim() || isStreaming) return;
    onSend(text.trim());
    setText('');
    // 重置高度
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [text, isStreaming, onSend]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="chat-input-wrapper">
      <div className="chat-input-container">
        <textarea
          ref={textareaRef}
          className="chat-input-textarea"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="输入你的问题... (Shift+Enter 换行)"
          rows={1}
          disabled={isStreaming}
        />
        {isStreaming ? (
          <button
            className="chat-action-btn stop-btn"
            onClick={onStop}
            title="停止生成"
          >
            <StopIcon size={18} />
          </button>
        ) : (
          <button
            className="chat-action-btn send-btn"
            onClick={handleSend}
            disabled={!text.trim()}
            title="发送"
          >
            <SendIcon size={18} />
          </button>
        )}
      </div>
      <div className="chat-input-hint">
        按 Enter 发送，Shift+Enter 换行
      </div>
    </div>
  );
}
