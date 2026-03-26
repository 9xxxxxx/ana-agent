'use client';

/**
 * 工具调用步骤折叠组件 (纯 Tailwind 实现)
 */

import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  CheckCircleIcon, SpinnerIcon,
  ChevronRightIcon, InputIcon, OutputIcon, CopyIcon, CheckIcon, AlarmClockIcon,
} from './Icons';

export default function ToolStep({ step }) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const isRunning = step.status === 'running';
  const durationText = step?.durationMs ? `${(step.durationMs / 1000).toFixed(2)}s` : (isRunning ? '进行中' : '--');

  const copyText = async (text) => {
    try {
      await navigator.clipboard.writeText(String(text || ''));
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {}
  };

  const parseListTablesOutput = (content) => {
    const text = String(content || '');
    if (!text.includes('Schema:') || !text.includes('共发现')) return null;
    const rows = [];
    let currentSchema = '';
    const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
    for (const line of lines) {
      const schemaMatch = line.match(/^📂\s*Schema:\s*(.+)$/);
      if (schemaMatch) {
        currentSchema = schemaMatch[1].trim();
        continue;
      }
      const tableMatch = line.match(/^[📋👁️]\s*(.+)\s+\((TABLE|VIEW)\)$/);
      if (tableMatch) {
        rows.push({
          schema: currentSchema || '-',
          table: tableMatch[1].trim(),
          type: tableMatch[2],
        });
      }
    }
    return rows.length > 0 ? rows : null;
  };

  const parseSchemaOutput = (content) => {
    const text = String(content || '');
    if (!text.includes('可用 Schema')) return null;
    const rows = text
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('-'))
      .map((line) => line.replace(/^-+\s*/, '').trim())
      .filter(Boolean);
    return rows.length > 0 ? rows : null;
  };

  const formatContent = (content) => {
    if (!content) return null;
    const parsedTables = parseListTablesOutput(content);
    if (parsedTables) {
      return (
        <div className="my-2 overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full border-collapse text-left text-[12.5px]">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-700">
                <th className="px-3 py-2 font-medium whitespace-nowrap">Schema</th>
                <th className="px-3 py-2 font-medium whitespace-nowrap">Table</th>
                <th className="px-3 py-2 font-medium whitespace-nowrap">Type</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {parsedTables.map((row, i) => (
                <tr key={`${row.schema}-${row.table}-${i}`} className="transition-colors hover:bg-slate-50/80">
                  <td className="px-3 py-1.5 text-slate-600">{row.schema}</td>
                  <td className="px-3 py-1.5 font-medium text-slate-800">{row.table}</td>
                  <td className="px-3 py-1.5 text-slate-600">{row.type}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    const parsedSchemas = parseSchemaOutput(content);
    if (parsedSchemas) {
      return (
        <div className="my-2 overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full border-collapse text-left text-[12.5px]">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-700">
                <th className="px-3 py-2 font-medium whitespace-nowrap">Schema</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {parsedSchemas.map((name) => (
                <tr key={name} className="transition-colors hover:bg-slate-50/80">
                  <td className="px-3 py-1.5 text-slate-700">{name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    try {
      const parsed = JSON.parse(content);

      if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'object' && parsed[0] !== null) {
        const keys = Object.keys(parsed[0]);
        if (keys.length > 0) {
          return (
            <div className="my-2 overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full border-collapse text-left text-[12.5px]">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-700">
                    {keys.map((k, i) => <th key={i} className="px-3 py-2 font-medium whitespace-nowrap">{k}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {parsed.slice(0, 10).map((row, i) => (
                    <tr key={i} className="transition-colors hover:bg-slate-50/80">
                      {keys.map((k, j) => (
                        <td key={j} className="max-w-[240px] truncate px-3 py-1.5 text-slate-600" title={String(row[k])}>
                          {row[k] == null ? '-' : String(row[k])}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {parsed.length > 10 && (
                    <tr>
                      <td colSpan={keys.length} className="bg-slate-50 px-3 py-2 text-center italic text-slate-500">
                        ... 仅展示前 10 行，共 {parsed.length} 行
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          );
        }
      }

      return (
        <pre className="my-2 overflow-x-auto rounded-xl border border-slate-200 bg-slate-950 p-3 text-[12.5px] text-slate-100 shadow-inner">
          <code>{JSON.stringify(parsed, null, 2)}</code>
        </pre>
      );
    } catch {
      if (content.includes('|') && content.includes('---')) {
        return <div className="prose prose-sm max-w-none text-slate-700"><ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown></div>;
      }
      if (content.includes('\n- ') || content.includes('\n  - ')) {
        return <div className="prose prose-sm max-w-none text-slate-700"><ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown></div>;
      }

      return (
        <div className="whitespace-pre-wrap break-words rounded-lg border border-slate-200 bg-white p-3 font-mono text-[12.5px] leading-relaxed text-slate-700">
          {content}
        </div>
      );
    }
  };

  return (
    <div className={`mb-2 mt-1.5 w-full max-w-full overflow-hidden rounded-xl border transition-all duration-300 ${isRunning ? 'border-amber-300/60 bg-amber-50/70' : 'border-slate-200 bg-white shadow-sm hover:shadow-md'}`}>
      <div 
        className="flex cursor-pointer select-none items-center justify-between px-3 py-2 transition-colors hover:bg-slate-50"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {isRunning ? (
            <SpinnerIcon size={14} className="shrink-0 animate-spin text-amber-500" />
          ) : (
            <CheckCircleIcon size={14} className="shrink-0 text-emerald-500" />
          )}
          <span className="truncate text-[13px] font-semibold tracking-wide text-slate-800">{step.name}</span>
        </div>
        <div className="flex shrink-0 items-center gap-2 pl-2">
          <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase ${isRunning ? 'text-amber-600' : 'text-slate-400'}`}>
            {isRunning ? '处理中...' : '完成'}
          </span>
          <ChevronRightIcon
            size={16}
            className={`text-slate-400 transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`}
          />
        </div>
      </div>
      
      {expanded && (
        <div className="overflow-hidden border-t border-slate-200 bg-slate-50/50 px-4 pb-4 pt-1 font-sans">
          <div className="mt-3 grid grid-cols-2 gap-2 rounded-lg border border-slate-200 bg-white p-2.5 text-[11px] text-slate-600 md:grid-cols-4">
            <div>
              <div className="text-slate-400">工具</div>
              <div className="truncate font-semibold text-slate-800">{step.name}</div>
            </div>
            <div>
              <div className="text-slate-400">状态</div>
              <div className={`font-semibold ${isRunning ? 'text-amber-600' : 'text-emerald-600'}`}>{isRunning ? '执行中' : '完成'}</div>
            </div>
            <div>
              <div className="text-slate-400">开始时间</div>
              <div className="font-semibold text-slate-800">
                {step.startedAt ? new Date(step.startedAt).toLocaleTimeString() : '--'}
              </div>
            </div>
            <div>
              <div className="text-slate-400">耗时</div>
              <div className="inline-flex items-center gap-1 font-semibold text-slate-800">
                <AlarmClockIcon size={12} />
                {durationText}
              </div>
            </div>
          </div>

          {step.input && (
            <div className="mt-3">
              <div className="mb-2 flex items-center justify-between gap-1.5 text-xs font-semibold uppercase tracking-wide text-brand-600">
                <span className="flex items-center gap-1.5">
                  <InputIcon size={13} />
                  <span>输入参数</span>
                </span>
                <button className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[10px] text-slate-500" onClick={() => copyText(step.input)}>
                  {copied ? <CheckIcon size={11} /> : <CopyIcon size={11} />}
                </button>
              </div>
              <div>{formatContent(step.input)}</div>
            </div>
          )}
          {step.output && (
            <div className="mt-4 border-t border-slate-200 pt-4">
              <div className="mb-2 flex items-center justify-between gap-1.5 text-xs font-semibold uppercase tracking-wide text-brand-600">
                <span className="flex items-center gap-1.5">
                  <OutputIcon size={13} />
                  <span>返回结果</span>
                </span>
                <button className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[10px] text-slate-500" onClick={() => copyText(step.output)}>
                  {copied ? <CheckIcon size={11} /> : <CopyIcon size={11} />}
                </button>
              </div>
              <div>{formatContent(step.output)}</div>
            </div>
          )}
          {isRunning && !step.output && (
            <div className="mt-4 flex items-center gap-2 border-t border-slate-200 pt-4 text-sm text-slate-500">
              <SpinnerIcon size={14} className="animate-spin" />
              <span>正在处理...</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
