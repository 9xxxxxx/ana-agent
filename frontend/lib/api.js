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
 * 获取上传文件的访问 URL
 */
export function getUploadUrl(filename) {
  return `${API_BASE}/api/uploads/${filename}`;
}

/**
 * 上传文件
 */
export async function uploadFile(file) {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(`${API_BASE}/api/upload`, {
    method: 'POST',
    body: formData,
  });
  return res.json();
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
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      function processChunk() {
        reader.read().then(({ done, value }) => {
          if (done) {
            // 处理缓冲区中剩余的数据
            if (buffer.trim()) {
              const lines = buffer.split('\n');
              let currentEvent = { type: '', data: '' };
              for (const line of lines) {
                const trimmed = line.trim();
                if (trimmed.startsWith('event:')) {
                  if (currentEvent.type && currentEvent.data) {
                    processSSEEvent(currentEvent.type, currentEvent.data);
                  }
                  currentEvent = { type: trimmed.slice(6).trim(), data: '' };
                } else if (trimmed.startsWith('data:')) {
                  currentEvent.data = trimmed.slice(5).trim();
                  if (currentEvent.type) {
                    processSSEEvent(currentEvent.type, currentEvent.data);
                    currentEvent = { type: '', data: '' };
                  }
                }
              }
            }
            onDone?.();
            return;
          }

          buffer += decoder.decode(value, { stream: true });

          // 按换行符分割所有行
          const lines = buffer.split('\n');
          
          // 找到最后一个不完整的行（没有 event: 或 data: 前缀的）
          let lastCompleteIndex = lines.length;
          for (let i = lines.length - 1; i >= 0; i--) {
            const line = lines[i].trim();
            if (line.startsWith('event:') || line.startsWith('data:')) {
              lastCompleteIndex = i + 1;
              break;
            }
          }
          
          // 提取完整的事件行
          const completeLines = lines.slice(0, lastCompleteIndex);
          // 保留不完整的行在缓冲区
          buffer = lines.slice(lastCompleteIndex).join('\n');

          // 解析事件
          let currentEvent = { type: '', data: '' };
          for (const line of completeLines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('event:')) {
              // 如果之前有事件，先处理
              if (currentEvent.type && currentEvent.data) {
                processSSEEvent(currentEvent.type, currentEvent.data);
              }
              currentEvent = { type: trimmed.slice(6).trim(), data: '' };
            } else if (trimmed.startsWith('data:')) {
              currentEvent.data = trimmed.slice(5).trim();
              // 处理当前事件
              if (currentEvent.type) {
                processSSEEvent(currentEvent.type, currentEvent.data);
                currentEvent = { type: '', data: '' };
              }
            }
          }

          processChunk();
        }).catch((err) => {
          console.error('[api] Error reading stream:', err);
          onError?.(err.message);
        });
      }

      function processSSEEvent(eventType, eventData) {
        if (!eventData) return;

        try {
          const data = JSON.parse(eventData.trim());

          switch (eventType) {
            case 'token':
              // 确保content是字符串类型
              const tokenContent = typeof data.content === 'string' ? data.content : String(data.content || '');
              onToken?.(tokenContent);
              break;
            case 'tool_start':
              onToolStart?.(data.id, data.name);
              break;
            case 'tool_input':
              onToolInput?.(data.id, data.args);
              break;
            case 'tool_end':
              // 检查是否是图表数据
              if (data.output && typeof data.output === 'string') {
                if (data.output.startsWith('[CHART_DATA]')) {
                  const chartJson = data.output.replace('[CHART_DATA]', '').trim();
                  onChart?.(data.id, chartJson);
                  break;
                }
                if (data.output.startsWith('[PLOTLY_CHART]')) {
                  // 兼容旧格式
                  const chartJson = data.output.replace('[PLOTLY_CHART]', '').trim();
                  onChart?.(data.id, chartJson);
                  break;
                }
              }
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
          console.warn('[api] SSE 解析失败:', eventData, e);
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

/**
 * 测试数据库连接
 */
export async function testDbConnection(url) {
  const res = await fetch(`${API_BASE}/api/db/test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  return res.json();
}

/**
 * 保存数据库配置
 */
export async function saveDbConfig(config) {
  const res = await fetch(`${API_BASE}/api/db/config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  return res.json();
}

/**
 * 获取已保存的数据库配置列表
 */
export async function getDbConfig() {
  const res = await fetch(`${API_BASE}/api/db/config`);
  return res.json();
}

/**
 * 设置当前会话的数据库连接
 */
export async function setDbConnection(url) {
  const res = await fetch(`${API_BASE}/api/db/connect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  return res.json();
}
