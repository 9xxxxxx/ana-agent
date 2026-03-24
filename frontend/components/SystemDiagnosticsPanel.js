'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchSystemDiagnostics } from '@/lib/api';
import {
  AlertCircleIcon,
  CheckCircleIcon,
  InfoIcon,
  RefreshCwIcon,
  XCircleIcon,
} from './Icons';
import ModalShell from './ModalShell';
import { useToast } from './Toast';
import { cn, ui, DataStatCard, SectionCard, ToolbarButton } from './ui';
import { LoadingState, ListSkeleton, StatsSkeleton } from './status';

function CheckStatusBadge({ status }) {
  if (status === 'pass') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
        <CheckCircleIcon size={12} />
        PASS
      </span>
    );
  }

  if (status === 'fail') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700">
        <XCircleIcon size={12} />
        FAIL
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
      <AlertCircleIcon size={12} />
      WARN
    </span>
  );
}

export default function SystemDiagnosticsPanel({ isOpen, onClose }) {
  const { error } = useToast();
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(false);

  const loadDiagnostics = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchSystemDiagnostics();
      if (!res.success) {
        throw new Error(res.message || '读取系统诊断失败');
      }
      setPayload(res.diagnostics);
    } catch (err) {
      error(err.message || '读取系统诊断失败');
    } finally {
      setLoading(false);
    }
  }, [error]);

  useEffect(() => {
    if (!isOpen) return;
    loadDiagnostics();
  }, [isOpen, loadDiagnostics]);

  const groupedChecks = useMemo(() => {
    const groups = {
      environment: [],
      dependency: [],
      storage: [],
      runtime: [],
    };

    for (const item of payload?.checks || []) {
      const key = item.category || 'runtime';
      groups[key] = [...(groups[key] || []), item];
    }
    return groups;
  }, [payload]);

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="max-w-6xl"
      heightClass="max-h-[90vh]"
      bodyClass="bg-zinc-50 p-8"
      title={
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-500">System Diagnostics</div>
          <div className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-zinc-950">启动前检查与环境诊断</div>
        </div>
      }
      headerRight={
        <ToolbarButton onClick={loadDiagnostics} className="rounded-xl px-4 py-2">
          <RefreshCwIcon size={14} />
          刷新诊断
        </ToolbarButton>
      }
    >
      {loading ? (
        <div className="space-y-6">
          <LoadingState title="正在执行环境诊断" description="检查环境变量、关键依赖、元数据文件和运行时状态。" />
          <StatsSkeleton count={3} />
          <div className="grid gap-4 xl:grid-cols-2">
            <ListSkeleton count={2} />
            <ListSkeleton count={2} />
          </div>
        </div>
      ) : (
        <div className="space-y-8">
          <div className="grid gap-4 md:grid-cols-3">
            <DataStatCard label="Pass" value={payload?.summary?.pass || 0} tone="success" />
            <DataStatCard label="Warn" value={payload?.summary?.warn || 0} tone="warning" />
            <DataStatCard label="Fail" value={payload?.summary?.fail || 0} tone="danger" />
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            {[
              ['environment', '环境变量'],
              ['dependency', '关键依赖'],
              ['storage', '元数据与文件存储'],
              ['runtime', '运行时状态'],
            ].map(([key, label]) => (
              <SectionCard key={key} title={label} actions={<InfoIcon size={16} className="text-zinc-500" />}>
                <div className="space-y-3">
                  {(groupedChecks[key] || []).map((item) => (
                    <div key={item.name} className={cn(ui.card, 'p-4')}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-zinc-900">{item.name}</div>
                          <div className="mt-1 text-sm leading-6 text-zinc-600">{item.detail}</div>
                          {item.fix && (
                            <div className="mt-2 rounded-xl bg-white px-3 py-2 text-xs leading-6 text-zinc-500">
                              修复建议: {item.fix}
                            </div>
                          )}
                        </div>
                        <CheckStatusBadge status={item.status} />
                      </div>
                    </div>
                  ))}
                </div>
              </SectionCard>
            ))}
          </div>

          <SectionCard title="启动命令" description="当前项目的本地启动方式与 Prefect 运行模式。">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-2xl bg-zinc-50 px-4 py-4">
                <div className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">Backend</div>
                <div className="mt-2 break-all font-mono text-sm text-zinc-800">{payload?.startup?.python}</div>
              </div>
              <div className="rounded-2xl bg-zinc-50 px-4 py-4">
                <div className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">Frontend</div>
                <div className="mt-2 break-all font-mono text-sm text-zinc-800">{payload?.startup?.frontend}</div>
              </div>
              <div className="rounded-2xl bg-zinc-50 px-4 py-4">
                <div className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">Prefect</div>
                <div className="mt-2 text-sm text-zinc-800">{payload?.startup?.prefect}</div>
              </div>
            </div>
          </SectionCard>
        </div>
      )}
    </ModalShell>
  );
}
