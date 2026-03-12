'use client';

/**
 * useChat Hook — SSE 流式对话状态管理
 * 管理消息列表、工具步骤、图表、文件和流式状态
 */

import { useState, useCallback, useRef } from 'react';
import { streamChat, fetchMessages } from '@/lib/api';

// 生成唯一 ID
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

export function useChat(threadId) {
  const [messages, setMessages] = useState([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef(null);

  // 加载历史消息
  const loadHistory = useCallback(async (tid) => {
    try {
      const data = await fetchMessages(tid);
      if (data.messages && data.messages.length > 0) {
        setMessages(
          data.messages.map((m) => ({
            id: generateId(),
            role: m.role,
            content: m.content,
            toolSteps: [],
            charts: [],
            files: [],
          }))
        );
      } else {
        setMessages([]);
      }
    } catch {
      setMessages([]);
    }
  }, []);

  // 发送消息
  const sendMessage = useCallback(
    (content) => {
      if (!content.trim() || isStreaming) return;

      // 添加用户消息
      const userMsg = {
        id: generateId(),
        role: 'user',
        content,
        toolSteps: [],
        charts: [],
        files: [],
      };

      // 添加空的 AI 响应占位
      const assistantMsg = {
        id: generateId(),
        role: 'assistant',
        content: '',
        toolSteps: [],
        charts: [],
        files: [],
      };

      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setIsStreaming(true);

      const assistantId = assistantMsg.id;

      const updateAssistant = (updater) => {
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? updater(m) : m))
        );
      };

      const handle = streamChat(content, threadId, {
        onToken: (token) => {
          updateAssistant((m) => ({ ...m, content: m.content + token }));
        },

        onToolStart: (id, name) => {
          updateAssistant((m) => ({
            ...m,
            toolSteps: [
              ...m.toolSteps,
              { id, name, input: '', output: '', status: 'running' },
            ],
          }));
        },

        onToolInput: (id, args) => {
          updateAssistant((m) => ({
            ...m,
            toolSteps: m.toolSteps.map((t) =>
              t.id === id ? { ...t, input: t.input + args } : t
            ),
          }));
        },

        onToolEnd: (id, output) => {
          updateAssistant((m) => ({
            ...m,
            toolSteps: m.toolSteps.map((t) =>
              t.id === id ? { ...t, output, status: 'done' } : t
            ),
          }));
        },

        onChart: (id, chartJson) => {
          updateAssistant((m) => ({
            ...m,
            charts: [...m.charts, { id, json: chartJson }],
          }));
        },

        onFile: (filename, url, message) => {
          updateAssistant((m) => ({
            ...m,
            files: [...m.files, { filename, url, message }],
          }));
        },

        onDone: () => {
          setIsStreaming(false);
        },

        onError: (errMsg) => {
          updateAssistant((m) => ({
            ...m,
            content: m.content + `\n\n❌ **错误**: ${errMsg}`,
          }));
          setIsStreaming(false);
        },
      });

      abortRef.current = handle;
    },
    [threadId, isStreaming]
  );

  // 停止生成
  const stopStreaming = useCallback(() => {
    abortRef.current?.abort();
    setIsStreaming(false);
  }, []);

  // 清空消息
  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  return {
    messages,
    isStreaming,
    sendMessage,
    stopStreaming,
    loadHistory,
    clearMessages,
  };
}
