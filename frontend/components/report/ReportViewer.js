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
      <section className="rounded-[32px] border border-stone-200 bg-[linear-gradient(135deg,#fffdf7_0%,#f5efe2_45%,#efe6d3_100%)] px-8 py-10 shadow-sm">
        <div className="inline-flex rounded-full border border-stone-300 bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-stone-600">
          {block.badge || 'Report'}
        </div>
        <h1 className="mt-5 max-w-4xl text-4xl font-semibold tracking-[-0.04em] text-stone-950 md:text-5xl">
          {block.title}
        </h1>
        {block.subtitle && (
          <p className="mt-4 max-w-3xl text-lg leading-8 text-stone-700">{block.subtitle}</p>
        )}
        <div className="mt-8 text-sm text-stone-500">{block.createdAt}</div>
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
    return (
      <section className="rounded-[28px] border border-stone-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold tracking-tight text-stone-950">{block.title}</h2>
        <div className="mt-5 space-y-3">
          {(block.items || []).map((item, index) => {
            const tone = item.status === 'done'
              ? 'bg-emerald-50 text-emerald-700'
              : item.status === 'doing'
                ? 'bg-sky-50 text-sky-700'
                : 'bg-stone-100 text-stone-600';
            const priorityTone = item.priority === 'high'
              ? 'bg-rose-50 text-rose-600'
              : item.priority === 'low'
                ? 'bg-stone-100 text-stone-500'
                : 'bg-amber-50 text-amber-700';

            return (
              <div key={item.id || index} className="rounded-[24px] border border-stone-200 bg-stone-50/60 p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className="text-base font-semibold text-stone-900">{item.title}</div>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold">
                      <span className="rounded-full bg-white px-3 py-1 text-stone-600 border border-stone-200">Owner · {item.owner}</span>
                      <span className="rounded-full bg-white px-3 py-1 text-stone-600 border border-stone-200">Due · {item.dueDate}</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs font-semibold">
                    <span className={`rounded-full px-3 py-1 ${priorityTone}`}>Priority · {item.priority}</span>
                    <span className={`rounded-full px-3 py-1 ${tone}`}>Status · {item.status}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
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
    <div className="flex h-full w-full bg-[linear-gradient(180deg,#f4ecdf_0%,#efe6d7_30%,#f8f4ea_100%)] text-stone-900">
      <aside className="hidden xl:flex w-[280px] shrink-0 flex-col border-r border-stone-200/80 bg-[#f3ebdc]/90">
        <div className="border-b border-stone-200/80 px-6 py-6">
          <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-stone-500">Decision Studio</div>
          <div className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-stone-950">{hero?.title || report.title}</div>
          {hero?.subtitle && <p className="mt-3 text-sm leading-7 text-stone-600">{hero.subtitle}</p>}
        </div>

        <div className="px-4 py-4">
          <div className="rounded-[24px] border border-stone-200 bg-white/80 p-3">
            <button
              className={`flex w-full items-center gap-2 rounded-2xl px-3 py-3 text-sm font-medium transition ${mode === 'canvas' ? 'bg-stone-900 text-white' : 'text-stone-600 hover:bg-stone-100'}`}
              onClick={() => setMode('canvas')}
            >
              <EditIcon size={15} />
              画布编排
            </button>
            <button
              className={`mt-2 flex w-full items-center gap-2 rounded-2xl px-3 py-3 text-sm font-medium transition ${mode === 'preview' ? 'bg-stone-900 text-white' : 'text-stone-600 hover:bg-stone-100'}`}
              onClick={() => setMode('preview')}
            >
              <BookOpenIcon size={15} />
              成品预览
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-5">
          <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-stone-500 px-2 pb-2">Canvas Outline</div>
          <div className="space-y-2">
            {navigableBlocks.map((block, index) => (
              <div key={block.id} className="rounded-2xl border border-stone-200 bg-white/80 px-3 py-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-stone-400">
                  {String(index + 1).padStart(2, '0')} · {block.type}
                </div>
                <div className="mt-1 text-sm font-medium text-stone-800">{getBlockHeading(block)}</div>
              </div>
            ))}
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 border-b border-stone-200/80 bg-[#fbf7ef]/90">
          <div className="flex flex-col gap-4 px-5 py-4 md:flex-row md:items-center md:justify-between md:px-8">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-stone-500">Report Workbench</div>
              <div className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-stone-950">
                {mode === 'canvas' ? '可编排报告画布' : '高保真成品预览'}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className={`inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-semibold ${saveStatus === 'error' ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-700'}`}>
                <SaveIcon size={14} />
                {saveStatus === 'saved' ? '草稿已保存' : saveStatus === 'error' ? '保存失败' : '自动保存开启'}
              </div>
              <button
                className="inline-flex items-center gap-2 rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 hover:border-stone-400 hover:bg-stone-50 transition"
                onClick={handleExport}
              >
                <DownloadIcon size={14} />
                导出
              </button>
              {onClose && (
                <button
                  className="inline-flex items-center gap-2 rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 hover:border-stone-400 hover:bg-stone-50 transition"
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
