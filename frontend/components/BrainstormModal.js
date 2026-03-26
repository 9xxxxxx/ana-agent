'use client';

import { useEffect, useState, useCallback } from 'react';

import {
  CloseIcon,
  SparklesIcon,
  MessageIcon,
  CheckIcon,
  PlusIcon,
  TrashIcon,
  DatabaseIcon,
  RefreshCwIcon,
} from './Icons';
import {
  createBrainstormSession,
  fetchBrainstormSessions,
  fetchBrainstormSession,
  startBrainstormSession,
  cancelBrainstormSession,
  uploadFile,
  getUploadUrl,
} from '@/lib/api';
import { buildDecisionReport } from '@/lib/reportBuilder';
import { cn, ui } from './ui';
import { EmptyState, InlineFeedback, LoadingState, StatusBadge } from './status';

const ROLE_PRESETS = [
  {
    id: 'data_analyst',
    name: 'Data Analyst',
    prompt: '聚焦指标、数据证据、异常解释、验证路径。',
  },
  {
    id: 'risk_reviewer',
    name: 'Risk Reviewer',
    prompt: '聚焦风险、反例、数据口径偏差与不确定性。',
  },
  {
    id: 'strategy_advisor',
    name: 'Strategy Advisor',
    prompt: '聚焦行动路径、优先级、资源投入与收益。',
  },
  {
    id: 'finance_controller',
    name: 'Finance Controller',
    prompt: '聚焦预算、成本收益、财务健康与回收周期。',
  },
  {
    id: 'ops_architect',
    name: 'Operations Architect',
    prompt: '聚焦落地复杂度、流程依赖与执行里程碑。',
  },
  {
    id: 'customer_voice',
    name: 'Customer Voice',
    prompt: '聚焦用户价值、体验影响、留存和反馈闭环。',
  },
];

const STATUS_TONE = {
  queued: 'info',
  running: 'warning',
  completed: 'success',
  failed: 'danger',
  canceled: 'warning',
};

function formatSessionTime(iso) {
  if (!iso) return '--';
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return '--';
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return '刚刚';
  if (mins < 60) return `${mins} 分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  return `${days} 天前`;
}

export default function BrainstormModal({ isOpen, onClose, onAdopt, onOpenReport }) {
  const [taskTitle, setTaskTitle] = useState('');
  const [task, setTask] = useState('');
  const [context, setContext] = useState('');
  const [synthesisStyle, setSynthesisStyle] = useState('');
  const [rounds, setRounds] = useState(1);
  const [agentCount, setAgentCount] = useState(4);
  const [parallel, setParallel] = useState(true);
  const [selectedRoleIds, setSelectedRoleIds] = useState(ROLE_PRESETS.slice(0, 4).map((r) => r.id));
  const [customRoles, setCustomRoles] = useState([]);
  const [contextFiles, setContextFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sessions, setSessions] = useState([]);
  const [selectedSessionId, setSelectedSessionId] = useState('');
  const [selectedSessionDetail, setSelectedSessionDetail] = useState(null);

  const selectedModel = typeof window === 'undefined'
    ? 'deepseek-chat'
    : (localStorage.getItem('sqlAgentModel') || 'deepseek-chat');

  const refreshSessions = useCallback(async (keepSelected = true) => {
    const response = await fetchBrainstormSessions();
    if (!response.success) return;
    const nextSessions = response.sessions || [];
    setSessions(nextSessions);
    if (!keepSelected || !selectedSessionId) {
      setSelectedSessionId(nextSessions[0]?.session_id || '');
      return;
    }
    if (!nextSessions.some((item) => item.session_id === selectedSessionId)) {
      setSelectedSessionId(nextSessions[0]?.session_id || '');
    }
  }, [selectedSessionId]);

  const refreshSelectedSession = useCallback(async () => {
    if (!selectedSessionId) {
      setSelectedSessionDetail(null);
      return;
    }
    const response = await fetchBrainstormSession(selectedSessionId);
    if (!response.success) return;
    setSelectedSessionDetail(response.session);
  }, [selectedSessionId]);

  useEffect(() => {
    if (!isOpen) return;
    setError('');
    refreshSessions(false);
  }, [isOpen, refreshSessions]);

  useEffect(() => {
    if (!isOpen) return;
    refreshSelectedSession();
  }, [selectedSessionId, isOpen, refreshSelectedSession]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const timer = setInterval(async () => {
      await refreshSessions(true);
      await refreshSelectedSession();
    }, 2200);
    return () => clearInterval(timer);
  }, [isOpen, selectedSessionId, refreshSessions, refreshSelectedSession]);

  if (!isOpen) return null;

  const handleToggleRole = (roleId) => {
    setSelectedRoleIds((previous) =>
      previous.includes(roleId)
        ? previous.filter((id) => id !== roleId)
        : [...previous, roleId]
    );
  };

  const handleAddCustomRole = () => {
    setCustomRoles((previous) => [
      ...previous,
      { id: `custom_${Date.now()}`, name: '', prompt: '', temperature: 0.25 },
    ]);
  };

  const handleUpdateCustomRole = (id, key, value) => {
    setCustomRoles((previous) =>
      previous.map((role) =>
        role.id === id
          ? { ...role, [key]: key === 'temperature' ? Number(value) : value }
          : role
      )
    );
  };

  const handleRemoveCustomRole = (id) => {
    setCustomRoles((previous) => previous.filter((role) => role.id !== id));
  };

  const handleUploadContextFile = async (fileList) => {
    if (!fileList || fileList.length === 0) return;
    setBusy(true);
    setError('');
    try {
      const uploaded = [];
      for (const file of Array.from(fileList)) {
        const result = await uploadFile(file);
        if (!result.success) {
          throw new Error(result.message || `上传 ${file.name} 失败`);
        }
        uploaded.push({
          name: result.original_name,
          filename: result.filename,
          url: result.url || getUploadUrl(result.filename),
          size: result.size,
        });
      }
      setContextFiles((previous) => [...previous, ...uploaded]);
    } catch (e) {
      setError(e.message || '附件上传失败');
    } finally {
      setBusy(false);
    }
  };

  const handleCreateSession = async () => {
    if (!task.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      const apiKey = localStorage.getItem('sqlAgentApiKey') || '';
      const baseUrl = localStorage.getItem('sqlAgentBaseUrl') || '';
      const response = await createBrainstormSession({
        title: taskTitle.trim(),
        task,
        context,
        model: selectedModel,
        api_key: apiKey,
        base_url: baseUrl,
        selected_role_ids: selectedRoleIds,
        custom_roles: customRoles.filter((role) => role.name.trim() || role.prompt.trim()),
        context_files: contextFiles.map((file) => ({ name: file.name, url: file.url })),
        agent_count: agentCount,
        rounds,
        parallel,
        synthesis_style: synthesisStyle,
        auto_start: true,
      });
      if (!response.success) {
        throw new Error(response.message || '创建会商任务失败');
      }
      await refreshSessions(false);
      setSelectedSessionId(response.session.session_id);
    } catch (e) {
      setError(e.message || '创建会商任务失败');
    } finally {
      setBusy(false);
    }
  };

  const handleStartSession = async () => {
    if (!selectedSessionId || busy) return;
    setBusy(true);
    setError('');
    try {
      const response = await startBrainstormSession(selectedSessionId, { force_restart: true });
      if (!response.success) {
        throw new Error(response.message || '启动失败');
      }
      await refreshSessions(true);
      await refreshSelectedSession();
    } catch (e) {
      setError(e.message || '启动失败');
    } finally {
      setBusy(false);
    }
  };

  const handleCancelSession = async () => {
    if (!selectedSessionId || busy) return;
    setBusy(true);
    setError('');
    try {
      const response = await cancelBrainstormSession(selectedSessionId);
      if (!response.success) {
        throw new Error(response.message || '取消失败');
      }
      await refreshSessions(true);
      await refreshSelectedSession();
    } catch (e) {
      setError(e.message || '取消失败');
    } finally {
      setBusy(false);
    }
  };

  const detailResult = selectedSessionDetail?.result;
  const specialists = detailResult?.specialists || [];

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm">
      <button className="absolute inset-0" onClick={onClose} aria-label="关闭群智镜议面板" />
      <div className="relative flex h-[90vh] w-full max-w-[1440px] overflow-hidden rounded-[30px] border border-zinc-200 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.2)]">
        <aside className="flex w-[340px] shrink-0 flex-col border-r border-zinc-200 bg-zinc-50/90">
          <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-zinc-900 text-white">
                <SparklesIcon size={16} />
              </div>
              <div>
                <div className="text-sm font-bold text-foreground">群智镜议</div>
                <div className="text-xs text-muted-foreground">Collective Deliberation Console</div>
              </div>
            </div>
            <button className={cn(ui.iconButton, 'rounded-xl')} onClick={onClose}>
              <CloseIcon size={18} />
            </button>
          </div>

          <div className="border-b border-zinc-200 px-4 py-3">
            <button
              className={cn(ui.buttonSecondary, 'w-full justify-center rounded-xl px-3 py-2 text-xs')}
              onClick={() => refreshSessions(true)}
            >
              <RefreshCwIcon size={14} />
              刷新任务列表
            </button>
          </div>

          <div className="sidebar-scroller min-h-0 flex-1 overflow-y-auto p-3">
            {sessions.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-4 text-xs text-zinc-500">
                还没有会商任务，右侧创建后会在这里持续跟踪进度。
              </div>
            ) : (
              <div className="space-y-2">
                {sessions.map((session) => (
                  <button
                    key={session.session_id}
                    className={cn(
                      'w-full rounded-2xl border px-3 py-2.5 text-left transition',
                      selectedSessionId === session.session_id
                        ? 'border-brand-200 bg-brand-50/70'
                        : 'border-zinc-200 bg-white hover:border-zinc-300'
                    )}
                    onClick={() => setSelectedSessionId(session.session_id)}
                  >
                    <div className="truncate text-sm font-semibold text-zinc-900">{session.title || '未命名任务'}</div>
                    <div className="mt-1 line-clamp-2 text-xs text-zinc-600">{session.task}</div>
                    <div className="mt-2 flex items-center justify-between">
                      <StatusBadge tone={STATUS_TONE[session.status] || 'info'}>{session.status}</StatusBadge>
                      <span className="text-[11px] text-zinc-500">{formatSessionTime(session.updated_at)}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </aside>

        <main className="grid min-w-0 flex-1 grid-cols-1 xl:grid-cols-[460px_minmax(0,1fr)]">
          <section className="sidebar-scroller min-h-0 overflow-y-auto border-b border-zinc-200 p-5 xl:border-b-0 xl:border-r">
            <div className="mb-4 text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-500">Create Session</div>

            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-semibold text-zinc-600">任务名称</label>
                <input
                  className={cn(ui.input, 'rounded-xl')}
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                  placeholder="例如：Q2 转化率异动复盘"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-zinc-600">核心任务</label>
                <textarea
                  rows={5}
                  className={cn(ui.textarea, 'min-h-[130px] rounded-xl text-sm leading-7')}
                  value={task}
                  onChange={(e) => setTask(e.target.value)}
                  placeholder="描述要会商的问题、目标、验收标准。"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-zinc-600">上下文</label>
                <textarea
                  rows={4}
                  className={cn(ui.textareaMuted, 'min-h-[110px] rounded-xl text-sm leading-7')}
                  value={context}
                  onChange={(e) => setContext(e.target.value)}
                  placeholder="补充业务背景、历史结论、边界条件。"
                />
              </div>

              <div>
                <label className="mb-2 block text-xs font-semibold text-zinc-600">预设角色</label>
                <div className="grid grid-cols-2 gap-2">
                  {ROLE_PRESETS.map((role) => (
                    <button
                      key={role.id}
                      className={cn(
                        'rounded-xl border px-2.5 py-2 text-left text-xs transition',
                        selectedRoleIds.includes(role.id)
                          ? 'border-brand-200 bg-brand-50 text-brand-700'
                          : 'border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300'
                      )}
                      onClick={() => handleToggleRole(role.id)}
                    >
                      <div className="font-semibold">{role.name}</div>
                      <div className="mt-1 line-clamp-2 text-[11px] opacity-80">{role.prompt}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label className="text-xs font-semibold text-zinc-600">自定义角色</label>
                  <button className={cn(ui.buttonSecondary, 'rounded-lg px-2.5 py-1 text-xs')} onClick={handleAddCustomRole}>
                    <PlusIcon size={13} />
                    添加
                  </button>
                </div>
                <div className="space-y-2">
                  {customRoles.map((role) => (
                    <div key={role.id} className="rounded-xl border border-zinc-200 bg-white p-2.5">
                      <div className="mb-2 flex items-center gap-2">
                        <input
                          className={cn(ui.input, 'h-8 rounded-lg px-2 text-xs')}
                          value={role.name}
                          onChange={(e) => handleUpdateCustomRole(role.id, 'name', e.target.value)}
                          placeholder="角色名"
                        />
                        <input
                          type="number"
                          min="0"
                          max="1"
                          step="0.05"
                          className={cn(ui.input, 'h-8 w-24 rounded-lg px-2 text-xs')}
                          value={role.temperature}
                          onChange={(e) => handleUpdateCustomRole(role.id, 'temperature', e.target.value)}
                        />
                        <button className={cn(ui.iconButton, 'rounded-lg p-1.5')} onClick={() => handleRemoveCustomRole(role.id)}>
                          <TrashIcon size={13} />
                        </button>
                      </div>
                      <textarea
                        rows={3}
                        className={cn(ui.textareaMuted, 'min-h-[90px] rounded-lg p-2 text-xs leading-6')}
                        value={role.prompt}
                        onChange={(e) => handleUpdateCustomRole(role.id, 'prompt', e.target.value)}
                        placeholder="角色职责与分析风格"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-zinc-600">会商轮次</label>
                  <input
                    type="number"
                    min="1"
                    max="3"
                    className={cn(ui.input, 'h-9 rounded-xl px-2 text-xs')}
                    value={rounds}
                    onChange={(e) => setRounds(Number(e.target.value || 1))}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-zinc-600">Agent 数量</label>
                  <input
                    type="number"
                    min="1"
                    max="12"
                    className={cn(ui.input, 'h-9 rounded-xl px-2 text-xs')}
                    value={agentCount}
                    onChange={(e) => setAgentCount(Number(e.target.value || 1))}
                  />
                </div>
                <div className="flex items-end">
                  <button
                    className={cn(
                      ui.buttonSecondary,
                      'h-9 w-full justify-center rounded-xl px-2 text-xs',
                      parallel ? 'border-brand-200 bg-brand-50 text-brand-700' : ''
                    )}
                    onClick={() => setParallel((previous) => !previous)}
                  >
                    {parallel ? '并行模式' : '串行模式'}
                  </button>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-zinc-600">汇总风格</label>
                <input
                  className={cn(ui.inputMuted, 'rounded-xl')}
                  value={synthesisStyle}
                  onChange={(e) => setSynthesisStyle(e.target.value)}
                  placeholder="例如：偏董事会风格，强调 ROI 与风险缓释路径"
                />
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label className="text-xs font-semibold text-zinc-600">上下文附件</label>
                  <label className={cn(ui.buttonSecondary, 'cursor-pointer rounded-lg px-2.5 py-1 text-xs')}>
                    <DatabaseIcon size={13} />
                    上传
                    <input
                      type="file"
                      multiple
                      className="hidden"
                      onChange={(e) => handleUploadContextFile(e.target.files)}
                    />
                  </label>
                </div>
                <div className="space-y-1.5">
                  {contextFiles.map((file) => (
                    <div key={file.filename} className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-xs">
                      <a className="truncate text-brand-700 hover:underline" href={file.url} target="_blank" rel="noreferrer">{file.name}</a>
                      <button className="text-zinc-400 hover:text-rose-500" onClick={() => setContextFiles((previous) => previous.filter((item) => item.filename !== file.filename))}>
                        <CloseIcon size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-5 space-y-2">
              <div className="text-xs text-zinc-500">当前模型：{selectedModel}</div>
              <button
                className={cn(ui.buttonPrimary, 'w-full justify-center rounded-xl px-4 py-2.5 disabled:opacity-50')}
                onClick={handleCreateSession}
                disabled={busy || !task.trim()}
              >
                {busy ? '提交中...' : '启动群智镜议'}
              </button>
              {error && <InlineFeedback tone="danger" message={error} />}
            </div>
          </section>

          <section className="sidebar-scroller min-h-0 overflow-y-auto bg-[linear-gradient(180deg,#f8fafc_0%,#f3f4f6_100%)] p-5">
            {!selectedSessionId ? (
              <EmptyState
                icon={<MessageIcon size={28} />}
                title="选择一个会商任务"
                description="左侧可创建新任务，或选择已有任务查看后台讨论进度与最终结论。"
              />
            ) : !selectedSessionDetail ? (
              <LoadingState title="正在读取任务详情" description="请稍候..." />
            ) : (
              <div className="mx-auto max-w-5xl space-y-5">
                <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-xs uppercase tracking-[0.2em] text-zinc-500">Session</div>
                      <div className="mt-1 text-lg font-semibold text-zinc-900">{selectedSessionDetail.title}</div>
                      <div className="mt-1 text-sm text-zinc-600">{selectedSessionDetail.task}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge tone={STATUS_TONE[selectedSessionDetail.status] || 'info'}>{selectedSessionDetail.status}</StatusBadge>
                      <button className={cn(ui.buttonSecondary, 'rounded-lg px-3 py-1.5 text-xs')} onClick={handleStartSession}>
                        重启
                      </button>
                      <button className={cn(ui.buttonSecondary, 'rounded-lg px-3 py-1.5 text-xs')} onClick={handleCancelSession}>
                        取消
                      </button>
                    </div>
                  </div>
                </div>

                {selectedSessionDetail.status === 'running' && (
                  <LoadingState title="镜议进行中" description="关闭窗口不会中断任务，可在任务列表持续追踪。" />
                )}

                {selectedSessionDetail.error && (
                  <InlineFeedback tone="danger" title="任务失败" message={selectedSessionDetail.error} />
                )}

                {detailResult?.final_report && (
                  <section className="rounded-3xl border border-zinc-200 bg-white p-7 shadow-sm">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <CheckIcon size={16} className="text-green-600" />
                        <h2 className="text-lg font-bold text-foreground">最终镜议结论</h2>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          className={cn(ui.buttonSecondary, 'rounded-xl px-3 py-2 text-xs')}
                          onClick={() => onAdopt?.(detailResult.final_report)}
                        >
                          发送到主对话
                        </button>
                        <button
                          className={cn(ui.buttonSecondary, 'rounded-xl px-3 py-2 text-xs')}
                          onClick={() => onOpenReport?.(buildDecisionReport(detailResult))}
                        >
                          打开报告画布
                        </button>
                      </div>
                    </div>
                    <div className="whitespace-pre-wrap text-[15px] leading-8 text-foreground">
                      {detailResult.final_report}
                    </div>
                  </section>
                )}

                {specialists.length > 0 && (
                  <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                    {specialists.map((item, index) => (
                      <div key={`${item.role_id}-${item.round}-${index}`} className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
                        <div className="mb-2 flex items-center justify-between">
                          <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                            {item.role} · Round {item.round}
                          </div>
                          <div className="text-[11px] text-zinc-400">{item.elapsed_ms} ms</div>
                        </div>
                        <div className="whitespace-pre-wrap text-sm leading-7 text-foreground/90">
                          {item.content}
                        </div>
                      </div>
                    ))}
                  </section>
                )}

                {!detailResult?.final_report && selectedSessionDetail.status === 'completed' && (
                  <EmptyState
                    icon={<MessageIcon size={22} />}
                    title="任务已完成但无汇总内容"
                    description="可尝试重启任务并提高角色数量或补充上下文。"
                  />
                )}
              </div>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}
