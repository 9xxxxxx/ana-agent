'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchSystemDiagnostics } from '@/lib/api';
import {
  AlertCircleIcon,
  CheckCircleIcon,
  CloseIcon,
  InfoIcon,
  RefreshCwIcon,
  XCircleIcon,
} from './Icons';
import { useToast } from './Toast';

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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[10002] flex items-center justify-center bg-black/45 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="max-h-[90vh] w-full max-w-6xl overflow-hidden rounded-[30px] border border-zinc-200 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.2)]">
        <div className="flex items-center justify-between border-b border-zinc-200 px-8 py-6">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-500">System Diagnostics</div>
            <div className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-zinc-950">启动前检查与环境诊断</div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={loadDiagnostics}
              className="inline-flex items-center gap-2 rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-foreground transition hover:bg-zinc-50"
            >
              <RefreshCwIcon size={14} />
              刷新诊断
            </button>
            <button onClick={onClose} className="rounded-full p-2 text-muted-foreground transition hover:bg-zinc-100">
              <CloseIcon size={18} />
            </button>
          </div>
        </div>

        <div className="max-h-[calc(90vh-88px)] overflow-y-auto bg-zinc-50 p-8">
          {loading ? (
            <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">正在执行环境诊断...</div>
          ) : (
            <div className="space-y-8">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-3xl border border-emerald-200 bg-white p-5 shadow-sm">
                  <div className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-600">Pass</div>
                  <div className="mt-3 text-4xl font-semibold text-zinc-950">{payload?.summary?.pass || 0}</div>
                </div>
                <div className="rounded-3xl border border-amber-200 bg-white p-5 shadow-sm">
                  <div className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-700">Warn</div>
                  <div className="mt-3 text-4xl font-semibold text-zinc-950">{payload?.summary?.warn || 0}</div>
                </div>
                <div className="rounded-3xl border border-rose-200 bg-white p-5 shadow-sm">
                  <div className="text-xs font-semibold uppercase tracking-[0.2em] text-rose-600">Fail</div>
                  <div className="mt-3 text-4xl font-semibold text-zinc-950">{payload?.summary?.fail || 0}</div>
                </div>
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                {[
                  ['environment', '环境变量'],
                  ['dependency', '关键依赖'],
                  ['storage', '元数据与文件存储'],
                  ['runtime', '运行时状态'],
                ].map(([key, label]) => (
                  <section key={key} className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
                    <div className="mb-4 flex items-center gap-2">
                      <InfoIcon size={16} className="text-zinc-500" />
                      <h3 className="text-lg font-semibold text-zinc-950">{label}</h3>
                    </div>
                    <div className="space-y-3">
                      {(groupedChecks[key] || []).map((item) => (
                        <div key={item.name} className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
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
                  </section>
                ))}
              </div>

              <section className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
                <h3 className="text-lg font-semibold text-zinc-950">启动命令</h3>
                <div className="mt-4 grid gap-3 md:grid-cols-3">
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
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
