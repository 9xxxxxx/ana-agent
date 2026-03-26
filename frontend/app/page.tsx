'use client';

import { useState, useEffect, useCallback } from 'react';
import Sidebar from '@/components/Sidebar';
import ChatMessages from '@/components/ChatMessages';
import ChatInput from '@/components/ChatInput';
import DbConnectionPanel from '@/components/DbConnectionPanel';
import FullReportModal from '@/components/FullReportModal';
import BrainstormModal from '@/components/BrainstormModal';
import ModelCenterModal from '@/components/ModelCenterModal';
import ReportViewer from '@/components/report/ReportViewer';
import {
  TrashIcon,
  ShareIcon,
  DatabaseIcon,
  LayoutGridIcon,
  SparklesIcon,
  PanelLeftOpenIcon,
} from '@/components/Icons';
import { useChat } from '@/hooks/useChat';
import { checkHealth, setDbConnection, deleteThread, fetchThreads, fetchSystemStatus } from '@/lib/api';

function newThreadId() {
  return `t-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

type ChatMessage = {
  id: string;
  role: string;
  content: string;
  charts?: Array<{ id: string; json: unknown }>;
  toolSteps?: unknown[];
  files?: unknown[];
};

type ThreadSummary = {
  thread_id: string;
  title?: string;
  created_at?: string;
  updated_at?: string;
};

function formatRelativeTime(iso?: string) {
  if (!iso) return '--';
  const timestamp = new Date(iso).getTime();
  if (Number.isNaN(timestamp)) return '--';

  const diffMs = Date.now() - timestamp;
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function parseDbConnection(url: string) {
  if (!url) {
    return {
      connectedLabel: '未连接',
      compact: '未连接',
      detail: '未配置数据库连接',
    };
  }
  try {
    const parsed = new URL(url);
    const protocol = parsed.protocol.replace(':', '').toUpperCase();
    const username = parsed.username || 'unknown';
    const host = parsed.hostname || 'localhost';
    const port = parsed.port || '-';
    const dbName = parsed.pathname.replace('/', '') || 'default';
    return {
      connectedLabel: '已连接',
      compact: `${protocol} · ${username} · ${dbName}`,
      detail: `${protocol} · ${username}@${host}:${port}/${dbName}`,
    };
  } catch {
    const safe = url.split('@').pop() || url;
    return {
      connectedLabel: '已连接',
      compact: safe.slice(0, 60),
      detail: safe,
    };
  }
}

const DEFAULT_MODEL_PROFILES = [
  { id: 'deepseek-chat', provider: 'deepseek', model: 'deepseek-chat', baseUrl: 'https://api.deepseek.com/v1', apiKey: '', modelParams: { temperature: 0.2, top_p: 1, max_tokens: 1200, presence_penalty: 0, frequency_penalty: 0 } },
  { id: 'deepseek-reasoner', provider: 'deepseek', model: 'deepseek-reasoner', baseUrl: 'https://api.deepseek.com/v1', apiKey: '', modelParams: { temperature: 0.1, top_p: 0.95, max_tokens: 1800, presence_penalty: 0, frequency_penalty: 0.1 } },
  { id: 'doubao-seed', provider: 'doubao', model: 'doubao-seed-1-6', baseUrl: 'https://ark.cn-beijing.volces.com/api/v3', apiKey: '', modelParams: { temperature: 0.2, top_p: 1, max_tokens: 1200, presence_penalty: 0, frequency_penalty: 0 } },
  { id: 'qwen-plus', provider: 'qwen', model: 'qwen-plus', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', apiKey: '', modelParams: { temperature: 0.25, top_p: 1, max_tokens: 1500, presence_penalty: 0, frequency_penalty: 0 } },
];

function providerLabel(provider?: string) {
  const mapping: Record<string, string> = {
    deepseek: 'DeepSeek',
    mimo: '小米 Mimo',
    doubao: '字节豆包',
    minimax: 'MiniMax',
    kimi: 'Kimi',
    glm: 'GLM',
    qwen: 'Qwen',
  };
  return mapping[String(provider || '').toLowerCase()] || provider || 'Provider';
}

function loadModelProfiles() {
  try {
    const raw = localStorage.getItem('sqlAgentModelProfiles');
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_MODEL_PROFILES;
    return parsed;
  } catch {
    return DEFAULT_MODEL_PROFILES;
  }
}

function loadThreadRagPrefs() {
  try {
    const raw = localStorage.getItem('sqlAgentThreadRagPrefs');
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function saveThreadRagPrefs(prefs: Record<string, boolean>) {
  localStorage.setItem('sqlAgentThreadRagPrefs', JSON.stringify(prefs));
}

export default function Home() {
  const [threadId, setThreadId] = useState(() => newThreadId());
  const [dbConnected, setDbConnected] = useState(false);
  const [dbUrl, setDbUrl] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [showDbPanel, setShowDbPanel] = useState(false);
  const [reportMsg, setReportMsg] = useState<ChatMessage | null>(null);
  const [showBrainstormModal, setShowBrainstormModal] = useState(false);
  const [showModelCenterModal, setShowModelCenterModal] = useState(false);
  const [brainstormReport, setBrainstormReport] = useState<Record<string, unknown> | null>(null);
  const [selectedModel, setSelectedModel] = useState('deepseek-chat');
  const [selectedProfileId, setSelectedProfileId] = useState('deepseek-chat');
  const [modelProfiles, setModelProfiles] = useState(DEFAULT_MODEL_PROFILES);
  const [modelSwitchNotice, setModelSwitchNotice] = useState('');
  const [compactMode, setCompactMode] = useState(true);
  const [sidebarTitle, setSidebarTitle] = useState('My SQL Agent');
  const [headerTitle, setHeaderTitle] = useState('MY SQL AGENT');
  const [fontScale, setFontScale] = useState('sm');
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);
  const [watchdogEnabled, setWatchdogEnabled] = useState(true);
  const [threadStats, setThreadStats] = useState({
    total: 0,
    today: 0,
    latestUpdatedAt: '',
  });
  const [threadRagPrefs, setThreadRagPrefs] = useState<Record<string, boolean>>({});
  const [ragRetrievalK, setRagRetrievalK] = useState(3);

  const { messages, isStreaming, sendMessage, stopStreaming, loadHistory, clearMessages } = useChat(threadId);

  useEffect(() => {
    if (!isStreaming) {
      setRefreshKey((prev) => prev + 1);
    }
  }, [isStreaming]);

  useEffect(() => {
    const loadThreadStats = async () => {
      try {
        const data = await fetchThreads();
        const threads = ((data?.threads || []) as ThreadSummary[]).slice();
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        const todayCount = threads.filter((thread) => {
          const target = thread.updated_at || thread.created_at;
          if (!target) return false;
          const value = new Date(target).getTime();
          return !Number.isNaN(value) && value >= todayStart;
        }).length;

        const latest = threads
          .map((thread) => thread.updated_at || thread.created_at || '')
          .filter(Boolean)
          .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] || '';

        setThreadStats({
          total: threads.length,
          today: todayCount,
          latestUpdatedAt: latest,
        });
      } catch {
        setThreadStats({
          total: 0,
          today: 0,
          latestUpdatedAt: '',
        });
      }
    };

    loadThreadStats();
  }, [refreshKey]);

  useEffect(() => {
    checkHealth()
      .then((data) => {
        setDbConnected(data.database_connected);
        if (data.database_url) {
          setDbUrl(data.database_url);
        }
      })
      .catch(() => setDbConnected(false));

    const profiles = loadModelProfiles();
    setModelProfiles(profiles);
    const savedActiveProfileId = localStorage.getItem('sqlAgentActiveModelProfileId') || '';
    const matchedProfile = profiles.find((item) => item.id === savedActiveProfileId) || profiles[0];
    if (matchedProfile?.model) {
      setSelectedModel(matchedProfile.model);
      setSelectedProfileId(matchedProfile.id);
      localStorage.setItem('sqlAgentModel', matchedProfile.model);
      localStorage.setItem('sqlAgentBaseUrl', matchedProfile.baseUrl || '');
      localStorage.setItem('sqlAgentApiKey', matchedProfile.apiKey || '');
      localStorage.setItem('sqlAgentModelParams', JSON.stringify(matchedProfile.modelParams || {}));
    }
    const savedWatchdog = localStorage.getItem('sqlAgentWatchdogEnabled');
    if (savedWatchdog) {
      setWatchdogEnabled(savedWatchdog === 'true');
    }
    const savedCompactMode = localStorage.getItem('sqlAgentCompactMode');
    if (savedCompactMode) {
      setCompactMode(savedCompactMode === 'true');
    }
    const savedSidebarTitle = localStorage.getItem('sqlAgentSidebarTitle');
    if (savedSidebarTitle) setSidebarTitle(savedSidebarTitle);
    const savedHeaderTitle = localStorage.getItem('sqlAgentHeaderTitle');
    if (savedHeaderTitle) setHeaderTitle(savedHeaderTitle);
    const savedTabTitle = localStorage.getItem('sqlAgentTabTitle');
    if (savedTabTitle) {
      document.title = savedTabTitle;
    }
    const savedFontScale = localStorage.getItem('sqlAgentFontScale');
    if (savedFontScale) setFontScale(savedFontScale);
    setThreadRagPrefs(loadThreadRagPrefs());
    fetchSystemStatus().then((res) => {
      const k = Number(res?.runtime?.rag?.retrieval_k || 3);
      if (!Number.isNaN(k) && k > 0) setRagRetrievalK(k);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!threadId) return;
    setThreadRagPrefs((prev) => {
      if (Object.prototype.hasOwnProperty.call(prev, threadId)) return prev;
      const next = { ...prev, [threadId]: true };
      saveThreadRagPrefs(next);
      return next;
    });
  }, [threadId]);

  useEffect(() => {
    const handleSettingsUpdate = (event: Event) => {
      const customEvent = event as CustomEvent<{
        model?: string;
        profiles?: Array<Record<string, unknown>>;
        activeProfileId?: string;
        compactMode?: boolean;
        sidebarTitle?: string;
        headerTitle?: string;
        tabTitle?: string;
        fontScale?: string;
      }>;
      if (Array.isArray(customEvent.detail?.profiles) && customEvent.detail.profiles.length > 0) {
        const nextProfiles = customEvent.detail.profiles as typeof DEFAULT_MODEL_PROFILES;
        setModelProfiles(nextProfiles);
      }
      if (customEvent.detail?.model) {
        setSelectedModel(customEvent.detail.model);
      }
      if (customEvent.detail?.activeProfileId) {
        setSelectedProfileId(customEvent.detail.activeProfileId);
      }
      if (typeof customEvent.detail?.compactMode === 'boolean') {
        setCompactMode(customEvent.detail.compactMode);
      } else {
        const savedCompactMode = localStorage.getItem('sqlAgentCompactMode');
        if (savedCompactMode) setCompactMode(savedCompactMode === 'true');
      }
      if (customEvent.detail?.sidebarTitle) setSidebarTitle(customEvent.detail.sidebarTitle);
      if (customEvent.detail?.headerTitle) setHeaderTitle(customEvent.detail.headerTitle);
      if (customEvent.detail?.tabTitle) document.title = customEvent.detail.tabTitle;
      if (customEvent.detail?.fontScale) setFontScale(customEvent.detail.fontScale);
    };
    window.addEventListener('sql-agent-settings-updated', handleSettingsUpdate);
    return () => window.removeEventListener('sql-agent-settings-updated', handleSettingsUpdate);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.uiDensity = compactMode ? 'compact' : 'comfortable';
  }, [compactMode]);

  useEffect(() => {
    document.documentElement.dataset.fontScale = fontScale;
  }, [fontScale]);

  const handleModelChange = useCallback((profileId: string) => {
    const profile = modelProfiles.find((item) => item.id === profileId);
    if (!profile) return;
    setSelectedProfileId(profile.id);
    setSelectedModel(profile.model);
    localStorage.setItem('sqlAgentActiveModelProfileId', profile.id);
    localStorage.setItem('sqlAgentModel', profile.model);
    localStorage.setItem('sqlAgentBaseUrl', profile.baseUrl || '');
    localStorage.setItem('sqlAgentApiKey', profile.apiKey || '');
    localStorage.setItem('sqlAgentModelParams', JSON.stringify(profile.modelParams || {}));
    setModelSwitchNotice(`已切换：${providerLabel(profile.provider)} · ${profile.model}`);
    window.setTimeout(() => {
      setModelSwitchNotice('');
    }, 1800);
  }, [modelProfiles]);

  const handleDbConnect = useCallback(async (url: string) => {
    try {
      const result = await setDbConnection(url);
      if (result.success) {
        setDbConnected(true);
        setDbUrl(url);
      } else {
        setDbConnected(false);
      }
    } catch (e) {
      console.error('数据库连接失败:', e);
      setDbConnected(false);
    }
  }, []);

  const handleNewChat = useCallback(() => {
    if (isStreaming) {
      stopStreaming();
    }
    const tid = newThreadId();
    setThreadId(tid);
    clearMessages();
  }, [clearMessages, stopStreaming, isStreaming]);

  const handleSelectThread = useCallback(
    (tid: string) => {
      if (isStreaming) {
        stopStreaming();
      }
      setThreadId(tid);
      loadHistory(tid);
    },
    [loadHistory, stopStreaming, isStreaming]
  );

  const ragEnabledForCurrentThread = threadRagPrefs[threadId] ?? true;
  const toggleThreadRag = useCallback(() => {
    setThreadRagPrefs((prev) => {
      const next = { ...prev, [threadId]: !(prev[threadId] ?? true) };
      saveThreadRagPrefs(next);
      return next;
    });
  }, [threadId]);

  const dbInfo = parseDbConnection(dbUrl);

  const stats = [
    {
      label: 'Data',
      value: dbConnected ? dbInfo.compact : '未连接',
      detail: dbConnected ? dbInfo.detail : '未连接数据库',
      icon: <DatabaseIcon size={16} />,
    },
    {
      label: 'Workspace',
      value: `${threadStats.total}`,
      detail: `今日活跃 ${threadStats.today}`,
      icon: <LayoutGridIcon size={16} />,
    },
    {
      label: 'Latest',
      value: formatRelativeTime(threadStats.latestUpdatedAt),
      detail: threadStats.latestUpdatedAt || '--',
      icon: <SparklesIcon size={16} />,
    },
  ];

  return (
    <div className="relative flex h-screen w-screen overflow-hidden bg-transparent text-foreground">
      <div className="pointer-events-none absolute inset-0 grid-pattern opacity-45" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-56 bg-gradient-to-b from-brand-100/60 via-white/20 to-transparent" />

      <div className="hidden lg:block">
        <Sidebar
          currentThreadId={threadId}
          onSelectThread={handleSelectThread}
          onNewChat={handleNewChat}
          refreshKey={refreshKey}
          onToggleDatabase={() => setShowDbPanel(true)}
          onOpenModelCenter={() => setShowModelCenterModal(true)}
          onOpenBrainstorm={() => setShowBrainstormModal(true)}
          compactMode={compactMode}
          sidebarTitle={sidebarTitle}
          watchdogEnabled={watchdogEnabled}
          onToggleWatchdog={() => {
            const next = !watchdogEnabled;
            setWatchdogEnabled(next);
            localStorage.setItem('sqlAgentWatchdogEnabled', String(next));
          }}
        />
      </div>

      <button
        className="absolute left-3 top-3 z-20 rounded-full border border-slate-200 bg-white/90 p-2.5 text-slate-600 shadow-sm transition hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700 lg:hidden"
        onClick={() => setShowMobileSidebar(true)}
        title="打开侧边栏"
      >
        <PanelLeftOpenIcon size={18} />
      </button>

      <div
        className={`absolute inset-0 z-30 lg:hidden transition-opacity duration-300 ${
          showMobileSidebar ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
        }`}
      >
        <button
          className="absolute inset-0 bg-slate-950/30 backdrop-blur-[1px]"
          onClick={() => setShowMobileSidebar(false)}
          aria-label="关闭侧边栏遮罩"
        />
        <div
          className={`relative h-full w-[86vw] max-w-[320px] p-3 transition-transform duration-300 ease-out ${
            showMobileSidebar ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          {showMobileSidebar && (
            <Sidebar
              currentThreadId={threadId}
              onSelectThread={(tid: string) => {
                handleSelectThread(tid);
                setShowMobileSidebar(false);
              }}
              onNewChat={() => {
                handleNewChat();
                setShowMobileSidebar(false);
              }}
              refreshKey={refreshKey}
              onToggleDatabase={() => {
                setShowDbPanel(true);
                setShowMobileSidebar(false);
              }}
              onOpenModelCenter={() => {
                setShowModelCenterModal(true);
                setShowMobileSidebar(false);
              }}
              onOpenBrainstorm={() => {
                setShowBrainstormModal(true);
                setShowMobileSidebar(false);
              }}
              compactMode={compactMode}
              sidebarTitle={sidebarTitle}
              watchdogEnabled={watchdogEnabled}
              onToggleWatchdog={() => {
                const next = !watchdogEnabled;
                setWatchdogEnabled(next);
                localStorage.setItem('sqlAgentWatchdogEnabled', String(next));
              }}
              mobileMode
              onMobileClose={() => setShowMobileSidebar(false)}
            />
          )}
        </div>
      </div>

      <main className="relative z-10 flex min-w-0 flex-1 flex-col px-2 py-2 lg:px-3 lg:py-3">
        <div className="glass-panel relative flex h-full min-h-0 flex-col overflow-hidden rounded-[24px] border border-white/80 shadow-[0_26px_80px_rgba(30,41,59,0.12)]">
          <header className="sticky top-0 z-10 shrink-0 border-b border-white/80 bg-white/68 backdrop-blur-xl">
            <div className={compactMode ? 'flex flex-col gap-1.5 px-3 py-2 lg:flex-row lg:items-center lg:justify-between lg:px-4' : 'flex flex-col gap-2 px-3 py-2.5 lg:flex-row lg:items-center lg:justify-between lg:px-4'}>
              <div className="flex min-w-0 items-center gap-2">
                <div className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-500">{headerTitle}</div>
                <div className="flex items-center gap-2">
                  <select
                    className="w-[270px] rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 outline-none transition hover:border-brand-300 focus:ring-2 focus:ring-brand-100"
                    value={selectedProfileId}
                    onChange={(event) => handleModelChange(event.target.value)}
                  >
                    {modelProfiles.map((profile) => (
                      <option key={profile.id} value={profile.id}>
                        {providerLabel(profile.provider)} · {profile.model}
                      </option>
                    ))}
                  </select>
                  {modelSwitchNotice && (
                    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                      {modelSwitchNotice}
                    </span>
                  )}
                  <button
                    className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold transition ${
                      ragEnabledForCurrentThread
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                        : 'border-zinc-200 bg-white text-zinc-500'
                    }`}
                    title={`当前对话 RAG 注入：${ragEnabledForCurrentThread ? '开启' : '关闭'}`}
                    onClick={toggleThreadRag}
                  >
                    RAG {ragEnabledForCurrentThread ? 'ON' : 'OFF'}
                  </button>
                </div>
              </div>

              <div className="flex min-w-0 items-center justify-end gap-2 overflow-x-auto">
                {stats.map((item) => (
                  <span
                    key={item.label}
                    className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-medium ${
                      item.label === 'Data' && dbConnected
                        ? 'border-emerald-200 bg-emerald-50/70 text-emerald-700'
                        : 'border-slate-200 bg-white/85 text-slate-600'
                    }`}
                    title={item.detail}
                  >
                    {item.label === 'Data' && (
                      <span className="relative mr-0.5 inline-flex h-2.5 w-2.5">
                        <span className={`absolute inline-flex h-full w-full rounded-full ${dbConnected ? 'animate-ping bg-emerald-300/80' : 'bg-slate-300/80'}`} />
                        <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${dbConnected ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                      </span>
                    )}
                    <span className="text-brand-700">{item.icon}</span>
                    <span>{item.label}</span>
                    <span className={`${item.label === 'Data' ? 'max-w-[340px]' : 'max-w-[160px]'} truncate font-semibold text-slate-900`}>
                      {item.value}
                    </span>
                  </span>
                ))}
                <button
                  className="rounded-full border border-slate-200 bg-white/90 p-2 text-slate-500 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
                  title="删除当前对话"
                  onClick={async () => {
                    if (window.confirm('确定要删除当前数据洞察历史吗？此操作不可逆。')) {
                      try {
                        await deleteThread(threadId);
                        handleNewChat();
                      } catch (e) {
                        console.error(e);
                      }
                    }
                  }}
                >
                  <TrashIcon size={14} />
                </button>
                <button
                  className="rounded-full border border-slate-200 bg-white/90 p-2 text-slate-500 transition hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700"
                  title="分享数据洞察"
                  onClick={() => {
                    window.alert('分享链接功能将在下一版本开放。当前您可以通过左下角的「导出报告」来分享洞察结论！');
                  }}
                >
                  <ShareIcon size={14} />
                </button>
              </div>
            </div>
          </header>

          <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-brand-50/80 to-transparent" />
            <div className="relative flex flex-1 flex-col overflow-hidden pb-32">
              <ChatMessages
                messages={messages}
                isStreaming={isStreaming}
                compactMode={compactMode}
                onViewReport={(msg: ChatMessage) => setReportMsg(msg)}
                onEditSend={(_msgId: string, newContent: string) => {
                  sendMessage(`[用户更正了问题]：\n${newContent}`, selectedModel, dbUrl, {
                    enabled: ragEnabledForCurrentThread,
                    retrievalK: ragRetrievalK,
                  });
                }}
              />
            </div>

            <div className="pointer-events-none absolute bottom-0 left-0 right-0 w-full bg-gradient-to-t from-[#f7fbff] via-[#f8fbff]/96 to-transparent pt-10 pb-4">
              <div className="pointer-events-auto">
                <ChatInput
                  onSend={(text: string) => sendMessage(text, selectedModel, dbUrl, {
                    enabled: ragEnabledForCurrentThread,
                    retrievalK: ragRetrievalK,
                  })}
                  isStreaming={isStreaming}
                  onStop={stopStreaming}
                  compactMode={compactMode}
                />
              </div>
            </div>
          </div>
        </div>
      </main>

      <DbConnectionPanel
        isOpen={showDbPanel}
        onClose={() => setShowDbPanel(false)}
        onConnect={handleDbConnect}
      />

      <FullReportModal
        isOpen={!!reportMsg}
        onClose={() => setReportMsg(null)}
        message={reportMsg}
      />

      <BrainstormModal
        isOpen={showBrainstormModal}
        onClose={() => setShowBrainstormModal(false)}
        onAdopt={(report: string) => {
          setShowBrainstormModal(false);
          sendMessage(`请基于以下群智镜议结论继续形成最终分析与执行方案：\n\n${report}`, selectedModel, dbUrl, {
            enabled: ragEnabledForCurrentThread,
            retrievalK: ragRetrievalK,
          });
        }}
        onOpenReport={(report: Record<string, unknown> | null) => {
          if (!report) return;
          setShowBrainstormModal(false);
          setBrainstormReport(report);
        }}
      />

      <ModelCenterModal
        isOpen={showModelCenterModal}
        onClose={() => setShowModelCenterModal(false)}
      />

      {brainstormReport && (
        <div className="fixed inset-0 z-[10001] bg-background">
          <ReportViewer
            report={brainstormReport}
            onClose={() => setBrainstormReport(null)}
            onExport={() => {}}
          />
        </div>
      )}
    </div>
  );
}
