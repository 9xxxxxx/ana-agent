'use client';

import { useEffect, useState } from 'react';
import { CloseIcon, SettingsIcon, UserIcon, InfoIcon, SparklesIcon } from './Icons';
import { fetchSystemStatus, fetchRagConfig, createRagVerifyTask, fetchRagVerifyTask, clearRagVectorStore, rebuildRagVectorStore, ingestRagUploads, uploadFile } from '@/lib/api';
import { useToast } from './Toast';
import { cn, ui } from './ui';

const DEFAULTS = {
  sidebarTitle: 'My SQL Agent',
  headerTitle: 'MY SQL AGENT',
  tabTitle: 'My SQL Agent | 数据分析工作台',
  compactMode: true,
  fontScale: 'sm',
  systemPrompt: '',
};

export default function SettingsModal({ isOpen, onClose, initialTab = 'workspace' }) {
  const { success, error } = useToast();
  const [activeTab, setActiveTab] = useState(initialTab);
  const [systemPrompt, setSystemPrompt] = useState('');
  const [compactMode, setCompactMode] = useState(true);
  const [sidebarTitle, setSidebarTitle] = useState('My SQL Agent');
  const [headerTitle, setHeaderTitle] = useState('MY SQL AGENT');
  const [tabTitle, setTabTitle] = useState('My SQL Agent | 数据分析工作台');
  const [fontScale, setFontScale] = useState('sm');
  const [systemStatus, setSystemStatus] = useState(null);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [ragLoading, setRagLoading] = useState(false);
  const [ragVerifying, setRagVerifying] = useState(false);
  const [ragTestQuery, setRagTestQuery] = useState('数据库有哪些核心业务表');
  const [ragVerifyResult, setRagVerifyResult] = useState(null);
  const [ragVerifyTaskId, setRagVerifyTaskId] = useState('');
  const [ragVerifyStatus, setRagVerifyStatus] = useState('');
  const [ragMaintaining, setRagMaintaining] = useState(false);
  const [ragConfigSource, setRagConfigSource] = useState({ mode: 'env', effective: 'env', ui_override_allowed: false });
  const [ragSummary, setRagSummary] = useState({
    enabled: false,
    model_name: '',
    local_only: false,
    retrieval_k: 3,
    embedding_status: { status: 'idle', error: '' },
  });
  const [ragSupportedTypes, setRagSupportedTypes] = useState([]);
  const [ragIngestFiles, setRagIngestFiles] = useState([]);
  const [ragIngesting, setRagIngesting] = useState(false);
  const [ragChunkSize, setRagChunkSize] = useState(900);
  const [ragChunkOverlap, setRagChunkOverlap] = useState(150);
  const [ragIngestSummary, setRagIngestSummary] = useState(null);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    if (!isOpen) {
      document.body.style.overflow = '';
      return () => { document.body.style.overflow = ''; };
    }
    document.body.style.overflow = 'hidden';
    setSystemPrompt(localStorage.getItem('sqlAgentSystemPrompt') || '');
    setCompactMode(localStorage.getItem('sqlAgentCompactMode') !== 'false');
    setSidebarTitle(localStorage.getItem('sqlAgentSidebarTitle') || DEFAULTS.sidebarTitle);
    setHeaderTitle(localStorage.getItem('sqlAgentHeaderTitle') || DEFAULTS.headerTitle);
    setTabTitle(localStorage.getItem('sqlAgentTabTitle') || DEFAULTS.tabTitle);
    setFontScale(localStorage.getItem('sqlAgentFontScale') || DEFAULTS.fontScale);
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || activeTab !== 'workspace') return;
    document.title = tabTitle || DEFAULTS.tabTitle;
  }, [isOpen, activeTab, tabTitle]);

  useEffect(() => {
    if (!isOpen || activeTab !== 'about') return;
    let canceled = false;
    setLoadingStatus(true);
    fetchSystemStatus()
      .then((data) => {
        if (!canceled) setSystemStatus(data.success ? data : null);
      })
      .catch(() => {
        if (!canceled) setSystemStatus(null);
      })
      .finally(() => {
        if (!canceled) setLoadingStatus(false);
      });
    return () => {
      canceled = true;
    };
  }, [isOpen, activeTab]);

  useEffect(() => {
    if (!isOpen || activeTab !== 'workspace') return;
    let canceled = false;
    setRagLoading(true);
    fetchRagConfig()
      .then((res) => {
        if (canceled || !res?.success) return;
        const cfg = res.config || {};
        setRagSummary({
          enabled: Boolean(cfg.enabled),
          model_name: cfg.model_name || '',
          local_only: Boolean(cfg.local_only),
          retrieval_k: Number(cfg.retrieval_k || 3),
          embedding_status: res.embedding_status || { status: 'idle', error: '' },
        });
        setRagConfigSource(res.source || { mode: 'env', effective: 'env', ui_override_allowed: false });
        setRagSupportedTypes(Array.isArray(res.supported_file_types) ? res.supported_file_types : []);
      })
      .catch(() => {})
      .finally(() => {
        if (!canceled) setRagLoading(false);
      });
    return () => {
      canceled = true;
    };
  }, [isOpen, activeTab]);

  const tabs = [
    { id: 'workspace', label: '工作台设置', icon: <SettingsIcon size={16} /> },
    { id: 'account', label: '账号与安全', icon: <UserIcon size={16} /> },
    { id: 'about', label: '系统信息', icon: <InfoIcon size={16} /> },
  ];

  const saveWorkspace = () => {
    localStorage.setItem('sqlAgentSystemPrompt', systemPrompt);
    localStorage.setItem('sqlAgentCompactMode', String(compactMode));
    localStorage.setItem('sqlAgentSidebarTitle', sidebarTitle.trim() || DEFAULTS.sidebarTitle);
    localStorage.setItem('sqlAgentHeaderTitle', headerTitle.trim() || DEFAULTS.headerTitle);
    localStorage.setItem('sqlAgentTabTitle', tabTitle.trim() || DEFAULTS.tabTitle);
    localStorage.setItem('sqlAgentFontScale', fontScale);
    window.dispatchEvent(new CustomEvent('sql-agent-settings-updated', {
      detail: {
        compactMode,
        sidebarTitle: sidebarTitle.trim() || DEFAULTS.sidebarTitle,
        headerTitle: headerTitle.trim() || DEFAULTS.headerTitle,
        tabTitle: tabTitle.trim() || DEFAULTS.tabTitle,
        fontScale,
      },
    }));
    success('工作台设置已保存。');
  };

  const resetWorkspaceDefaults = () => {
    setSystemPrompt(DEFAULTS.systemPrompt);
    setCompactMode(DEFAULTS.compactMode);
    setSidebarTitle(DEFAULTS.sidebarTitle);
    setHeaderTitle(DEFAULTS.headerTitle);
    setTabTitle(DEFAULTS.tabTitle);
    setFontScale(DEFAULTS.fontScale);
  };

  const handleClearVectorStore = async () => {
    if (!window.confirm('确认清空当前向量库吗？该操作会删除已索引文档。')) return;
    setRagMaintaining(true);
    try {
      const res = await clearRagVectorStore();
      if (!res?.success) throw new Error(res?.message || '清空失败');
      success(res.message || '向量库已清空');
    } catch (err) {
      error(err.message || '清空向量库失败');
    } finally {
      setRagMaintaining(false);
    }
  };

  const handleRebuildVectorStore = async () => {
    setRagMaintaining(true);
    try {
      const res = await rebuildRagVectorStore();
      if (!res?.success) throw new Error(res?.message || '重建失败');
      success(res.message || '向量库已重建');
    } catch (err) {
      error(err.message || '重建向量库失败');
    } finally {
      setRagMaintaining(false);
    }
  };

  const handleVerifyRag = async () => {
    setRagVerifying(true);
    try {
      const created = await createRagVerifyTask(ragTestQuery.trim());
      if (!created?.success || !created?.task_id) throw new Error(created?.message || '创建验证任务失败');
      setRagVerifyTaskId(created.task_id);
      setRagVerifyStatus('queued');
      setRagVerifyResult(null);
      const startedAt = Date.now();
      const timeoutMs = 120000;

      while (Date.now() - startedAt < timeoutMs) {
        await new Promise((resolve) => setTimeout(resolve, 1200));
        const statusResp = await fetchRagVerifyTask(created.task_id);
        if (!statusResp?.success) {
          throw new Error(statusResp?.message || '读取验证任务状态失败');
        }
        const task = statusResp.task || {};
        setRagVerifyStatus(task.status || '');
        if (task.status === 'completed') {
          setRagVerifyResult(task.result || null);
          success(task.result?.message || '验证完成');
          setRagVerifying(false);
          return;
        }
        if (task.status === 'failed') {
          throw new Error(task.error || '验证任务执行失败');
        }
      }
      throw new Error('验证任务超时，请稍后重试');
    } catch (err) {
      setRagVerifyResult(null);
      error(err.message || '验证失败');
    } finally {
      setRagVerifying(false);
    }
  };

  const handleRagFileSelection = (event) => {
    const files = Array.from(event.target.files || []);
    setRagIngestFiles(files);
    setRagIngestSummary(null);
  };

  const handleBatchIngest = async () => {
    if (ragIngestFiles.length === 0) {
      error('请先选择待入库文件。');
      return;
    }
    setRagIngesting(true);
    setRagIngestSummary(null);
    try {
      const uploadedNames = [];
      for (const file of ragIngestFiles) {
        const uploadRes = await uploadFile(file);
        if (!uploadRes?.success || !uploadRes?.filename) {
          throw new Error(uploadRes?.message || `上传失败: ${file.name}`);
        }
        uploadedNames.push(uploadRes.filename);
      }
      const ingestRes = await ingestRagUploads({
        upload_filenames: uploadedNames,
        chunk_size: Number(ragChunkSize) || 900,
        chunk_overlap: Number(ragChunkOverlap) || 150,
      });
      if (!ingestRes?.success) throw new Error(ingestRes?.message || '向量化入库失败');
      setRagIngestSummary(ingestRes.summary || null);
      success(`入库完成：${ingestRes.summary?.accepted_count || 0} 个文件，${ingestRes.summary?.chunk_count || 0} 个片段。`);
    } catch (err) {
      error(err.message || '批量入库失败');
    } finally {
      setRagIngesting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm">
      <button className="fixed inset-0" onClick={onClose} aria-label="关闭设置面板" />
      <div className="relative flex h-[84vh] max-h-[720px] w-full max-w-5xl flex-col overflow-hidden rounded-[28px] border border-zinc-200 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.2)] md:flex-row">
        <div className="flex w-full flex-col border-r border-zinc-200 bg-zinc-50 pt-4 md:w-60">
          <div className="flex items-center justify-between px-5 pb-4">
            <h2 className="text-base font-semibold text-foreground">系统设置</h2>
            <button className="rounded-lg p-1.5 text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900 md:hidden" onClick={onClose}>
              <CloseIcon size={18} />
            </button>
          </div>
          <div className="space-y-1 px-3 py-3">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-sm font-medium transition-colors',
                  activeTab === tab.id
                    ? 'border-zinc-200 bg-white text-zinc-950 shadow-sm'
                    : 'border-transparent text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900'
                )}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="relative flex min-w-0 flex-1 flex-col bg-white">
          <button className="absolute right-4 top-4 z-10 hidden rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 md:flex" onClick={onClose}>
            <CloseIcon size={18} />
          </button>

          <div className="sidebar-scroller flex-1 overflow-y-auto p-5 md:p-6">
            {activeTab === 'workspace' && (
              <div className="space-y-5">
                <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                  <div className="text-sm font-semibold text-zinc-900">应用设置</div>
                  <div className="mt-1 text-xs text-zinc-500">可分别配置侧边栏标题、对话区标题与标签页标题。</div>
                  <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-zinc-600">侧边栏标题</label>
                      <input
                        className={cn(ui.inputMuted, 'h-9 rounded-lg px-3 py-2 text-xs')}
                        value={sidebarTitle}
                        onChange={(event) => setSidebarTitle(event.target.value)}
                        placeholder="例如：Insight Console"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-zinc-600">对话区标题</label>
                      <input
                        className={cn(ui.inputMuted, 'h-9 rounded-lg px-3 py-2 text-xs')}
                        value={headerTitle}
                        onChange={(event) => setHeaderTitle(event.target.value)}
                        placeholder="例如：INSIGHT CONSOLE"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-zinc-600">标签页标题</label>
                      <input
                        className={cn(ui.inputMuted, 'h-9 rounded-lg px-3 py-2 text-xs')}
                        value={tabTitle}
                        onChange={(event) => setTabTitle(event.target.value)}
                        placeholder="例如：Insight Console | 数据分析工作台"
                      />
                    </div>
                    <div className="md:col-span-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-600">
                      即时预览标签页标题：<span className="font-semibold text-zinc-900">{tabTitle || DEFAULTS.tabTitle}</span>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                  <div className="text-sm font-semibold text-zinc-900">界面密度</div>
                  <div className="mt-1 text-xs text-zinc-500">开启后聊天区和输入区使用紧凑尺寸，提升信息密度。</div>
                  <div className="mt-3 flex items-center gap-2">
                    <button
                      className={cn(
                        'rounded-full border px-3 py-1.5 text-xs font-semibold transition',
                        compactMode ? 'border-brand-200 bg-brand-50 text-brand-700' : 'border-zinc-200 bg-white text-zinc-500'
                      )}
                      onClick={() => setCompactMode(true)}
                    >
                      紧凑
                    </button>
                    <button
                      className={cn(
                        'rounded-full border px-3 py-1.5 text-xs font-semibold transition',
                        !compactMode ? 'border-brand-200 bg-brand-50 text-brand-700' : 'border-zinc-200 bg-white text-zinc-500'
                      )}
                      onClick={() => setCompactMode(false)}
                    >
                      标准
                    </button>
                  </div>
                </div>

                <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                  <div className="text-sm font-semibold text-zinc-900">字体大小</div>
                  <div className="mt-1 text-xs text-zinc-500">提供更多字号档位，适配不同分辨率与阅读偏好。</div>
                  <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-5">
                    {[
                      { id: 'xs', label: '极小' },
                      { id: 'sm', label: '紧凑' },
                      { id: 'md', label: '标准' },
                      { id: 'lg', label: '舒适' },
                      { id: 'xl', label: '大号' },
                    ].map((item) => (
                      <button
                        key={item.id}
                        className={cn(
                          'rounded-lg border px-3 py-1.5 text-xs font-semibold transition',
                          fontScale === item.id
                            ? 'border-brand-200 bg-brand-50 text-brand-700'
                            : 'border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300'
                        )}
                        onClick={() => setFontScale(item.id)}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="text-sm font-semibold text-zinc-900">RAG 运行控制</div>
                      <div className="mt-1 text-xs text-zinc-500">模型与 Token 仅由后端 .env 管理；前端保留常用运行能力。</div>
                    </div>
                    {ragLoading && <span className="text-xs text-zinc-500">加载中...</span>}
                  </div>
                  <div className={cn(
                    'mt-3 rounded-lg border px-3 py-2 text-xs',
                    'border-emerald-200 bg-emerald-50 text-emerald-800'
                  )}>
                    配置源模式：{ragConfigSource.mode}，当前生效：{ragConfigSource.effective}。
                    {' '}前端不提供模型参数编辑，避免与后端配置冲突。
                    {' '}对话级开关请使用聊天窗口顶部的 `RAG ON/OFF`。
                  </div>

                  <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
                    <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-700">
                      RAG 状态：<span className="font-semibold">{ragSummary.enabled ? '开启' : '关闭'}</span>
                    </div>
                    <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-700">
                      本地模式：<span className="font-semibold">{ragSummary.local_only ? '仅本地' : '可联网'}</span>
                    </div>
                    <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-700">
                      检索 Top-K：<span className="font-semibold">{ragSummary.retrieval_k}</span>
                    </div>
                    <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-700">
                      Embedding：<span className="font-semibold">{ragSummary.embedding_status?.status || 'idle'}</span>
                    </div>
                    <div className="md:col-span-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-700">
                      当前模型：<span className="font-semibold break-all">{ragSummary.model_name || '--'}</span>
                    </div>
                  </div>

                  <div className="mt-3 rounded-lg border border-zinc-200 bg-white p-3">
                    <div className="mb-2 text-xs font-semibold text-zinc-700">RAG 注入有效性验证</div>
                    <div className="flex gap-2">
                      <input
                        className={cn(ui.inputMuted, 'h-9 rounded-lg px-3 py-2 text-xs')}
                        value={ragTestQuery}
                        onChange={(e) => setRagTestQuery(e.target.value)}
                        placeholder="输入验证查询，例如：订单表有哪些关键字段"
                      />
                      <button
                        className={cn(ui.buttonSecondary, 'rounded-lg px-3 py-2 text-xs')}
                        onClick={handleVerifyRag}
                        disabled={ragVerifying}
                      >
                        {ragVerifying ? '验证中...' : '验证注入'}
                      </button>
                    </div>
                    {ragVerifyResult && (
                      <div className={cn(
                        'mt-2 rounded-md border px-2 py-2 text-xs',
                        ragVerifyResult.effective ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'
                      )}>
                        <div>{ragVerifyResult.message}</div>
                        {Array.isArray(ragVerifyResult.samples) && ragVerifyResult.samples.length > 0 && (
                          <ul className="mt-1 list-disc pl-4">
                            {ragVerifyResult.samples.map((item, idx) => <li key={idx}>{item}</li>)}
                          </ul>
                        )}
                      </div>
                    )}
                    {!ragVerifyResult && ragVerifyTaskId && (
                      <div className="mt-2 rounded-md border border-zinc-200 bg-zinc-50 px-2 py-2 text-xs text-zinc-600">
                        任务 {ragVerifyTaskId} · 状态 {ragVerifyStatus || 'running'}
                      </div>
                    )}
                  </div>

                  <div className="mt-3 rounded-lg border border-zinc-200 bg-white p-3">
                    <div className="mb-2 text-xs font-semibold text-zinc-700">文件入库（上传 → 切片 → 向量化）</div>
                    <div className="mb-2 text-[11px] text-zinc-500">
                      支持批量上传并自动切片。支持类型：{ragSupportedTypes.length > 0 ? ragSupportedTypes.join(', ') : 'txt/md/sql/csv/json 等文本类文件'}。
                    </div>
                    <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                      <div className="md:col-span-2">
                        <input
                          type="file"
                          multiple
                          accept={ragSupportedTypes.join(',')}
                          className={cn(ui.inputMuted, 'h-9 rounded-lg px-2 py-1.5 text-xs')}
                          onChange={handleRagFileSelection}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="number"
                          min={200}
                          max={4000}
                          className={cn(ui.inputMuted, 'h-9 rounded-lg px-3 py-2 text-xs')}
                          value={ragChunkSize}
                          onChange={(e) => setRagChunkSize(Number(e.target.value || 900))}
                          title="切片大小（字符）"
                        />
                        <input
                          type="number"
                          min={0}
                          max={1000}
                          className={cn(ui.inputMuted, 'h-9 rounded-lg px-3 py-2 text-xs')}
                          value={ragChunkOverlap}
                          onChange={(e) => setRagChunkOverlap(Number(e.target.value || 150))}
                          title="切片重叠（字符）"
                        />
                      </div>
                    </div>
                    {ragIngestFiles.length > 0 && (
                      <div className="mt-2 rounded-md border border-zinc-200 bg-zinc-50 px-2 py-2 text-xs text-zinc-600">
                        已选择 {ragIngestFiles.length} 个文件：{ragIngestFiles.map((item) => item.name).join('、')}
                      </div>
                    )}
                    {ragIngestSummary && (
                      <div className="mt-2 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-2 text-xs text-emerald-700">
                        成功 {ragIngestSummary.accepted_count} 个文件，生成 {ragIngestSummary.chunk_count} 个片段；
                        跳过 {ragIngestSummary.skipped_count} 个文件。
                      </div>
                    )}
                    <div className="mt-2 flex justify-end">
                      <button
                        className={cn(ui.buttonSecondary, 'rounded-lg px-3 py-2 text-xs')}
                        onClick={handleBatchIngest}
                        disabled={ragIngesting}
                      >
                        {ragIngesting ? '入库中...' : '批量上传并入库'}
                      </button>
                    </div>
                  </div>

                  <div className="mt-3 flex justify-end">
                    <button
                      className={cn(ui.buttonSecondary, 'mr-2 rounded-xl px-4 py-2 text-sm')}
                      onClick={handleRebuildVectorStore}
                      disabled={ragMaintaining}
                    >
                      重建向量库
                    </button>
                    <button
                      className={cn(ui.buttonSecondary, 'mr-2 rounded-xl px-4 py-2 text-sm text-rose-600 border-rose-200 hover:bg-rose-50')}
                      onClick={handleClearVectorStore}
                      disabled={ragMaintaining}
                    >
                      清空向量库
                    </button>
                  </div>
                </div>

                <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-semibold text-zinc-900">系统级提示词</div>
                    <span className="inline-flex items-center gap-1 rounded-full border border-brand-200 bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand-700">
                      <SparklesIcon size={11} />
                      运行中生效
                    </span>
                  </div>
                  <textarea
                    rows={7}
                    className={cn(ui.textareaMuted, 'mt-3 min-h-[170px] p-3 text-sm leading-7')}
                    value={systemPrompt}
                    onChange={(event) => setSystemPrompt(event.target.value)}
                  />
                  <div className="mt-3 flex justify-between">
                    <button
                      className={cn(ui.buttonSecondary, 'rounded-xl px-4 py-2 text-sm')}
                      onClick={resetWorkspaceDefaults}
                    >
                      恢复默认应用设置
                    </button>
                    <button className={cn(ui.buttonPrimary, 'rounded-xl px-4 py-2 text-sm')} onClick={saveWorkspace}>
                      保存工作台设置
                    </button>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'account' && (
              <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-5 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-zinc-900 text-white">
                  <UserIcon size={22} />
                </div>
                <div className="mt-3 text-base font-semibold text-zinc-900">本地工作站模式</div>
                <div className="mt-1 text-sm text-zinc-500">当前以本地运行方式使用，配置与对话保存在本机。</div>
              </div>
            )}

            {activeTab === 'about' && (
              <div className="space-y-4">
                <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                  <div className="text-sm font-semibold text-zinc-900">系统运行信息</div>
                  <div className="mt-1 text-xs text-zinc-500">包含运行拓扑、用量估算、数据库与任务状态。</div>
                </div>

                {loadingStatus ? (
                  <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-6 text-sm text-zinc-500">正在读取系统状态...</div>
                ) : systemStatus?.runtime ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <div className="rounded-2xl border border-zinc-200 bg-white p-4 text-xs text-zinc-600">
                        <div className="mb-2 font-semibold text-zinc-800">运行拓扑</div>
                        <div>Prefect: {systemStatus.runtime.prefect_embedded ? '内嵌 Runner' : '外部服务'}</div>
                        <div>数据库已连接: {systemStatus.runtime.database_connected ? '是' : '否'}</div>
                        <div>已保存数据源: {systemStatus.runtime.db_config_count}</div>
                        <div>历史线程: {systemStatus.runtime.history?.thread_count ?? 0}</div>
                      </div>
                      <div className="rounded-2xl border border-zinc-200 bg-white p-4 text-xs text-zinc-600">
                        <div className="mb-2 font-semibold text-zinc-800">模型用量 (估算)</div>
                        <div>总请求: {systemStatus.runtime.usage?.request_count ?? 0}</div>
                        <div>输入 Token(估): {systemStatus.runtime.usage?.input_tokens_estimate ?? 0}</div>
                        <div>输出 Token(估): {systemStatus.runtime.usage?.output_tokens_estimate ?? 0}</div>
                        <div>最近模型: {systemStatus.runtime.usage?.last_model || '--'}</div>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-zinc-200 bg-white p-4 text-xs text-zinc-600">
                      <div className="mb-2 font-semibold text-zinc-800">API 配额信息</div>
                      <div>{systemStatus.runtime.usage?.quota_note || '当前未接入各厂商统一余额接口。'}</div>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800">系统状态暂时不可用，请检查后端服务。</div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
