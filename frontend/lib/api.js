/**
 * API 请求封装层
 * 所有与后端 FastAPI 的通信逻辑
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

function parseSSEEvent(rawEvent) {
  const event = { type: 'message', data: '' };

  for (const line of rawEvent.split(/\r?\n/)) {
    if (!line || line.startsWith(':')) continue;
    if (line.startsWith('event:')) {
      event.type = line.slice(6).trim();
      continue;
    }
    if (line.startsWith('data:')) {
      const value = line.slice(5).trim();
      event.data = event.data ? `${event.data}\n${value}` : value;
    }
  }

  return event;
}

/**
 * 健康检查
 */
export async function checkHealth() {
  const res = await fetch(`${API_BASE}/api/health`);
  return res.json();
}

/**
 * 测试模型连接
 */
export async function testModelConnection(model, apiKey, baseUrl) {
  const res = await fetch(`${API_BASE}/api/models/test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, apiKey, baseUrl }),
  });
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
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  }
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
export function streamChat(message, threadId, model, systemPrompt, apiKey, baseUrl, databaseUrl, callbacks) {
  const { onToken, onReasoning, onToolStart, onToolInput, onToolEnd, onChart, onFile, onCodeOutput, onDone, onError } = callbacks;

  const controller = new AbortController();
  let completed = false;

  fetch(`${API_BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      message, 
      thread_id: threadId, 
      model, 
      system_prompt: systemPrompt,
      api_key: apiKey,
      base_url: baseUrl,
      database_url: databaseUrl
    }),
    signal: controller.signal,
  })
    .then((response) => {
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      function finishOnce() {
        if (!completed) {
          completed = true;
          onDone?.();
        }
      }

      function processChunk() {
        reader.read().then(({ done, value }) => {
          if (done) {
            if (buffer.trim()) {
              const lastEvent = parseSSEEvent(buffer);
              processSSEEvent(lastEvent.type, lastEvent.data);
            }
            finishOnce();
            return;
          }

          buffer += decoder.decode(value, { stream: true });

          const events = buffer.split(/\r?\n\r?\n/);
          buffer = events.pop() ?? '';

          for (const rawEvent of events) {
            const parsed = parseSSEEvent(rawEvent);
            processSSEEvent(parsed.type, parsed.data);
          }

          processChunk();
        }).catch((err) => {
          console.error('[api] Error reading stream:', err);
          if (err.name !== 'AbortError') {
            onError?.(err.message);
          }
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
            case 'reasoning':
              const reasoningContent = typeof data.content === 'string' ? data.content : String(data.content || '');
              onReasoning?.(reasoningContent);
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
            case 'code_output':
              onCodeOutput?.(data.id, data.stdout, data.images);
              break;
            case 'done':
              finishOnce();
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
 * 删除已保存的数据库配置
 */
export async function deleteDbConfig(id) {
  const res = await fetch(`${API_BASE}/api/db/config/${id}`, {
    method: 'DELETE',
  });
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
/**
 * 获取监控规则列表
 */
export async function fetchWatchdogRules() {
  const res = await fetch(`${API_BASE}/api/watchdog/rules`);
  return res.json();
}

/**
 * 新增监控规则
 */
export async function addWatchdogRule(rule) {
  const res = await fetch(`${API_BASE}/api/watchdog/rules`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(rule),
  });
  return res.json();
}

/**
 * 删除监控规则
 */
export async function deleteWatchdogRule(id) {
  const res = await fetch(`${API_BASE}/api/watchdog/rules/${id}`, {
    method: 'DELETE',
  });
  return res.json();
}

/**
 * 手动测试监控规则
 */
export async function testWatchdogRule(id) {
  const res = await fetch(`${API_BASE}/api/watchdog/rules/${id}/test`, {
    method: 'POST',
  });
  return res.json();
}

export async function runBrainstormAnalysis(payload) {
  const res = await fetch(`${API_BASE}/api/analysis/brainstorm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return res.json();
}
