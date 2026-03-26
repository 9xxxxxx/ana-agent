'use client';

import { useEffect, useMemo, useState } from 'react';
import { CloseIcon, PlusIcon, RefreshCwIcon, TrashIcon, CheckIcon } from './Icons';
import { testModelConnection } from '@/lib/api';
import { useToast } from './Toast';
import { cn, ui } from './ui';

const DEFAULT_MODEL_PARAMS = {
  temperature: 0.2,
  top_p: 1,
  max_tokens: 1200,
  presence_penalty: 0,
  frequency_penalty: 0,
};

const PARAM_PRESETS = [
  {
    id: 'stable',
    name: '稳定推理',
    params: { temperature: 0.1, top_p: 0.9, max_tokens: 1200, presence_penalty: 0, frequency_penalty: 0.1 },
  },
  {
    id: 'balanced',
    name: '通用平衡',
    params: { temperature: 0.2, top_p: 1, max_tokens: 1200, presence_penalty: 0, frequency_penalty: 0 },
  },
  {
    id: 'creative',
    name: '创意探索',
    params: { temperature: 0.75, top_p: 1, max_tokens: 1500, presence_penalty: 0.4, frequency_penalty: 0.2 },
  },
  {
    id: 'long',
    name: '长文报告',
    params: { temperature: 0.25, top_p: 0.95, max_tokens: 2800, presence_penalty: 0.1, frequency_penalty: 0.1 },
  },
];

const PROVIDER_OPTIONS = [
  { id: 'deepseek', label: 'DeepSeek', model: 'deepseek-chat', baseUrl: 'https://api.deepseek.com/v1' },
  { id: 'doubao', label: '字节豆包', model: 'doubao-seed-1-6', baseUrl: 'https://ark.cn-beijing.volces.com/api/v3' },
  { id: 'qwen', label: 'Qwen', model: 'qwen-plus', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
  { id: 'glm', label: 'GLM', model: 'glm-4-plus', baseUrl: 'https://open.bigmodel.cn/api/paas/v4' },
  { id: 'kimi', label: 'Kimi', model: 'kimi-k2-0905-preview', baseUrl: 'https://api.moonshot.cn/v1' },
  { id: 'minimax', label: 'MiniMax', model: 'MiniMax-M2.1', baseUrl: 'https://api.minimaxi.com/v1' },
  { id: 'mimo', label: '小米 Mimo', model: 'mimo-v2-flash', baseUrl: '' },
];

const DEFAULT_PROFILES = [
  {
    id: 'deepseek-chat',
    provider: 'deepseek',
    model: 'deepseek-chat',
    baseUrl: 'https://api.deepseek.com/v1',
    apiKey: '',
    modelParams: DEFAULT_MODEL_PARAMS,
  },
  {
    id: 'deepseek-reasoner',
    provider: 'deepseek',
    model: 'deepseek-reasoner',
    baseUrl: 'https://api.deepseek.com/v1',
    apiKey: '',
    modelParams: { ...DEFAULT_MODEL_PARAMS, temperature: 0.1, max_tokens: 1800 },
  },
];

function providerLabel(providerId) {
  return PROVIDER_OPTIONS.find((item) => item.id === providerId)?.label || providerId;
}

function normalizeProfiles(rawProfiles) {
  if (!Array.isArray(rawProfiles) || rawProfiles.length === 0) return DEFAULT_PROFILES;
  return rawProfiles.map((item, index) => ({
    id: String(item.id || `${item.provider || 'provider'}-${Date.now()}-${index}`),
    provider: String(item.provider || 'deepseek'),
    model: String(item.model || 'deepseek-chat'),
    baseUrl: String(item.baseUrl || ''),
    apiKey: String(item.apiKey || ''),
    modelParams: { ...DEFAULT_MODEL_PARAMS, ...(item.modelParams || {}) },
  }));
}

function initialDraft(providerId = 'deepseek') {
  const provider = PROVIDER_OPTIONS.find((item) => item.id === providerId) || PROVIDER_OPTIONS[0];
  return {
    id: `draft-${Date.now()}`,
    provider: provider.id,
    model: provider.model,
    baseUrl: provider.baseUrl,
    apiKey: '',
    modelParams: { ...DEFAULT_MODEL_PARAMS },
  };
}

export default function ModelCenterModal({ isOpen, onClose }) {
  const { success, warning, error, info } = useToast();
  const [profiles, setProfiles] = useState(DEFAULT_PROFILES);
  const [activeProfileId, setActiveProfileId] = useState(DEFAULT_PROFILES[0].id);
  const [editingId, setEditingId] = useState(DEFAULT_PROFILES[0].id);
  const [editor, setEditor] = useState(DEFAULT_PROFILES[0]);
  const [isDraft, setIsDraft] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [testing, setTesting] = useState(false);

  const editingDirty = useMemo(() => {
    if (isDraft) return true;
    const source = profiles.find((item) => item.id === editingId);
    if (!source) return false;
    return JSON.stringify(source) !== JSON.stringify(editor);
  }, [profiles, editingId, editor, isDraft]);

  useEffect(() => {
    if (!isOpen) return;
    document.body.style.overflow = 'hidden';
    let parsed = [];
    try {
      parsed = JSON.parse(localStorage.getItem('sqlAgentModelProfiles') || '[]');
    } catch {
      parsed = [];
    }
    const nextProfiles = normalizeProfiles(parsed);
    const savedActiveId = localStorage.getItem('sqlAgentActiveModelProfileId') || nextProfiles[0]?.id;
    const active = nextProfiles.find((item) => item.id === savedActiveId) || nextProfiles[0];
    setProfiles(nextProfiles);
    setActiveProfileId(active.id);
    setEditingId(active.id);
    setEditor({ ...active, modelParams: { ...active.modelParams } });
    setIsDraft(false);
    setShowApiKey(false);
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const persistProfiles = (nextProfiles, nextActiveId) => {
    const active = nextProfiles.find((item) => item.id === nextActiveId) || nextProfiles[0];
    localStorage.setItem('sqlAgentModelProfiles', JSON.stringify(nextProfiles));
    localStorage.setItem('sqlAgentActiveModelProfileId', active.id);
    localStorage.setItem('sqlAgentModel', active.model);
    localStorage.setItem('sqlAgentApiKey', active.apiKey || '');
    localStorage.setItem('sqlAgentBaseUrl', active.baseUrl || '');
    localStorage.setItem('sqlAgentModelParams', JSON.stringify(active.modelParams || {}));
    window.dispatchEvent(
      new CustomEvent('sql-agent-settings-updated', {
        detail: {
          model: active.model,
          profiles: nextProfiles,
          activeProfileId: active.id,
        },
      })
    );
  };

  const handleSelectProfile = (profileId) => {
    const selected = profiles.find((item) => item.id === profileId);
    if (!selected) return;
    setEditingId(selected.id);
    setEditor({ ...selected, modelParams: { ...selected.modelParams } });
    setIsDraft(false);
  };

  const handleCreateDraft = (providerId = 'deepseek') => {
    setEditor(initialDraft(providerId));
    setEditingId('');
    setIsDraft(true);
    info('已创建模型草稿，保存后才会出现在左侧列表。');
  };

  const handleSave = () => {
    if (!editor.model.trim()) {
      warning('请填写模型标识。');
      return;
    }
    const normalizedEditor = {
      ...editor,
      id: isDraft ? `${editor.provider}-${Date.now()}` : editor.id,
      modelParams: { ...DEFAULT_MODEL_PARAMS, ...(editor.modelParams || {}) },
    };
    const nextProfiles = isDraft
      ? [normalizedEditor, ...profiles]
      : profiles.map((item) => (item.id === normalizedEditor.id ? normalizedEditor : item));
    setProfiles(nextProfiles);
    setEditingId(normalizedEditor.id);
    setEditor(normalizedEditor);
    setIsDraft(false);
    persistProfiles(nextProfiles, activeProfileId);
    success('模型配置已保存。');
  };

  const handleSetDefault = () => {
    if (isDraft) {
      warning('请先保存草稿，再设为默认。');
      return;
    }
    setActiveProfileId(editor.id);
    persistProfiles(profiles, editor.id);
    success(`默认模型已切换：${providerLabel(editor.provider)} · ${editor.model}`);
  };

  const handleDeleteProfile = (profileId) => {
    const remain = profiles.filter((item) => item.id !== profileId);
    if (remain.length === 0) {
      warning('至少保留一个模型配置。');
      return;
    }
    const nextActiveId = activeProfileId === profileId ? remain[0].id : activeProfileId;
    setProfiles(remain);
    persistProfiles(remain, nextActiveId);
    if (editingId === profileId) {
      setEditingId(remain[0].id);
      setEditor(remain[0]);
      setIsDraft(false);
    }
    success('模型配置已删除。');
  };

  const handleApplyPreset = (presetId) => {
    const preset = PARAM_PRESETS.find((item) => item.id === presetId);
    if (!preset) return;
    setEditor((prev) => ({ ...prev, modelParams: { ...preset.params } }));
  };

  const handleProviderChange = (value) => {
    const provider = PROVIDER_OPTIONS.find((item) => item.id === value);
    if (!provider) return;
    setEditor((prev) => ({
      ...prev,
      provider: provider.id,
      model: prev.model || provider.model,
      baseUrl: prev.baseUrl || provider.baseUrl,
    }));
  };

  const handleTest = async () => {
    if (!editor.model.trim()) {
      warning('请先填写模型标识。');
      return;
    }
    setTesting(true);
    try {
      const result = await testModelConnection(editor.model, editor.apiKey, editor.baseUrl);
      if (result?.success) {
        success('模型连接测试通过。');
      } else {
        throw new Error(result?.message || '连接失败');
      }
    } catch (currentError) {
      error(`测试失败：${currentError.message}`);
    } finally {
      setTesting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm">
      <button className="absolute inset-0" onClick={onClose} aria-label="关闭模型中心" />
      <div className="relative flex h-[86vh] w-full max-w-6xl overflow-hidden rounded-[28px] border border-zinc-200 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.2)]">
        <aside className="w-[320px] shrink-0 border-r border-zinc-200 bg-zinc-50 p-4">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-zinc-900">模型配置</div>
              <div className="text-xs text-zinc-500">保存后生效</div>
            </div>
            <button className={cn(ui.iconButton, 'rounded-lg')} onClick={onClose}>
              <CloseIcon size={16} />
            </button>
          </div>

          <button className={cn(ui.buttonSecondary, 'mb-3 w-full justify-center rounded-lg px-3 py-2 text-xs')} onClick={() => handleCreateDraft('deepseek')}>
            <PlusIcon size={13} />
            新建草稿
          </button>

          <div className="sidebar-scroller max-h-[68vh] space-y-2 overflow-y-auto pr-1">
            {profiles.map((profile) => (
              <div
                key={profile.id}
                className={cn(
                  'rounded-xl border px-3 py-2',
                  editingId === profile.id && !isDraft
                    ? 'border-brand-200 bg-brand-50'
                    : 'border-zinc-200 bg-white'
                )}
              >
                <button className="w-full text-left" onClick={() => handleSelectProfile(profile.id)}>
                  <div className="truncate text-xs font-semibold text-zinc-900">{providerLabel(profile.provider)} · {profile.model}</div>
                  <div className="mt-1 text-[11px] text-zinc-500">{profile.baseUrl || '未配置 Base URL'}</div>
                  {activeProfileId === profile.id && (
                    <div className="mt-1 inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                      <CheckIcon size={10} />
                      默认
                    </div>
                  )}
                </button>
                <button
                  className="mt-2 inline-flex items-center gap-1 rounded-lg border border-zinc-200 px-2 py-1 text-[11px] text-rose-600 transition hover:border-rose-200 hover:bg-rose-50"
                  onClick={() => handleDeleteProfile(profile.id)}
                >
                  <TrashIcon size={12} />
                  删除
                </button>
              </div>
            ))}
          </div>
        </aside>

        <section className="sidebar-scroller min-w-0 flex-1 overflow-y-auto p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-base font-semibold text-zinc-900">模型中心</div>
              <div className="text-xs text-zinc-500">模型配置已从系统设置独立；这里统一管理厂商、模型、参数与连通性。</div>
            </div>
            <div className="flex items-center gap-2">
              <select className={cn(ui.select, 'h-8 rounded-lg px-2 text-xs')} value="" onChange={(event) => handleCreateDraft(event.target.value)}>
                <option value="" disabled>按厂商新建草稿</option>
                {PROVIDER_OPTIONS.map((item) => (
                  <option key={item.id} value={item.id}>{item.label}</option>
                ))}
              </select>
              <button className={cn(ui.buttonSecondary, 'rounded-lg px-3 py-1.5 text-xs')} onClick={handleTest} disabled={testing}>
                <RefreshCwIcon size={13} className={testing ? 'animate-spin' : ''} />
                {testing ? '测试中' : '测试连接'}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-zinc-600">厂商</label>
              <select className={cn(ui.select, 'h-9 rounded-lg px-3 py-2 text-xs')} value={editor.provider} onChange={(event) => handleProviderChange(event.target.value)}>
                {PROVIDER_OPTIONS.map((item) => (
                  <option key={item.id} value={item.id}>{item.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-zinc-600">模型标识</label>
              <input
                className={cn(ui.inputMuted, 'h-9 rounded-lg px-3 py-2 text-xs')}
                value={editor.model}
                onChange={(event) => setEditor((prev) => ({ ...prev, model: event.target.value }))}
                placeholder="例如：deepseek-reasoner"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-zinc-600">Base URL</label>
              <input
                className={cn(ui.inputMuted, 'h-9 rounded-lg px-3 py-2 text-xs')}
                value={editor.baseUrl}
                onChange={(event) => setEditor((prev) => ({ ...prev, baseUrl: event.target.value }))}
                placeholder="模型网关地址"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-zinc-600">API Key</label>
              <div className="relative">
                <input
                  type={showApiKey ? 'text' : 'password'}
                  className={cn(ui.inputMuted, 'h-9 rounded-lg px-3 py-2 pr-16 text-xs')}
                  value={editor.apiKey}
                  onChange={(event) => setEditor((prev) => ({ ...prev, apiKey: event.target.value }))}
                  placeholder="sk-..."
                />
                <button className="absolute inset-y-0 right-3 text-xs text-zinc-500 hover:text-zinc-900" onClick={() => setShowApiKey((value) => !value)}>
                  {showApiKey ? '隐藏' : '查看'}
                </button>
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-semibold text-zinc-700">参数模板</div>
              <div className="flex flex-wrap gap-2">
                {PARAM_PRESETS.map((preset) => (
                  <button key={preset.id} className={cn(ui.buttonSecondary, 'rounded-lg px-2.5 py-1 text-[11px]')} onClick={() => handleApplyPreset(preset.id)}>
                    {preset.name}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
              {[
                { key: 'temperature', label: 'Temperature', hint: '越高越发散，越低越稳。' },
                { key: 'top_p', label: 'Top P', hint: '控制采样范围，越小越保守。' },
                { key: 'max_tokens', label: 'Max Tokens', hint: '限制输出长度和成本。' },
                { key: 'presence_penalty', label: 'Presence', hint: '提高后更倾向新话题。' },
                { key: 'frequency_penalty', label: 'Frequency', hint: '提高后减少复读。' },
              ].map((item) => (
                <div key={item.key}>
                  <label className="mb-1 block text-[11px] font-semibold text-zinc-700">{item.label}</label>
                  <input
                    type="number"
                    className={cn(ui.inputMuted, 'h-9 rounded-lg px-2 py-2 text-xs')}
                    value={editor.modelParams[item.key]}
                    onChange={(event) =>
                      setEditor((prev) => ({
                        ...prev,
                        modelParams: {
                          ...prev.modelParams,
                          [item.key]: Number(event.target.value),
                        },
                      }))
                    }
                  />
                  <p className="mt-1 text-[10px] leading-4 text-zinc-500">{item.hint}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs text-zinc-500">{editingDirty ? '当前配置有未保存修改' : '当前配置已同步'}</div>
            <div className="flex flex-wrap gap-2">
              <button className={cn(ui.buttonSecondary, 'rounded-lg px-3 py-1.5 text-xs')} onClick={handleSetDefault}>
                设为默认
              </button>
              <button className={cn(ui.buttonPrimary, 'rounded-lg px-3 py-1.5 text-xs')} onClick={handleSave}>
                保存
              </button>
            </div>
          </div>

          {editor.provider === 'mimo' && (
            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
              小米 Mimo 当前未在主流官方文档中提供统一 OpenAI 兼容固定 Base URL，请按你实际接入网关填写。
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
