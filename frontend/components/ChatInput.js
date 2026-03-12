'use client';

/**
 * 聊天输入框组件
 */

import { useState, useRef, useCallback } from 'react';

export default function ChatInput({ onSend, isStreaming, onStop }) {
  const [input, setInput] = useState('');
  const textareaRef = useRef(null);

  // 自动调整高度
  const adjustHeight = useCallback(() => {
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = 'auto';
      ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
    }
  }, []);

  const handleSend = () => {
    if (!input.trim() || isStreaming) return;
    onSend(input.trim());
    setInput('');
    // 重置高度
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="chat-input-area">
      <div className="chat-input-inner">
        <div className="chat-input-wrapper">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              adjustHeight();
            }}
            onKeyDown={handleKeyDown}
            placeholder="输入你的数据分析需求..."
            rows={1}
            disabled={isStreaming}
          />
          {isStreaming ? (
            <button className="send-btn" onClick={onStop} title="停止生成">
              ⏹
            </button>
          ) : (
            <button
              className="send-btn"
              onClick={handleSend}
              disabled={!input.trim()}
              title="发送 (Enter)"
            >
              ▲
            </button>
          )}
        </div>
        <div className="chat-input-hint">
          按 Enter 发送，Shift + Enter 换行
        </div>
      </div>
    </div>
  );
}
