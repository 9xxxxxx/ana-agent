'use client';

import { useMemo, useState } from 'react';
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import SmartChart from '../charts/SmartChart';
import DataTable from './DataTable';
import {
  AlertIcon,
  CheckCircleIcon,
  CopyIcon,
  EditIcon,
  LayersIcon,
  TrashIcon,
} from '../Icons';
import { fetchOrchestrationRuntime } from '@/lib/api';
import { parseChartPayload } from '@/lib/chartData';
import { convertExpertOpinionToBlock, createCanvasBlock, generateDecisionPackBlocks, getBlockHeading, syncActionItemsWithRuns } from '@/lib/reportCanvas';
import { reportTemplates } from '@/lib/reportTemplates';

function toneClass(tone = 'default') {
  if (tone === 'summary') return 'border-blue-200 bg-blue-50/70';
  if (tone === 'section') return 'border-stone-200 bg-white';
  if (tone === 'note') return 'border-amber-200 bg-amber-50/70';
  return 'border-border bg-white';
}

function stanceTone(stance = 'analysis') {
  if (stance === 'risk') return 'bg-rose-50 text-rose-600 border-rose-200';
  if (stance === 'strategy') return 'bg-violet-50 text-violet-600 border-violet-200';
  return 'bg-sky-50 text-sky-600 border-sky-200';
}

function CanvasToolbar({ onAddBlock, onApplyTemplate, onInsertRuntime, onGenerateDecisionPack, onSyncActionStatus, loadingRuntime, blockCount }) {
  const blockTypes = [
    { key: 'text', label: '文本', icon: <EditIcon size={14} /> },
    { key: 'callout', label: '提示块', icon: <AlertIcon size={14} /> },
    { key: 'checklist', label: '清单', icon: <CheckCircleIcon size={14} /> },
    { key: 'metrics', label: '指标组', icon: <LayersIcon size={14} /> },
    { key: 'action_items', label: '执行块', icon: <LayersIcon size={14} /> },
  ];

  return (
    <div className="rounded-[28px] border border-stone-200 bg-white/90 px-4 py-4 shadow-sm">
      <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-stone-500">Canvas Controls</div>
          <div className="mt-1 text-lg font-semibold text-stone-900">正在编排 {blockCount} 个内容块</div>
        </div>
        <div className="flex flex-wrap gap-2">
          {blockTypes.map((item) => (
            <button
              key={item.key}
              className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-stone-50 px-3 py-2 text-sm font-medium text-stone-700 hover:border-stone-300 hover:bg-stone-100 transition"
              onClick={() => onAddBlock(item.key)}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
          <button
            className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-stone-50 px-3 py-2 text-sm font-medium text-stone-700 hover:border-stone-300 hover:bg-stone-100 transition"
            onClick={onInsertRuntime}
          >
            {loadingRuntime ? '读取中...' : '编排快照'}
          </button>
          <button
            className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-stone-900 px-3 py-2 text-sm font-medium text-white hover:opacity-90 transition"
            onClick={onGenerateDecisionPack}
          >
            生成决策包
          </button>
          <button
            className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-700 hover:border-stone-300 hover:bg-stone-50 transition"
            onClick={onSyncActionStatus}
          >
            回写执行状态
          </button>
        </div>
      </div>
      <div className="grid gap-3 lg:grid-cols-3">
        {reportTemplates.map((template) => (
          <button
            key={template.id}
            className="rounded-[22px] border border-stone-200 bg-[linear-gradient(180deg,#fffdf8_0%,#f7efe0_100%)] p-4 text-left transition hover:border-stone-300 hover:shadow-sm"
            onClick={() => onApplyTemplate(template.id)}
          >
            <div className="text-sm font-semibold text-stone-900">{template.name}</div>
            <div className="mt-2 text-sm leading-6 text-stone-600">{template.description}</div>
          </button>
        ))}
      </div>
      </div>
    </div>
  );
}

function SortableBlock({ block, index, onUpdate, onDelete, onDuplicate, onTransformExpert, linkOptions }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: block.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={`rounded-[28px] border p-5 shadow-sm transition ${toneClass(block.tone)} ${isDragging ? 'opacity-70 shadow-lg' : ''}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <button
            className="cursor-grab rounded-2xl border border-stone-200 bg-stone-50 px-3 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-stone-500"
            {...attributes}
            {...listeners}
          >
            {String(index + 1).padStart(2, '0')}
          </button>
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-stone-500">{block.type}</div>
            <div className="mt-1 truncate text-base font-semibold text-stone-900">{getBlockHeading(block)}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {block.type === 'expert_opinion' && (
            <>
              <button
                className="rounded-full px-3 py-2 text-xs font-semibold text-stone-600 hover:bg-stone-100 transition"
                onClick={() => onTransformExpert(block.id, 'action_items')}
                title="转成行动项"
              >
                转行动
              </button>
              <button
                className="rounded-full px-3 py-2 text-xs font-semibold text-stone-600 hover:bg-stone-100 transition"
                onClick={() => onTransformExpert(block.id, 'callout')}
                title="转成风险提醒"
              >
                转风险
              </button>
              <button
                className="rounded-full px-3 py-2 text-xs font-semibold text-stone-600 hover:bg-stone-100 transition"
                onClick={() => onTransformExpert(block.id, 'text')}
                title="转成结论块"
              >
                转结论
              </button>
            </>
          )}
          <button
            className="rounded-full p-2 text-stone-500 hover:bg-stone-100 hover:text-stone-900 transition"
            onClick={() => onDuplicate(block.id)}
            title="复制块"
          >
            <CopyIcon size={14} />
          </button>
          <button
            className="rounded-full p-2 text-stone-500 hover:bg-rose-50 hover:text-rose-600 transition"
            onClick={() => onDelete(block.id)}
            title="删除块"
          >
            <TrashIcon size={14} />
          </button>
        </div>
      </div>

      <div className="mt-5">
        <BlockEditor block={block} onUpdate={onUpdate} linkOptions={linkOptions} />
      </div>
    </article>
  );
}

function CanvasChart({ chartData }) {
  try {
    const parsed = parseChartPayload(chartData);
    if (!parsed) {
      return <div className="rounded-2xl bg-stone-50 p-8 text-center text-sm text-stone-500">暂无图表数据</div>;
    }

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
  } catch {
    return <div className="rounded-2xl bg-rose-50 p-8 text-center text-sm text-rose-600">图表数据解析失败</div>;
  }

  return <div className="rounded-2xl bg-stone-50 p-8 text-center text-sm text-stone-500">暂不支持该图表格式</div>;
}

function ActionItemsBoard({ items = [], editable = false, onChange }) {
  const columns = [
    { key: 'todo', label: '待办' },
    { key: 'doing', label: '进行中' },
    { key: 'done', label: '已完成' },
  ];

  return (
    <div className="grid gap-3 lg:grid-cols-3">
      {columns.map((column) => {
        const columnItems = items.filter((item) => (item.status || 'todo') === column.key);
        return (
          <div key={column.key} className="rounded-[24px] border border-stone-200 bg-stone-50/70 p-4">
            <div className="text-sm font-semibold text-stone-900">{column.label}</div>
            <div className="mt-3 space-y-3">
              {columnItems.length === 0 && (
                <div className="rounded-2xl border border-dashed border-stone-200 bg-white/70 px-4 py-5 text-sm text-stone-400">
                  暂无事项
                </div>
              )}
              {columnItems.map((item, index) => (
                <div key={item.id || `${column.key}-${index}`} className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
                  <div className="text-sm font-semibold text-stone-900">{item.title}</div>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold">
                    <span className="rounded-full bg-stone-100 px-2.5 py-1 text-stone-600">{item.owner}</span>
                    <span className="rounded-full bg-stone-100 px-2.5 py-1 text-stone-600">{item.dueDate}</span>
                    <span className={`rounded-full px-2.5 py-1 ${item.priority === 'high' ? 'bg-rose-50 text-rose-600' : item.priority === 'low' ? 'bg-stone-100 text-stone-500' : 'bg-amber-50 text-amber-700'}`}>
                      {item.priority}
                    </span>
                  </div>
                  {editable && onChange && (
                    <select
                      className="mt-3 w-full rounded-2xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-700 outline-none"
                      value={item.status || 'todo'}
                      onChange={(event) => {
                        const next = items.map((current) =>
                          current.id === item.id ? { ...current, status: event.target.value } : current
                        );
                        onChange(next);
                      }}
                    >
                      <option value="todo">待办</option>
                      <option value="doing">进行中</option>
                      <option value="done">已完成</option>
                    </select>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function BlockEditor({ block, onUpdate, linkOptions = [] }) {
  const [actionView, setActionView] = useState('board');
  if (block.type === 'hero') {
    return (
      <div className="grid gap-4 md:grid-cols-[1.6fr,1fr]">
        <div className="space-y-3">
          <input
            className="w-full bg-transparent text-3xl font-semibold tracking-tight text-stone-950 outline-none"
            value={block.title || ''}
            onChange={(event) => onUpdate(block.id, { title: event.target.value })}
            placeholder="报告标题"
          />
          <textarea
            className="w-full min-h-[92px] resize-none rounded-3xl border border-stone-200 bg-stone-50/80 px-4 py-3 text-base leading-7 text-stone-700 outline-none"
            value={block.subtitle || ''}
            onChange={(event) => onUpdate(block.id, { subtitle: event.target.value })}
            placeholder="补充一句具有观点感的副标题"
          />
        </div>
        <div className="rounded-[24px] border border-stone-200 bg-stone-50 p-4 space-y-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-stone-500">类型</div>
            <input
              className="mt-2 w-full rounded-2xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-800 outline-none"
              value={block.badge || ''}
              onChange={(event) => onUpdate(block.id, { badge: event.target.value })}
            />
          </div>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-stone-500">时间</div>
            <input
              className="mt-2 w-full rounded-2xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-800 outline-none"
              value={block.createdAt || ''}
              onChange={(event) => onUpdate(block.id, { createdAt: event.target.value })}
            />
          </div>
        </div>
      </div>
    );
  }

  if (block.type === 'metrics') {
    return (
      <div className="space-y-4">
        <input
          className="w-full bg-transparent text-xl font-semibold text-stone-900 outline-none"
          value={block.title || ''}
          onChange={(event) => onUpdate(block.id, { title: event.target.value })}
          placeholder="指标组标题"
        />
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {(block.items || []).map((item, index) => (
            <div key={index} className="rounded-[22px] border border-stone-200 bg-stone-50/80 p-4 space-y-2">
              <input
                className="w-full bg-transparent text-sm font-medium text-stone-600 outline-none"
                value={item.label || item.title || ''}
                onChange={(event) => {
                  const items = [...(block.items || [])];
                  items[index] = { ...items[index], label: event.target.value, title: event.target.value };
                  onUpdate(block.id, { items });
                }}
                placeholder="指标名称"
              />
              <input
                className="w-full bg-transparent text-2xl font-semibold text-stone-900 outline-none"
                value={item.value || ''}
                onChange={(event) => {
                  const items = [...(block.items || [])];
                  items[index] = { ...items[index], value: event.target.value };
                  onUpdate(block.id, { items });
                }}
                placeholder="指标值"
              />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (block.type === 'chart') {
    return (
      <div className="space-y-4">
        <input
          className="w-full bg-transparent text-xl font-semibold text-stone-900 outline-none"
          value={block.title || ''}
          onChange={(event) => onUpdate(block.id, { title: event.target.value })}
          placeholder="图表标题"
        />
        <div className="rounded-[24px] border border-stone-200 bg-white p-4">
          <CanvasChart chartData={block.chartData} />
        </div>
        <textarea
          className="w-full min-h-[96px] resize-none rounded-[24px] border border-stone-200 bg-stone-50/80 px-4 py-3 text-sm leading-7 text-stone-700 outline-none"
          value={block.note || ''}
          onChange={(event) => onUpdate(block.id, { note: event.target.value })}
          placeholder="补充这张图的解读、异常点和业务含义"
        />
      </div>
    );
  }

  if (block.type === 'table') {
    return (
      <div className="space-y-4">
        <input
          className="w-full bg-transparent text-xl font-semibold text-stone-900 outline-none"
          value={block.title || ''}
          onChange={(event) => onUpdate(block.id, { title: event.target.value })}
          placeholder="数据表标题"
        />
        <div className="overflow-hidden rounded-[24px] border border-stone-200 bg-white">
          <DataTable
            title={null}
            searchable={false}
            exportable={false}
            pageSize={6}
            data={block.rows || []}
            columns={block.columns || []}
          />
        </div>
      </div>
    );
  }

  if (block.type === 'checklist') {
    return (
      <div className="space-y-4">
        <input
          className="w-full bg-transparent text-xl font-semibold text-stone-900 outline-none"
          value={block.title || ''}
          onChange={(event) => onUpdate(block.id, { title: event.target.value })}
          placeholder="行动清单标题"
        />
        <div className="space-y-2">
          {(block.items || []).map((item, index) => (
            <label key={item.id || index} className="flex items-center gap-3 rounded-2xl border border-stone-200 bg-white px-4 py-3">
              <input
                type="checkbox"
                checked={!!item.checked}
                onChange={(event) => {
                  const items = [...(block.items || [])];
                  items[index] = { ...items[index], checked: event.target.checked };
                  onUpdate(block.id, { items });
                }}
              />
              <input
                className={`flex-1 bg-transparent text-sm outline-none ${item.checked ? 'text-stone-400 line-through' : 'text-stone-800'}`}
                value={item.text || ''}
                onChange={(event) => {
                  const items = [...(block.items || [])];
                  items[index] = { ...items[index], text: event.target.value };
                  onUpdate(block.id, { items });
                }}
                placeholder="输入行动项"
              />
            </label>
          ))}
        </div>
      </div>
    );
  }

  if (block.type === 'action_items') {
    return (
      <div className="space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <input
            className="w-full bg-transparent text-xl font-semibold text-stone-900 outline-none"
            value={block.title || ''}
            onChange={(event) => onUpdate(block.id, { title: event.target.value })}
            placeholder="执行计划标题"
          />
          <div className="inline-flex rounded-full border border-stone-200 bg-stone-50 p-1">
            <button
              className={`rounded-full px-3 py-1.5 text-xs font-semibold ${actionView === 'board' ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500'}`}
              onClick={() => setActionView('board')}
            >
              看板
            </button>
            <button
              className={`rounded-full px-3 py-1.5 text-xs font-semibold ${actionView === 'table' ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500'}`}
              onClick={() => setActionView('table')}
            >
              明细
            </button>
          </div>
        </div>
        {actionView === 'board' ? (
          <ActionItemsBoard
            items={block.items || []}
            editable
            onChange={(items) => onUpdate(block.id, { items })}
          />
        ) : (
          <div className="space-y-3">
            {(block.items || []).map((item, index) => (
              <div key={item.id || index} className="rounded-[24px] border border-stone-200 bg-white p-4">
                <div className="grid gap-3 lg:grid-cols-[1.8fr,1fr,1fr,0.8fr,0.8fr]">
                  <input
                    className="rounded-2xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-800 outline-none"
                    value={item.title || ''}
                    onChange={(event) => {
                      const items = [...(block.items || [])];
                      items[index] = { ...items[index], title: event.target.value };
                      onUpdate(block.id, { items });
                    }}
                    placeholder="行动项"
                  />
                  <input
                    className="rounded-2xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-800 outline-none"
                    value={item.owner || ''}
                    onChange={(event) => {
                      const items = [...(block.items || [])];
                      items[index] = { ...items[index], owner: event.target.value };
                      onUpdate(block.id, { items });
                    }}
                    placeholder="负责人"
                  />
                  <input
                    className="rounded-2xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-800 outline-none"
                    value={item.dueDate || ''}
                    onChange={(event) => {
                      const items = [...(block.items || [])];
                      items[index] = { ...items[index], dueDate: event.target.value };
                      onUpdate(block.id, { items });
                    }}
                    placeholder="截止时间"
                  />
                  <select
                    className="rounded-2xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-800 outline-none"
                    value={item.priority || 'medium'}
                    onChange={(event) => {
                      const items = [...(block.items || [])];
                      items[index] = { ...items[index], priority: event.target.value };
                      onUpdate(block.id, { items });
                    }}
                  >
                    <option value="high">高</option>
                    <option value="medium">中</option>
                    <option value="low">低</option>
                  </select>
                  <select
                    className="rounded-2xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-800 outline-none"
                    value={item.status || 'todo'}
                    onChange={(event) => {
                      const items = [...(block.items || [])];
                      items[index] = { ...items[index], status: event.target.value };
                      onUpdate(block.id, { items });
                    }}
                  >
                    <option value="todo">待办</option>
                    <option value="doing">进行中</option>
                    <option value="done">已完成</option>
                  </select>
                </div>
                <div className="mt-3 grid gap-3 lg:grid-cols-[1.3fr,1fr]">
                  <select
                    className="rounded-2xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-800 outline-none"
                    value={item.linkedDeploymentId || ''}
                    onChange={(event) => {
                      const selected = linkOptions.find((option) => option.deployment_id === event.target.value);
                      const items = [...(block.items || [])];
                      items[index] = {
                        ...items[index],
                        linkedDeploymentId: selected?.deployment_id || '',
                        linkedDeploymentName: selected?.deployment_name || '',
                        linkedRunId: '',
                      };
                      onUpdate(block.id, { items });
                    }}
                  >
                    <option value="">未绑定执行流</option>
                    {linkOptions.map((option) => (
                      <option key={option.deployment_id || option.id} value={option.deployment_id || ''}>
                        {option.deployment_name || option.name || option.id}
                      </option>
                    ))}
                  </select>
                  <div className="rounded-2xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-500">
                    {item.lastRunState
                      ? `最近运行: ${item.lastRunState}${item.lastSyncedAt ? ` · ${item.lastSyncedAt}` : ''}`
                      : '尚未回写执行状态'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (block.type === 'expert_opinion') {
    return (
      <div className="space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <input
            className="w-full bg-transparent text-xl font-semibold text-stone-900 outline-none"
            value={block.title || ''}
            onChange={(event) => onUpdate(block.id, { title: event.target.value })}
            placeholder="专家名称"
          />
          <div className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-semibold ${stanceTone(block.stance)}`}>
            {block.role || '专家观点'}
          </div>
        </div>
        <textarea
          className="w-full min-h-[180px] resize-none rounded-[24px] border border-stone-200 bg-white px-4 py-3 text-[15px] leading-8 text-stone-800 outline-none"
          value={block.content || ''}
          onChange={(event) => onUpdate(block.id, { content: event.target.value })}
          placeholder="输入专家观点、依据和建议"
        />
      </div>
    );
  }

  if (block.type === 'orchestration_snapshot') {
    return (
      <div className="space-y-4">
        <input
          className="w-full bg-transparent text-xl font-semibold text-stone-900 outline-none"
          value={block.title || ''}
          onChange={(event) => onUpdate(block.id, { title: event.target.value })}
          placeholder="编排快照标题"
        />
        <div className="grid gap-3 md:grid-cols-3">
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
          <div className="overflow-x-auto rounded-[24px] border border-stone-200 bg-white">
            <table className="min-w-full text-sm">
              <thead className="bg-stone-50/70">
                <tr className="border-b border-stone-200">
                  <th className="px-4 py-3 text-left font-semibold text-stone-600">Run</th>
                  <th className="px-4 py-3 text-left font-semibold text-stone-600">Deployment</th>
                  <th className="px-4 py-3 text-left font-semibold text-stone-600">状态</th>
                  <th className="px-4 py-3 text-left font-semibold text-stone-600">时间</th>
                </tr>
              </thead>
              <tbody>
                {block.runs.map((run, index) => (
                  <tr key={run.id || index} className="border-b border-stone-100 last:border-b-0">
                    <td className="px-4 py-3 text-stone-800">{run.name || run.id}</td>
                    <td className="px-4 py-3 text-stone-600">{run.deployment_name || '未绑定'}</td>
                    <td className="px-4 py-3 text-stone-600">{run.state_name || 'Unknown'}</td>
                    <td className="px-4 py-3 text-stone-600">{run.start_time || run.expected_start_time || '未开始'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <textarea
          className="w-full min-h-[120px] resize-none rounded-[24px] border border-stone-200 bg-white px-4 py-3 text-[15px] leading-8 text-stone-800 outline-none"
          value={block.note || ''}
          onChange={(event) => onUpdate(block.id, { note: event.target.value })}
          placeholder="补充这次编排运行状态的解读和下一步动作"
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <input
        className="w-full bg-transparent text-xl font-semibold text-stone-900 outline-none"
        value={block.title || ''}
        onChange={(event) => onUpdate(block.id, { title: event.target.value })}
        placeholder="块标题"
      />
      <textarea
        className="w-full min-h-[180px] resize-none rounded-[24px] border border-stone-200 bg-white px-4 py-3 text-[15px] leading-8 text-stone-800 outline-none"
        value={block.content || ''}
        onChange={(event) => onUpdate(block.id, { content: event.target.value })}
        placeholder="开始编写你的内容"
      />
    </div>
  );
}

export default function ReportCanvas({ blocks, onChange }) {
  const [loadingRuntime, setLoadingRuntime] = useState(false);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const blockIds = useMemo(() => blocks.map((block) => block.id), [blocks]);
  const linkOptions = useMemo(() => {
    const deploymentMap = new Map();
    blocks
      .filter((block) => block.type === 'orchestration_snapshot')
      .flatMap((block) => block.runs || [])
      .forEach((run) => {
        if (!run.deployment_id) return;
        if (!deploymentMap.has(run.deployment_id)) {
          deploymentMap.set(run.deployment_id, {
            deployment_id: run.deployment_id,
            deployment_name: run.deployment_name || run.name || run.deployment_id,
          });
        }
      });
    return Array.from(deploymentMap.values());
  }, [blocks]);

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = blocks.findIndex((block) => block.id === active.id);
    const newIndex = blocks.findIndex((block) => block.id === over.id);
    onChange(arrayMove(blocks, oldIndex, newIndex));
  };

  const updateBlock = (blockId, patch) => {
    onChange(
      blocks.map((block) => (block.id === blockId ? { ...block, ...patch } : block))
    );
  };

  const deleteBlock = (blockId) => {
    onChange(blocks.filter((block) => block.id !== blockId));
  };

  const duplicateBlock = (blockId) => {
    const current = blocks.find((block) => block.id === blockId);
    if (!current) return;

    const clone = {
      ...current,
      id: `${current.type}-${Math.random().toString(36).slice(2, 9)}`,
      title: current.title ? `${current.title}（副本）` : current.title,
    };

    const next = [];
    blocks.forEach((block) => {
      next.push(block);
      if (block.id === blockId) {
        next.push(clone);
      }
    });
    onChange(next);
  };

  const addBlock = (type) => {
    if (type === 'metrics') {
      onChange([
        ...blocks,
        createCanvasBlock('metrics', {
          title: '新增指标组',
          items: [
            { label: '指标一', value: '0' },
            { label: '指标二', value: '0' },
            { label: '指标三', value: '0' },
          ],
        }),
      ]);
      return;
    }

    if (type === 'checklist') {
      onChange([
        ...blocks,
        createCanvasBlock('checklist', {
          title: '新增行动清单',
          items: [
            { id: 'todo-1', text: '补充第一项行动', checked: false },
            { id: 'todo-2', text: '补充第二项行动', checked: false },
          ],
        }),
      ]);
      return;
    }

    if (type === 'callout') {
      onChange([
        ...blocks,
        createCanvasBlock('callout', {
          title: '关键提醒',
          content: '在这里放入风险、依赖、阻塞或关键约束。',
          tone: 'note',
        }),
      ]);
      return;
    }

    if (type === 'action_items') {
      onChange([
        ...blocks,
        createCanvasBlock('action_items', {
          title: '新增执行计划',
          items: [
            { id: 'task-1', title: '定义第一个执行动作', owner: '待分配', dueDate: '本周', status: 'todo', priority: 'high' },
            { id: 'task-2', title: '定义第二个执行动作', owner: '待分配', dueDate: '下周', status: 'todo', priority: 'medium' },
          ],
        }),
      ]);
      return;
    }

    onChange([
      ...blocks,
      createCanvasBlock('text', {
        title: '新增文本块',
        content: '开始编写内容。',
        tone: 'section',
      }),
    ]);
  };

  const applyTemplate = (templateId) => {
    const template = reportTemplates.find((item) => item.id === templateId);
    if (!template) return;
    onChange(template.build());
  };

  const transformExpert = (blockId, targetType) => {
    const source = blocks.find((block) => block.id === blockId);
    if (!source) return;
    const transformed = convertExpertOpinionToBlock(source, targetType);
    const next = [];
    blocks.forEach((block) => {
      next.push(block);
      if (block.id === blockId) {
        next.push(transformed);
      }
    });
    onChange(next);
  };

  const insertRuntimeSnapshot = async () => {
    setLoadingRuntime(true);
    try {
      const response = await fetchOrchestrationRuntime();
      if (!response.success) {
        throw new Error(response.message || '读取编排快照失败');
      }
      const stats = response.runtime?.stats || {};
      const deployments = response.runtime?.deployments || [];
      const deploymentMap = new Map(deployments.map((deployment) => [deployment.id, deployment.name]));
      const runs = (response.runtime?.runs || []).slice(0, 6).map((run) => ({
        ...run,
        deployment_name: run.deployment_id ? deploymentMap.get(run.deployment_id) : '未绑定',
      }));
      onChange([
        ...blocks,
        createCanvasBlock('orchestration_snapshot', {
          title: '任务编排快照',
          summary: stats,
          runs,
          note: '记录当前 Prefect flow / deployment / run 状态，并据此更新执行计划。',
        }),
      ]);
    } catch (error) {
      console.error(error);
    } finally {
      setLoadingRuntime(false);
    }
  };

  const generateDecisionPack = () => {
    onChange(generateDecisionPackBlocks(blocks));
  };

  const syncActionStatus = () => {
    onChange(syncActionItemsWithRuns(blocks));
  };

  return (
    <div className="space-y-5">
      <CanvasToolbar
        onAddBlock={addBlock}
        onApplyTemplate={applyTemplate}
        onInsertRuntime={insertRuntimeSnapshot}
        onGenerateDecisionPack={generateDecisionPack}
        onSyncActionStatus={syncActionStatus}
        loadingRuntime={loadingRuntime}
        blockCount={blocks.length}
      />

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={blockIds} strategy={verticalListSortingStrategy}>
          <div className="space-y-4">
            {blocks.map((block, index) => (
              <SortableBlock
                key={block.id}
                block={block}
                index={index}
                onUpdate={updateBlock}
                onDelete={deleteBlock}
                onDuplicate={duplicateBlock}
                onTransformExpert={transformExpert}
                linkOptions={linkOptions}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
