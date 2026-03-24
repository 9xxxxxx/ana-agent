'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  fetchOrchestrationRuntime,
  syncOrchestrationRuntime,
  triggerDeploymentRun,
} from '@/lib/api';
import {
  AlarmClockIcon,
  CheckCircleIcon,
  LayersIcon,
  PlayIcon,
  RefreshCwIcon,
  SparklesIcon,
} from './Icons';
import ModalShell from './ModalShell';
import { useToast } from './Toast';
import { cn, ui, DataStatCard, SectionCard, ToolbarButton } from './ui';
import { EmptyState, ListSkeleton, LoadingState, StatsSkeleton } from './status';

function formatTime(value) {
  if (!value) return '未记录';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', {
    hour12: false,
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getRunTone(stateName = '') {
  const normalized = String(stateName).toLowerCase();
  if (normalized.includes('completed')) return 'text-emerald-600 bg-emerald-50';
  if (normalized.includes('running')) return 'text-sky-600 bg-sky-50';
  if (normalized.includes('failed') || normalized.includes('crashed')) return 'text-rose-600 bg-rose-50';
  if (normalized.includes('scheduled') || normalized.includes('pending')) return 'text-amber-700 bg-amber-50';
  return 'text-gray-600 bg-gray-100';
}

export default function OrchestrationPanel({ isOpen, onClose }) {
  const { success, error } = useToast();
  const [runtime, setRuntime] = useState(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [runningDeploymentId, setRunningDeploymentId] = useState(null);

  const loadRuntime = useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true);
    }
    try {
      const res = await fetchOrchestrationRuntime();
      if (!res.success) {
        throw new Error(res.message || '加载任务编排状态失败');
      }
      setRuntime(res.runtime);
    } catch (err) {
      error(err.message || '加载任务编排状态失败');
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [error]);

  useEffect(() => {
    if (!isOpen) return undefined;
    loadRuntime();
    const timer = window.setInterval(() => loadRuntime(true), 8000);
    return () => window.clearInterval(timer);
  }, [isOpen, loadRuntime]);

  const deployments = runtime?.deployments ?? [];
  const runs = runtime?.runs ?? [];
  const flowMap = useMemo(() => {
    const next = new Map();
    (runtime?.deployments ?? []).forEach((deployment) => {
      next.set(deployment.id, deployment);
    });
    return next;
  }, [runtime?.deployments]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await syncOrchestrationRuntime();
      if (!res.success) {
        throw new Error(res.message || '同步失败');
      }
      setRuntime(res.runtime);
      success('Prefect deployments 已同步');
    } catch (err) {
      error(err.message || '同步失败');
    } finally {
      setSyncing(false);
    }
  };

  const handleRunDeployment = async (deploymentId) => {
    setRunningDeploymentId(deploymentId);
    try {
      const res = await triggerDeploymentRun(deploymentId);
      if (!res.success) {
        throw new Error(res.message || '触发 deployment 失败');
      }
      success('已触发 Prefect flow run');
      await loadRuntime(true);
    } catch (err) {
      error(err.message || '触发 deployment 失败');
    } finally {
      setRunningDeploymentId(null);
    }
  };

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="max-w-6xl"
      heightClass="max-h-[88vh]"
      bodyClass="bg-zinc-50 p-8"
      title={
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
            <LayersIcon size={22} />
          </div>
          <div>
            <div className="text-xl font-bold leading-tight text-foreground">任务编排与运行面板</div>
            <p className="mt-0.5 text-sm text-muted-foreground">直接观察 Prefect flows、deployments 与最近运行状态</p>
          </div>
        </div>
      }
      headerRight={
        <>
          <ToolbarButton onClick={() => loadRuntime()} className="rounded-xl px-4 py-2">
            <RefreshCwIcon size={16} />
            <span>刷新</span>
          </ToolbarButton>
          <ToolbarButton
            variant="primary"
            onClick={handleSync}
            disabled={syncing}
            className="rounded-xl px-4 py-2 disabled:opacity-60"
          >
            <SparklesIcon size={16} />
            <span>{syncing ? '同步中...' : '同步 Deployments'}</span>
          </ToolbarButton>
        </>
      }
    >
      {loading ? (
        <div className="space-y-6">
          <LoadingState title="正在加载 Prefect 运行态" description="同步 flows、deployments 与最近运行记录。" />
          <StatsSkeleton count={4} />
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.05fr,1.4fr]">
            <ListSkeleton count={2} />
            <ListSkeleton count={2} />
          </div>
        </div>
      ) : (
        <div className="space-y-8">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <DataStatCard label="Flows" value={runtime?.stats?.flow_count || 0} />
            <DataStatCard label="Deployments" value={runtime?.stats?.deployment_count || 0} />
            <DataStatCard label="Recent Runs" value={runtime?.stats?.recent_run_count || 0} />
            <DataStatCard label="Bound Runs" value={runtime?.stats?.deployment_run_count || 0} />
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.05fr,1.4fr]">
            <SectionCard title="Flow Catalog" description="当前已纳入编排层的标准流程">
              <div className="space-y-3">
                {(runtime?.flows || []).map((flow) => (
                  <div key={flow.id} className={cn(ui.card, 'p-4')}>
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="font-semibold text-foreground">{flow.name}</div>
                        <div className="mt-1 text-sm text-muted-foreground">{flow.description}</div>
                      </div>
                      <div className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-emerald-700">
                        {flow.engine}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </SectionCard>

            <SectionCard title="Deployments" description="目前主要托管 Watchdog 定时任务，支持即刻手动触发">
              {deployments.length === 0 ? (
                <div className="h-52">
                  <EmptyState
                    compact
                    icon={<LayersIcon size={24} />}
                    title="暂无 Prefect deployment"
                    description="先同步一次，或创建 Watchdog 规则后再观察编排运行状态。"
                  />
                </div>
              ) : (
                <div className="space-y-4">
                  {deployments.map((deployment) => (
                    <div key={deployment.id} className={cn(ui.card, 'p-4')}>
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="truncate font-semibold text-foreground">{deployment.name}</div>
                          <div className="mt-1 text-sm text-muted-foreground">{deployment.description || '暂无描述'}</div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {(deployment.tags || []).map((tag) => (
                              <span key={tag} className="rounded-full border border-zinc-200 bg-white px-2 py-1 text-[11px] font-medium text-muted-foreground">
                                {tag}
                              </span>
                            ))}
                            {(deployment.schedules || []).filter((item) => item.cron).map((item) => (
                              <span key={item.id || item.cron} className="rounded-full border border-amber-100 bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-700">
                                <AlarmClockIcon size={11} className="mr-1 inline" />
                                {item.cron}
                              </span>
                            ))}
                          </div>
                        </div>
                        <ToolbarButton
                          variant="primary"
                          onClick={() => handleRunDeployment(deployment.id)}
                          disabled={runningDeploymentId === deployment.id}
                          className="shrink-0 rounded-xl px-3 py-2 disabled:opacity-60"
                        >
                          <PlayIcon size={14} />
                          <span>{runningDeploymentId === deployment.id ? '触发中...' : '立即运行'}</span>
                        </ToolbarButton>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
          </div>

          <SectionCard
            title="Recent Flow Runs"
            description="最近的执行记录，便于观察调度是否稳定、是否有失败或排队"
          >
            {runs.length === 0 ? (
              <div className="h-40">
                <EmptyState compact title="暂无 flow run 记录" description="触发一次 deployment 后，这里会出现最近执行记录。" />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-sm">
                  <thead>
                    <tr className="border-b border-zinc-200 text-left text-muted-foreground">
                      <th className="pb-3 font-medium">Run</th>
                      <th className="pb-3 font-medium">Deployment</th>
                      <th className="pb-3 font-medium">状态</th>
                      <th className="pb-3 font-medium">计划时间</th>
                      <th className="pb-3 font-medium">开始时间</th>
                      <th className="pb-3 font-medium">结束时间</th>
                    </tr>
                  </thead>
                  <tbody>
                    {runs.map((run) => {
                      const deployment = run.deployment_id ? flowMap.get(run.deployment_id) : null;
                      return (
                        <tr key={run.id} className="border-b border-zinc-100 last:border-b-0">
                          <td className="py-3.5">
                            <div className="font-medium text-foreground">{run.name || run.id.slice(0, 8)}</div>
                            <div className="mt-1 text-xs text-muted-foreground">{run.id}</div>
                          </td>
                          <td className="py-3.5">
                            <div className="text-foreground">{deployment?.name || '直接运行 / 未绑定'}</div>
                          </td>
                          <td className="py-3.5">
                            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${getRunTone(run.state_name)}`}>
                              <CheckCircleIcon size={12} />
                              {run.state_name || 'Unknown'}
                            </span>
                          </td>
                          <td className="py-3.5 text-muted-foreground">{formatTime(run.expected_start_time || run.next_scheduled_start_time)}</td>
                          <td className="py-3.5 text-muted-foreground">{formatTime(run.start_time)}</td>
                          <td className="py-3.5 text-muted-foreground">{formatTime(run.end_time)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
        </div>
      )}
    </ModalShell>
  );
}
