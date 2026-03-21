'use client';

/**
 * useChat Hook — SSE 流式对话状态管理
 * 管理消息列表、工具步骤、图表、文件和流式状态
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { streamChat, fetchMessages } from '@/lib/api';

// 生成唯一 ID
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

export function useChat(threadId) {
  const [messages, setMessages] = useState([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef(null);
  const assistantIdRef = useRef(null);
  const pendingUpdateRef = useRef(null);
  const rafRef = useRef(null);

  // 当 threadId 改变时，重置状态
  useEffect(() => {
    console.log('[useChat] threadId changed:', threadId);
    setMessages([]);
    setIsStreaming(false);
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
  }, [threadId]);

  // 加载历史消息
  const loadHistory = useCallback(async (tid) => {
    console.log('[useChat] loadHistory called:', tid);
    try {
      const data = await fetchMessages(tid);
      if (data.messages && data.messages.length > 0) {
        const loadedMessages = data.messages.map((m) => ({
          id: generateId(),
          role: m.role,
          content: m.content,
          toolSteps: m.toolSteps || [],
          charts: m.charts || [],
          files: m.files || [],
        }));
        console.log('[useChat] Loaded messages:', loadedMessages.length);
        setMessages(loadedMessages);
      } else {
        console.log('[useChat] No messages found');
        setMessages([]);
      }
    } catch (err) {
      console.error('[useChat] Error loading history:', err);
      setMessages([]);
    }
  }, []);

  // 发送消息
  const sendMessage = useCallback(
    (content) => {
      // 提取文件附件，格式：[附件: xxx](url)
      const attachRegex = /\[附件:\s*(.+?)\]\((.+?)\)/g;
      const initialFiles = [];
      let match;
      while ((match = attachRegex.exec(content)) !== null) {
        initialFiles.push({ filename: match[1], url: match[2], message: '已上传附件' });
      }

      // 我们仍然将整个 content（包含文本和附件链接）发送给后端，
      // 因为这是后端的文本处理模式，但前端气泡渲染时会正确解析它。
      if (!content.trim() || isStreaming) return;

      // 添加用户消息
      const userMsg = {
        id: generateId(),
        role: 'user',
        content,
        toolSteps: [],
        charts: [],
        files: initialFiles,
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

      assistantIdRef.current = assistantMsg.id;

      const updateAssistant = (updater) => {
        const aid = assistantIdRef.current;
        
        // 直接更新，确保实时对话消息能够正确渲染
        setMessages((prev) => {
          const updated = prev.map((m) => (m.id === aid ? updater(m) : m));
          return updated;
        });
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
              { id, name, input: '', output: '', status: 'running', _rawInput: '' },
            ],
          }));
        },

        onToolInput: (id, args) => {
          updateAssistant((m) => ({
            ...m,
            toolSteps: m.toolSteps.map((t) => {
              if (t.id !== id) return t;
              // 确保args是字符串类型
              const argsStr = typeof args === 'string' ? args : JSON.stringify(args || '');
              // 累积原始JSON片段
              const newInput = t._rawInput + argsStr;
              // 尝试解析为格式化的JSON
              let displayInput = t.input;
              try {
                // 尝试解析完整的JSON
                const parsed = JSON.parse(newInput);
                displayInput = JSON.stringify(parsed, null, 2);
              } catch {
                // 如果解析失败，显示原始累积的片段（截断显示）
                displayInput = newInput.length > 200
                  ? newInput.slice(0, 200) + '...'
                  : newInput;
              }
              return { ...t, input: displayInput, _rawInput: newInput };
            }),
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
    [threadId]
  );

  // 停止生成
  const stopStreaming = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
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
