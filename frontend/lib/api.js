/**
 * API 请求封装层
 * 所有与后端 FastAPI 的通信逻辑
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

/**
 * 健康检查
 */
export async function checkHealth() {
  const res = await fetch(`${API_BASE}/api/health`);
  return res.json();
}

/**
 * 获取对话列表
 */
export async function fetchThreads() {
  const res = await fetch(`${API_BASE}/api/history`);
  return res.json();
}

/**
 * 获取指定对话的消息历史
 */
export async function fetchMessages(threadId) {
  const res = await fetch(`${API_BASE}/api/history/${threadId}`);
  return res.json();
}

/**
 * 删除指定对话
 */
export async function deleteThread(threadId) {
  const res = await fetch(`${API_BASE}/api/history/${threadId}`, { method: 'DELETE' });
  return res.json();
}

/**
 * 清空所有历史
 */
export async function clearAllHistory() {
  const res = await fetch(`${API_BASE}/api/history`, { method: 'DELETE' });
  return res.json();
}

/**
 * 获取文件下载 URL
 */
export function getFileUrl(filename) {
  return `${API_BASE}/api/files/${filename}`;
}

/**
 * SSE 流式对话
 * 返回一个 EventSource 包装对象
 */
export function streamChat(message, threadId, callbacks) {
  const { onToken, onToolStart, onToolInput, onToolEnd, onChart, onFile, onDone, onError } = callbacks;

  const controller = new AbortController();

  fetch(`${API_BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, thread_id: threadId }),
    signal: controller.signal,
  })
    .then((response) => {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      function processChunk() {
        reader.read().then(({ done, value }) => {
          if (done) {
            // 处理缓冲区中剩余的数据
            if (buffer.trim()) {
              processSSEBuffer(buffer);
            }
            onDone?.();
            return;
          }

          buffer += decoder.decode(value, { stream: true });

          // 按双换行分割 SSE 事件
          const events = buffer.split('\n\n');
          // 最后一个可能不完整，保留在缓冲区
          buffer = events.pop() || '';

          for (const eventStr of events) {
            processSSEEvent(eventStr);
          }

          processChunk();
        });
      }

      function processSSEBuffer(buf) {
        const events = buf.split('\n\n');
        for (const eventStr of events) {
          if (eventStr.trim()) processSSEEvent(eventStr);
        }
      }

      function processSSEEvent(eventStr) {
        let eventType = 'message';
        let eventData = '';

        for (const line of eventStr.split('\n')) {
          if (line.startsWith('event:')) {
            eventType = line.slice(6).trim();
          } else if (line.startsWith('data:')) {
            eventData += line.slice(5).trim();
          }
        }

        if (!eventData) return;

        try {
          const data = JSON.parse(eventData);

          switch (eventType) {
            case 'token':
              onToken?.(data.content);
              break;
            case 'tool_start':
              onToolStart?.(data.id, data.name);
              break;
            case 'tool_input':
              onToolInput?.(data.id, data.args);
              break;
            case 'tool_end':
              onToolEnd?.(data.id, data.output);
              break;
            case 'chart':
              onChart?.(data.id, data.json);
              break;
            case 'file':
              onFile?.(data.filename, data.url, data.message);
              break;
            case 'done':
              onDone?.();
              break;
            case 'error':
              onError?.(data.message);
              break;
          }
        } catch (e) {
          console.warn('SSE 解析失败:', eventData, e);
        }
      }

      processChunk();
    })
    .catch((err) => {
      if (err.name !== 'AbortError') {
        onError?.(err.message);
      }
    });

  return { abort: () => controller.abort() };
}
