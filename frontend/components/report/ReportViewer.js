'use client';

import { useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import ReportCanvas from './ReportCanvas';
import DataTable from './DataTable';
import MetricCard from './MetricCard';
import SmartChart from '../charts/SmartChart';
import {
  BarChartIcon,
  BookOpenIcon,
  CloseIcon,
  DownloadIcon,
  EditIcon,
  LayersIcon,
  SaveIcon,
} from '../Icons';
import { parseChartPayload } from '@/lib/chartData';
import {
  exportCanvasToMarkdown,
  getBlockHeading,
  getCanvasStorageKey,
  getRunRecommendation,
  reportToCanvasBlocks,
} from '@/lib/reportCanvas';

function renderChartData(chartData) {
  const parsed = parseChartPayload(chartData);
  if (!parsed) return null;

  if (parsed.type === 'chart_data' && parsed.data) {
    return (
      <SmartChart
        data={parsed.data}
        chartType={parsed.chartType}
        title={parsed.title}
        xCol={parsed.xCol}
        yCol={parsed.yCol}
        colorCol={parsed.colorCol}
        sizeCol={parsed.sizeCol}
        height={360}
        showTypeSelector={false}
        showLibrarySelector={false}
      />
    );
  }

  if (parsed.data && parsed.layout) {
    const trace = parsed.data[0];
    const xData = trace.x || [];
    const yData = trace.y || [];
    const normalized = xData.map((x, index) => ({
      category: x,
      value: yData[index],
    }));

    return (
      <SmartChart
        data={normalized}
        chartType={trace.type === 'pie' ? 'pie' : trace.type === 'scatter' ? 'line' : 'bar'}
        title={parsed.layout.title?.text || ''}
        xCol="category"
        yCol="value"
        height={360}
        showTypeSelector={false}
        showLibrarySelector={false}
      />
    );
  }

  return null;
}

function PreviewBlock({ block }) {
  if (block.type === 'hero') {
    return (
      <section className="rounded-[32px] border border-zinc-200 bg-[linear-gradient(135deg,#ffffff_0%,#f8fafc_50%,#eef2f7_100%)] px-8 py-10 shadow-sm">
        <div className="inline-flex rounded-full border border-zinc-300 bg-white/90 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-600">
          {block.badge || 'Report'}
        </div>
        <h1 className="mt-5 max-w-4xl text-4xl font-semibold tracking-[-0.04em] text-zinc-950 md:text-5xl">
          {block.title}
        </h1>
        {block.subtitle && (
          <p className="mt-4 max-w-3xl text-lg leading-8 text-zinc-700">{block.subtitle}</p>
        )}
        <div className="mt-8 text-sm text-zinc-500">{block.createdAt}</div>
      </section>
    );
  }

  if (block.type === 'metrics') {
    return (
      <section className="rounded-[28px] border border-stone-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold tracking-tight text-stone-950">{block.title}</h2>
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {(block.items || []).map((item, index) => (
            <MetricCard key={index} {...item} title={item.title || item.label} />
          ))}
        </div>
      </section>
    );
  }

  if (block.type === 'decision') {
    return (
      <section className="rounded-[28px] border border-emerald-200 bg-[linear-gradient(180deg,#ffffff_0%,#effaf4_100%)] p-6 shadow-sm">
        <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-600">Decision</div>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-stone-950">{block.title}</h2>
        <div className="mt-5 rounded-[24px] bg-white px-5 py-4 text-lg font-semibold text-stone-950">{block.verdict}</div>
        <div className="mt-4 rounded-[24px] bg-white/80 px-5 py-4 text-sm leading-7 text-stone-700">{block.rationale}</div>
        <div className="mt-4 rounded-[24px] bg-emerald-50 px-5 py-4 text-sm font-medium text-emerald-800">下一步: {block.nextStep}</div>
      </section>
    );
  }

  if (block.type === 'decision_flow') {
    const columns = [
      { key: 'specialist', label: '专家观点' },
      { key: 'evidence', label: '支撑证据' },
      { key: 'debate', label: '争议保留' },
      { key: 'action', label: '落地动作' },
    ];

    const statusTone = (status) => {
      if (status === 'adopted') return 'bg-emerald-50 text-emerald-700';
      if (status === 'challenged') return 'bg-rose-50 text-rose-700';
      return 'bg-amber-50 text-amber-700';
    };

    const strengthTone = (strength) => {
      if (strength === 'high') return 'bg-stone-900 text-white';
      if (strength === 'low') return 'bg-stone-100 text-stone-500';
      return 'bg-stone-200 text-stone-700';
    };

    return (
      <section className="rounded-[28px] border border-stone-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-stone-950">{block.title}</h2>
            <div className="mt-2 text-sm leading-7 text-stone-600">最终决策: {block.decision}</div>
          </div>
        </div>
        <div className="mt-5 grid gap-4 xl:grid-cols-4">
          {columns.map((column) => {
            const items = (block.nodes || []).filter((node) => node.kind === column.key);
            return (
              <div key={column.key} className="rounded-[24px] border border-stone-200 bg-stone-50/70 p-4">
                <div className="text-sm font-semibold text-stone-900">{column.label}</div>
                <div className="mt-3 space-y-3">
                  {items.map((item) => (
                    <div key={item.id} className="rounded-[20px] border border-stone-200 bg-white p-4">
                      <div className="text-sm font-semibold text-stone-900">{item.label}</div>
                      <div className="mt-2 text-sm leading-6 text-stone-600">{item.detail}</div>
                      <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
                        <span className={`rounded-full px-2.5 py-1 ${statusTone(item.status)}`}>{item.status}</span>
                        <span className={`rounded-full px-2.5 py-1 ${strengthTone(item.strength)}`}>{item.strength}</span>
                      </div>
                    </div>
                  ))}
                  {items.length === 0 && (
                    <div className="rounded-[20px] border border-dashed border-stone-200 bg-white/80 px-4 py-5 text-sm text-stone-400">
                      暂无节点
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    );
  }

  if (block.type === 'evidence') {
    return (
      <section className="rounded-[28px] border border-stone-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold tracking-tight text-stone-950">{block.title}</h2>
        <div className="mt-5 grid gap-3">
          {(block.items || []).map((item, index) => (
            <div key={index} className="rounded-[24px] border border-stone-200 bg-stone-50/70 p-4">
              <div className="text-sm font-semibold text-stone-900">{item.claim}</div>
              <div className="mt-2 text-sm leading-7 text-stone-700">{item.evidence}</div>
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (block.type === 'debate') {
    return (
      <section className="rounded-[28px] border border-amber-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold tracking-tight text-stone-950">{block.title}</h2>
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {(block.items || []).map((item, index) => (
            <div key={index} className="rounded-[24px] border border-amber-100 bg-amber-50/60 p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">{item.perspective}</div>
              <div className="mt-2 text-sm leading-7 text-stone-700">{item.point}</div>
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (block.type === 'chart') {
    return (
      <section className="rounded-[28px] border border-stone-200 bg-white p-6 shadow-sm">
        <div className="mb-5 flex items-center gap-2 text-stone-900">
          <BarChartIcon size={16} />
          <h2 className="text-xl font-semibold tracking-tight">{block.title}</h2>
        </div>
        <div className="rounded-[24px] border border-stone-200 bg-stone-50/60 p-4">
          {renderChartData(block.chartData) || (
            <div className="rounded-2xl bg-white p-8 text-center text-sm text-stone-500">图表暂不可用</div>
          )}
        </div>
        {block.note && (
          <div className="mt-4 rounded-[22px] bg-stone-50 px-5 py-4 text-sm leading-7 text-stone-700">
            {block.note}
          </div>
        )}
      </section>
    );
  }

  if (block.type === 'table') {
    return (
      <section className="rounded-[28px] border border-stone-200 bg-white p-6 shadow-sm overflow-hidden">
        <div className="mb-5 flex items-center gap-2 text-stone-900">
          <LayersIcon size={16} />
          <h2 className="text-xl font-semibold tracking-tight">{block.title}</h2>
        </div>
        <DataTable
          title={null}
          pageSize={6}
          searchable={false}
          exportable={false}
          data={block.rows || []}
          columns={block.columns || []}
        />
      </section>
    );
  }

  if (block.type === 'checklist') {
    return (
      <section className="rounded-[28px] border border-amber-200 bg-amber-50/60 p-6 shadow-sm">
        <h2 className="text-xl font-semibold tracking-tight text-stone-950">{block.title}</h2>
        {(block.content || '').trim() && (
          <div className="prose mt-4 max-w-none text-stone-700">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{block.content}</ReactMarkdown>
          </div>
        )}
        <div className="mt-5 space-y-3">
          {(block.items || []).map((item, index) => (
            <div key={item.id || index} className="flex items-center gap-3 rounded-2xl border border-white/90 bg-white px-4 py-3">
              <input type="checkbox" checked={!!item.checked} readOnly />
              <span className={`text-sm ${item.checked ? 'text-stone-400 line-through' : 'text-stone-800'}`}>{item.text}</span>
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (block.type === 'action_items') {
    const grouped = {
      todo: (block.items || []).filter((item) => (item.status || 'todo') === 'todo'),
      doing: (block.items || []).filter((item) => item.status === 'doing'),
      done: (block.items || []).filter((item) => item.status === 'done'),
    };
    return (
      <section className="rounded-[28px] border border-stone-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold tracking-tight text-stone-950">{block.title}</h2>
        <div className="mt-5 grid gap-4 xl:grid-cols-3">
          {[
            { key: 'todo', label: '待办' },
            { key: 'doing', label: '进行中' },
            { key: 'done', label: '已完成' },
          ].map((column) => (
            <div key={column.key} className="rounded-[24px] border border-stone-200 bg-stone-50/70 p-4">
              <div className="text-sm font-semibold text-stone-900">{column.label}</div>
              <div className="mt-3 space-y-3">
                {grouped[column.key].map((item, index) => {
                  const priorityTone = item.priority === 'high'
                    ? 'bg-rose-50 text-rose-600'
                    : item.priority === 'low'
                      ? 'bg-stone-100 text-stone-500'
                      : 'bg-amber-50 text-amber-700';

                  return (
                    <div key={item.id || index} className="rounded-[20px] border border-stone-200 bg-white p-4">
                      <div className="text-sm font-semibold text-stone-900">{item.title}</div>
                      <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold">
                        <span className="rounded-full bg-stone-100 px-2.5 py-1 text-stone-600">{item.owner}</span>
                        <span className="rounded-full bg-stone-100 px-2.5 py-1 text-stone-600">{item.dueDate}</span>
                        <span className={`rounded-full px-2.5 py-1 ${priorityTone}`}>{item.priority}</span>
                        {item.linkedDeploymentName && (
                          <span className="rounded-full bg-sky-50 px-2.5 py-1 text-sky-700">{item.linkedDeploymentName}</span>
                        )}
                        {item.lastRunState && (
                          <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700">{item.lastRunState}</span>
                        )}
                      </div>
                      {(item.lastRunState || item.lastRunMessage) && (
                        <div className="mt-3 rounded-2xl border border-stone-200 bg-stone-50/70 px-3 py-3 text-sm">
                          <div className="flex flex-wrap gap-2 text-xs font-semibold">
                            {item.linkedRunId && (
                              <span className="rounded-full bg-white px-2.5 py-1 text-stone-600">Run {item.linkedRunId.slice(0, 8)}</span>
                            )}
                            {item.lastRunStartedAt && (
                              <span className="rounded-full bg-white px-2.5 py-1 text-stone-600">开始: {item.lastRunStartedAt}</span>
                            )}
                            {item.lastRunEndedAt && (
                              <span className="rounded-full bg-white px-2.5 py-1 text-stone-600">结束: {item.lastRunEndedAt}</span>
                            )}
                          </div>
                          {item.lastRunMessage && (
                            <div className="mt-3 rounded-xl bg-white px-3 py-2 leading-6 text-stone-600">
                              {item.lastRunMessage}
                            </div>
                          )}
                          <div className="mt-3 rounded-xl bg-amber-50 px-3 py-2 leading-6 text-amber-800">
                            建议: {getRunRecommendation(item.lastRunState)}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
                {grouped[column.key].length === 0 && (
                  <div className="rounded-[20px] border border-dashed border-stone-200 bg-white/80 px-4 py-5 text-sm text-stone-400">
                    暂无事项
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (block.type === 'expert_opinion') {
    const tone =
      block.stance === 'risk'
        ? 'border-rose-200 bg-rose-50/60'
        : block.stance === 'strategy'
          ? 'border-violet-200 bg-violet-50/60'
          : 'border-sky-200 bg-sky-50/60';

    return (
      <section className={`rounded-[28px] border p-6 shadow-sm ${tone}`}>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-semibold tracking-tight text-stone-950">{block.title || block.role}</h2>
          <div className="rounded-full border border-white/80 bg-white/80 px-3 py-1 text-xs font-semibold text-stone-600">
            {block.role || '专家'}
          </div>
        </div>
        <div className="prose mt-4 max-w-none text-stone-700">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{block.content || ''}</ReactMarkdown>
        </div>
      </section>
    );
  }

  if (block.type === 'orchestration_snapshot') {
    return (
      <section className="rounded-[28px] border border-stone-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold tracking-tight text-stone-950">{block.title}</h2>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <div className="rounded-[22px] border border-stone-200 bg-stone-50/80 p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-stone-500">Deployments</div>
            <div className="mt-2 text-3xl font-semibold text-stone-900">{block.summary?.deployment_count ?? 0}</div>
          </div>
          <div className="rounded-[22px] border border-stone-200 bg-stone-50/80 p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-stone-500">Recent Runs</div>
            <div className="mt-2 text-3xl font-semibold text-stone-900">{block.summary?.recent_run_count ?? 0}</div>
          </div>
          <div className="rounded-[22px] border border-stone-200 bg-stone-50/80 p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-stone-500">Bound Runs</div>
            <div className="mt-2 text-3xl font-semibold text-stone-900">{block.summary?.deployment_run_count ?? 0}</div>
          </div>
        </div>
        {!!block.runs?.length && (
          <div className="mt-5 overflow-hidden rounded-[24px] border border-stone-200">
            <table className="min-w-full divide-y divide-stone-200 text-sm">
              <thead className="bg-stone-50 text-left text-xs uppercase tracking-[0.18em] text-stone-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">Run</th>
                  <th className="px-4 py-3 font-semibold">Deployment</th>
                  <th className="px-4 py-3 font-semibold">状态</th>
                  <th className="px-4 py-3 font-semibold">时间</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 bg-white text-stone-700">
                {block.runs.map((run, index) => (
                  <tr key={run.id || `${run.name}-${index}`}>
                    <td className="px-4 py-3 font-medium text-stone-900">{run.name || 'Unnamed run'}</td>
                    <td className="px-4 py-3">{run.deployment_name || 'Unassigned'}</td>
                    <td className="px-4 py-3">{run.state_name || 'Unknown'}</td>
                    <td className="px-4 py-3">{run.start_time || run.expected_start_time || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {block.note && <div className="mt-4 rounded-[22px] bg-stone-50 px-5 py-4 text-sm leading-7 text-stone-700">{block.note}</div>}
      </section>
    );
  }

  if (block.type === 'callout') {
    return (
      <section className="rounded-[28px] border border-blue-200 bg-blue-50/70 p-6 shadow-sm">
        <h2 className="text-xl font-semibold tracking-tight text-stone-950">{block.title}</h2>
        <div className="prose mt-4 max-w-none text-stone-700">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{block.content || ''}</ReactMarkdown>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-[28px] border border-stone-200 bg-white p-6 shadow-sm">
      <h2 className="text-xl font-semibold tracking-tight text-stone-950">{block.title}</h2>
      <div className="prose mt-4 max-w-none text-stone-700">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{block.content || ''}</ReactMarkdown>
      </div>
    </section>
  );
}

export default function ReportViewer({ report, onExport, onClose }) {
  const [mode, setMode] = useState('canvas');
  const storageKey = useMemo(() => getCanvasStorageKey(report), [report]);
  const [blocks, setBlocks] = useState(() => reportToCanvasBlocks(report));
  const [saveStatus, setSaveStatus] = useState('idle');

  useEffect(() => {
    if (!report) return;

    const fallbackBlocks = reportToCanvasBlocks(report);
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setBlocks(parsed);
          return;
        }
      }
    } catch {}

    setBlocks(fallbackBlocks);
  }, [report, storageKey]);

  useEffect(() => {
    if (!blocks?.length) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(blocks));
      setSaveStatus('saved');
      const timer = window.setTimeout(() => setSaveStatus('idle'), 1200);
      return () => window.clearTimeout(timer);
    } catch {
      setSaveStatus('error');
    }
  }, [blocks, storageKey]);

  if (!report) return null;

  const hero = blocks.find((block) => block.type === 'hero') || blocks[0];
  const navigableBlocks = blocks.filter((block) => block.type !== 'hero');

  const handleExport = () => {
    const markdown = exportCanvasToMarkdown(blocks);
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${hero?.title || report.title || 'report'}.md`;
    anchor.click();
    URL.revokeObjectURL(url);
    onExport?.('markdown');
  };

  return (
    <div className="flex h-full w-full bg-[linear-gradient(180deg,#f8fafc_0%,#f3f4f6_100%)] text-zinc-900">
      <aside className="hidden w-[280px] shrink-0 flex-col border-r border-zinc-200 bg-zinc-950 xl:flex">
        <div className="border-b border-zinc-800 px-6 py-6">
          <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-500">Decision Studio</div>
          <div className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-white">{hero?.title || report.title}</div>
          {hero?.subtitle && <p className="mt-3 text-sm leading-7 text-zinc-300">{hero.subtitle}</p>}
        </div>

        <div className="px-4 py-4">
          <div className="rounded-[24px] border border-zinc-800 bg-zinc-900 p-3">
            <button
              className={`flex w-full items-center gap-2 rounded-2xl px-3 py-3 text-sm font-medium transition ${mode === 'canvas' ? 'bg-white text-zinc-950' : 'text-zinc-300 hover:bg-zinc-800'}`}
              onClick={() => setMode('canvas')}
            >
              <EditIcon size={15} />
              画布编排
            </button>
            <button
              className={`mt-2 flex w-full items-center gap-2 rounded-2xl px-3 py-3 text-sm font-medium transition ${mode === 'preview' ? 'bg-white text-zinc-950' : 'text-zinc-300 hover:bg-zinc-800'}`}
              onClick={() => setMode('preview')}
            >
              <BookOpenIcon size={15} />
              成品预览
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-5">
          <div className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-500">Canvas Outline</div>
          <div className="space-y-2">
            {navigableBlocks.map((block, index) => (
              <div key={block.id} className="rounded-2xl border border-zinc-800 bg-zinc-900 px-3 py-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
                  {String(index + 1).padStart(2, '0')} · {block.type}
                </div>
                <div className="mt-1 text-sm font-medium text-zinc-100">{getBlockHeading(block)}</div>
              </div>
            ))}
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/90 backdrop-blur">
          <div className="flex flex-col gap-4 px-5 py-4 md:flex-row md:items-center md:justify-between md:px-8">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-500">Report Workbench</div>
              <div className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-zinc-950">
                {mode === 'canvas' ? '可编排报告画布' : '高保真成品预览'}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className={`inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-semibold ${saveStatus === 'error' ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-700'}`}>
                <SaveIcon size={14} />
                {saveStatus === 'saved' ? '草稿已保存' : saveStatus === 'error' ? '保存失败' : '自动保存开启'}
              </div>
              <button
                className="inline-flex items-center gap-2 rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition hover:border-zinc-400 hover:bg-zinc-50"
                onClick={handleExport}
              >
                <DownloadIcon size={14} />
                导出
              </button>
              {onClose && (
                <button
                  className="inline-flex items-center gap-2 rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition hover:border-zinc-400 hover:bg-zinc-50"
                  onClick={onClose}
                >
                  <CloseIcon size={14} />
                  关闭
                </button>
              )}
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto px-4 py-5 md:px-8 md:py-8">
          <div className="mx-auto max-w-6xl">
            {mode === 'canvas' ? (
              <ReportCanvas blocks={blocks} onChange={setBlocks} />
            ) : (
              <div className="space-y-5">
                {blocks.map((block) => (
                  <PreviewBlock key={block.id} block={block} />
                ))}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
