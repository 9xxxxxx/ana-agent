'use client';

import { useRef, useEffect, useState, memo, useMemo } from 'react';
import Image from 'next/image';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import ToolStep from './ToolStep';
import SmartChart from './charts/SmartChart';
import ReportGenerator from './report/ReportGenerator';
import { getFileUrl } from '@/lib/api';
import { parseChartPayload } from '@/lib/chartData';
import {
  CopyIcon,
  CheckIcon,
  FileIcon,
  DownloadIcon,
  BarChartIcon,
  SparklesIcon,
  DatabaseIcon,
  BookOpenIcon,
  EditIcon,
  ChevronRightIcon,
} from './Icons';
import { cn, ui } from './ui';
import { EmptyState, StatusBadge } from './status';

const markdownComponents = {
  h1: ({ children }) => <h1 className="mt-2 mb-4 text-[1.55rem] font-semibold tracking-tight text-slate-900">{children}</h1>,
  h2: ({ children }) => <h2 className="mt-7 mb-3 border-b border-slate-200 pb-2 text-[1.2rem] font-semibold text-slate-900">{children}</h2>,
  h3: ({ children }) => <h3 className="mt-5 mb-2 text-[1.05rem] font-semibold text-slate-800">{children}</h3>,
  p: ({ children }) => <p className="my-3 leading-8 text-slate-700">{children}</p>,
  ul: ({ children }) => <ul className="my-3 list-disc space-y-1.5 pl-5 text-slate-700">{children}</ul>,
  ol: ({ children }) => <ol className="my-3 list-decimal space-y-1.5 pl-5 text-slate-700">{children}</ol>,
  li: ({ children }) => <li className="leading-7">{children}</li>,
  blockquote: ({ children }) => <blockquote className="my-4 rounded-r-xl border-l-4 border-brand-200 bg-brand-50/40 py-2 pl-4 text-slate-600">{children}</blockquote>,
  table: ({ children }) => (
    <div className="my-4 overflow-x-auto rounded-xl border border-slate-200/90">
      <table className="w-full min-w-[520px] border-collapse text-[13px]">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-slate-50 text-slate-700">{children}</thead>,
  th: ({ children }) => <th className="border-b border-slate-200 px-3 py-2 text-left font-semibold">{children}</th>,
  td: ({ children }) => <td className="border-b border-slate-100 px-3 py-2 align-top text-slate-700">{children}</td>,
  pre: ({ children }) => <pre className="my-4 overflow-x-auto rounded-xl border border-slate-200 bg-slate-950 p-4 text-[13px] text-slate-100">{children}</pre>,
  code: ({ className, children }) => {
    if (className) {
      return <code className={className}>{children}</code>;
    }
    return <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[0.86em] text-slate-800">{children}</code>;
  },
  hr: () => <hr className="my-5 border-slate-200" />,
};

function normalizeTextContent(rawText) {
  return String(rawText || '')
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n');
}

function stripMarkdownMarks(text) {
  return String(text || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^>\s+/gm, '')
    .trim();
}

function extractKeyTakeaways(rawText, maxItems = 5) {
  const text = String(rawText || '');
  if (!text.trim()) return [];

  const bullets = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^[-*]\s+/.test(line))
    .map((line) => stripMarkdownMarks(line.replace(/^[-*]\s+/, '')))
    .filter(Boolean);

  if (bullets.length >= 2) {
    return bullets.slice(0, maxItems);
  }

  const compact = stripMarkdownMarks(text);
  const sentences = compact
    .split(/(?<=[。！？.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 10);
  return sentences.slice(0, maxItems);
}

function splitReportSections(rawText) {
  const text = String(rawText || '');
  if (!text.trim()) {
    return { conclusion: '', evidence: '', recommendation: '' };
  }

  const lines = text.split('\n');
  let current = 'conclusion';
  const buckets = { conclusion: [], evidence: [], recommendation: [] };

  const detectSection = (line) => {
    const title = line.replace(/^#+\s*/, '').trim().toLowerCase();
    if (/证据|依据|数据支持|evidence|data/.test(title)) return 'evidence';
    if (/建议|行动|下一步|recommend|action/.test(title)) return 'recommendation';
    if (/结论|总结|摘要|overview|summary|insight/.test(title)) return 'conclusion';
    return null;
  };

  for (const line of lines) {
    const maybeHeader = detectSection(line);
    if (maybeHeader) {
      current = maybeHeader;
      continue;
    }
    buckets[current].push(line);
  }

  return {
    conclusion: buckets.conclusion.join('\n').trim(),
    evidence: buckets.evidence.join('\n').trim(),
    recommendation: buckets.recommendation.join('\n').trim(),
  };
}

function shouldRenderStructuredCards({
  analysisRequested,
  text,
  hasEvidenceSection,
  hasRecommendationSection,
  toolStepCount,
  chartCount,
  takeawayCount,
}) {
  if (!analysisRequested) return false;

  const normalized = String(text || '').trim();
  if (!normalized) return false;

  // 对短句闲聊保持普通对话展示，不强行上“结论卡片”
  if (normalized.length < 80 && !hasEvidenceSection && !hasRecommendationSection && chartCount === 0) {
    return false;
  }

  const hasReportLikePattern =
    /(^|\n)\s*##\s+/.test(normalized) ||
    /(^|\n)\s*[-*]\s+/.test(normalized) ||
    normalized.includes('|') ||
    /结论|建议|分析|洞察|证据|总结/.test(normalized);

  return (
    hasEvidenceSection ||
    hasRecommendationSection ||
    chartCount > 0 ||
    toolStepCount > 0 ||
    takeawayCount >= 2 ||
    hasReportLikePattern
  );
}

function isExplicitAnalysisRequest(text = '') {
  const normalized = String(text || '').trim().toLowerCase();
  if (!normalized) return false;
  return /总结|结论|分析|报告|洞察|原因|建议|深度|review|insight|summary|conclusion|report/.test(normalized);
}

function shouldUsePlainPreformatted(text = '') {
  const normalized = String(text || '').trim();
  if (!normalized) return false;
  const hasMarkdownSyntax = /(^|\n)\s*#{1,6}\s+|(^|\n)\s*[-*]\s+|```|\|.*\|/.test(normalized);
  return !hasMarkdownSyntax;
}

function extractThinkingBlocks(text = '') {
  const source = String(text || '');
  if (!source) return { reasoning: '', answer: '' };
  let reasoning = '';
  let answer = source;

  const thinkRegex = /<think>([\s\S]*?)<\/think>/gi;
  if (thinkRegex.test(source)) {
    reasoning = [...source.matchAll(/<think>([\s\S]*?)<\/think>/gi)]
      .map((item) => String(item[1] || '').trim())
      .filter(Boolean)
      .join('\n\n');
    answer = source.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  }
  return { reasoning, answer };
}

function splitReasoningTimeline(reasoning = '') {
  return String(reasoning || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => ({
      id: `${index}-${line.slice(0, 16)}`,
      text: line,
    }));
}

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('复制失败:', error);
    }
  };

  return (
    <button
      className={cn(
        'flex items-center justify-center rounded-md p-1.5 transition-colors',
        copied ? 'bg-green-50 text-green-600' : 'text-slate-400 hover:bg-brand-50 hover:text-brand-700'
      )}
      onClick={handleCopy}
      title={copied ? '已复制' : '复制代码/文本'}
    >
      {copied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
    </button>
  );
}

function AttachmentPreview({ files }) {
  if (!files || files.length === 0) return null;

  return (
    <div className="mb-2 flex flex-wrap gap-2">
      {files.map((file, index) => {
        const isImage = file.match(/\.(jpeg|jpg|png|gif|webp)$/i);
        return (
          <div key={index} className="relative">
            {isImage ? (
              <Image
                src={file}
                alt="attachment"
                width={64}
                height={64}
                unoptimized
                className="h-16 w-16 rounded-lg border border-white/80 object-cover"
              />
            ) : (
              <a href={file} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 rounded-lg border border-white/80 bg-white px-3 py-2 text-sm transition-colors hover:bg-brand-50">
                <FileIcon size={16} className="text-slate-500" />
                <span className="max-w-[120px] truncate text-slate-700">{file.split('/').pop()}</span>
              </a>
            )}
          </div>
        );
      })}
    </div>
  );
}

const MessageItem = memo(({ msg, isStreaming, isLast, onViewReport, onEditSend, analysisRequested = false }) => {
  const contentObj = useMemo(() => {
    let text = normalizeTextContent(msg.content);
    const attachments = [];

    if (msg.role === 'user') {
      const attachRegex = /\[附件:\s*(.+?)\]\((.+?)\)/g;
      let match;
      while ((match = attachRegex.exec(text)) !== null) {
        attachments.push(match[2]);
      }
      text = text.replace(attachRegex, '').trim();
    }
    const parsedThinking = extractThinkingBlocks(text);
    const normalizedText = parsedThinking.answer || text;
    return { text: normalizedText, attachments, extractedReasoning: parsedThinking.reasoning };
  }, [msg.content, msg.role]);

  const hasRenderableContent = Boolean(contentObj.text && contentObj.text.trim());
  const reportSections = useMemo(() => splitReportSections(contentObj.text), [contentObj.text]);
  const takeaways = useMemo(() => extractKeyTakeaways(reportSections.conclusion || contentObj.text), [reportSections.conclusion, contentObj.text]);
  const hasEvidenceSection = Boolean(reportSections.evidence);
  const hasRecommendationSection = Boolean(reportSections.recommendation);
  const preferPlainPre = useMemo(() => shouldUsePlainPreformatted(contentObj.text), [contentObj.text]);
  const useStructuredCards = useMemo(
    () =>
      shouldRenderStructuredCards({
        analysisRequested,
        text: contentObj.text,
        hasEvidenceSection,
        hasRecommendationSection,
        toolStepCount: msg.toolSteps?.length || 0,
        chartCount: msg.charts?.length || 0,
        takeawayCount: takeaways.length,
      }),
    [
      contentObj.text,
      analysisRequested,
      hasEvidenceSection,
      hasRecommendationSection,
      msg.toolSteps?.length,
      msg.charts?.length,
      takeaways.length,
    ]
  );

  const markdownContent = useMemo(() => {
    return (
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {contentObj.text}
      </ReactMarkdown>
    );
  }, [contentObj.text]);

  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState('');
  const reasoningText = msg.reasoning || contentObj.extractedReasoning;
  const timelineItems = useMemo(() => splitReasoningTimeline(reasoningText), [reasoningText]);
  const [reasoningPinned, setReasoningPinned] = useState(false);
  const [reasoningCollapsed, setReasoningCollapsed] = useState(false);
  const [reasoningMode, setReasoningMode] = useState('timeline');
  const [reasoningCopied, setReasoningCopied] = useState(false);
  const totalToolDurationMs = useMemo(
    () => (msg.toolSteps || []).reduce((sum, step) => sum + (step.durationMs || 0), 0),
    [msg.toolSteps]
  );
  const completedToolCount = useMemo(
    () => (msg.toolSteps || []).filter((step) => step.status === 'done').length,
    [msg.toolSteps]
  );
  const brainstormProgress = useMemo(
    () => (Array.isArray(msg.brainstormProgress) ? msg.brainstormProgress : []),
    [msg.brainstormProgress]
  );
  const brainstormRoleCount = useMemo(
    () =>
      new Set(
        brainstormProgress
          .filter((item) => item.type === 'specialist_finished' && item.role_id)
          .map((item) => item.role_id)
      ).size,
    [brainstormProgress]
  );
  const brainstormFinishedCount = useMemo(
    () => brainstormProgress.filter((item) => item.type === 'specialist_finished').length,
    [brainstormProgress]
  );
  const brainstormRoundCount = useMemo(
    () => new Set(brainstormProgress.map((item) => item.round).filter((round) => Number(round) > 0)).size,
    [brainstormProgress]
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const savedPinned = localStorage.getItem('sqlAgentReasoningPinned');
    if (savedPinned) setReasoningPinned(savedPinned === 'true');
  }, []);

  useEffect(() => {
    if (isStreaming && isLast && !contentObj.text) {
      setReasoningCollapsed(false);
    }
  }, [isStreaming, isLast, contentObj.text]);

  if (msg.role === 'user') {
    return (
      <div className="group/user relative mb-8 flex w-full justify-end">
        <div className="relative flex max-w-[80%] flex-col items-end">
          <AttachmentPreview files={contentObj.attachments} />
          {hasRenderableContent && (
            <div className="mt-1 flex items-center gap-2">
              <div className="flex items-center gap-1 opacity-0 transition-opacity duration-200 group-hover/user:opacity-100">
                <button
                  className={cn(ui.iconButton, 'rounded-md p-1.5 text-slate-400')}
                  title="编辑并重新发送"
                  onClick={() => {
                    setEditText(contentObj.text);
                    setIsEditing(true);
                  }}
                >
                  <EditIcon size={14} />
                </button>
                <CopyButton text={contentObj.text} />
              </div>

              {isEditing ? (
                <div className="w-[400px] rounded-2xl border border-white/80 bg-white px-4 py-3 shadow-sm">
                  <textarea
                    className="w-full resize-none bg-transparent text-[15px] text-slate-800 outline-none"
                    rows={3}
                    value={editText}
                    onChange={(event) => setEditText(event.target.value)}
                    autoFocus
                  />
                  <div className="mt-2 flex justify-end gap-2">
                    <button className={cn(ui.buttonSecondary, 'rounded-md px-3 py-1.5 text-xs')} onClick={() => setIsEditing(false)}>取消</button>
                    <button
                      className={cn(ui.buttonPrimary, 'rounded-md px-3 py-1.5 text-xs shadow-sm')}
                      onClick={() => {
                        if (!editText.trim()) return;
                        setIsEditing(false);
                        if (onEditSend) onEditSend(msg.id, editText);
                      }}
                    >
                      保存并重发
                    </button>
                  </div>
                </div>
              ) : (
                <div className="relative whitespace-pre-wrap break-words rounded-[28px] rounded-tr-sm border border-brand-100 bg-gradient-to-br from-brand-50 to-white px-5 py-3 text-[15px] leading-relaxed text-foreground shadow-[0_12px_34px_rgba(59,130,246,0.10)]">
                  {contentObj.text}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="group/ai mb-12 flex w-full justify-start gap-4 font-sans">
      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-white/80 bg-white/80 shadow-sm">
        <SparklesIcon size={16} className="text-brand-700" />
      </div>

      <div className="relative min-w-0 max-w-[90%] flex-1 pt-1">
        {msg.toolSteps?.length > 0 && (
          <details className="mb-4 overflow-hidden rounded-2xl border border-slate-200/80 bg-white/75" open>
            <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50/80">
              <span className="flex items-center gap-2">
                <SparklesIcon size={14} className="text-brand-600" />
                工具执行过程（{msg.toolSteps.length} 步）
              </span>
              <span className="text-xs text-slate-500">
                已完成 {completedToolCount}/{msg.toolSteps.length} · 总耗时 {(totalToolDurationMs / 1000).toFixed(2)}s
              </span>
            </summary>
            <div className="border-t border-slate-200/80 bg-slate-50/55 px-3 py-3">
              {msg.toolSteps.map((step) => (
                <ToolStep key={step.id} step={step} />
              ))}
            </div>
          </details>
        )}

        {brainstormProgress.length > 0 && (
          <details className="mb-4 overflow-hidden rounded-2xl border border-indigo-200/80 bg-indigo-50/40" open>
            <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-medium text-indigo-900 hover:bg-indigo-50/70">
              <span className="flex items-center gap-2">
                <SparklesIcon size={14} className="text-indigo-600" />
                Multi-Agent 进度（事件 {brainstormProgress.length}）
              </span>
              <span
                className={`text-xs ${brainstormRoleCount >= 2 ? 'text-emerald-700' : 'text-rose-700'}`}
                title={brainstormRoleCount >= 2 ? '已观察到多个专家角色完成' : '当前只观察到 1 个专家角色完成'}
              >
                角色完成数 {brainstormRoleCount} · 轮次 {brainstormRoundCount}
              </span>
            </summary>
            <div className="border-t border-indigo-200/80 bg-white/85 px-4 py-3">
              <div className="mb-3 h-2 overflow-hidden rounded-full bg-indigo-100">
                <div
                  className="h-full rounded-full bg-indigo-500 transition-all"
                  style={{ width: `${Math.min(100, (brainstormFinishedCount / Math.max(1, brainstormProgress.length)) * 100)}%` }}
                />
              </div>
              {brainstormRoleCount < 2 && (
                <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                  当前会商只观察到单角色完成记录，尚不能证明是“真实多 Agent 协作”。
                </div>
              )}
              <div className="max-h-56 overflow-auto rounded-lg border border-indigo-100">
                <table className="w-full border-collapse text-left text-[12px]">
                  <thead className="bg-indigo-50 text-indigo-800">
                    <tr>
                      <th className="px-2 py-1.5 font-semibold">类型</th>
                      <th className="px-2 py-1.5 font-semibold">轮次</th>
                      <th className="px-2 py-1.5 font-semibold">角色</th>
                      <th className="px-2 py-1.5 font-semibold">耗时</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-indigo-50 bg-white">
                    {brainstormProgress.map((item, idx) => (
                      <tr key={`${item.type}-${item.round}-${item.role_id}-${item.ts}-${idx}`}>
                        <td className="px-2 py-1.5 text-slate-700">{item.type || '-'}</td>
                        <td className="px-2 py-1.5 text-slate-600">{item.round || '-'}</td>
                        <td className="px-2 py-1.5 text-slate-700">{item.role_name || item.role_id || '-'}</td>
                        <td className="px-2 py-1.5 text-slate-600">{item.elapsed_ms ? `${item.elapsed_ms}ms` : '--'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </details>
        )}

        {msg.runMeta && (
          <details className="mb-4 overflow-hidden rounded-2xl border border-cyan-200/80 bg-cyan-50/40">
            <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-medium text-cyan-900 hover:bg-cyan-50/70">
              <span className="flex items-center gap-2">
                <DatabaseIcon size={14} className="text-cyan-700" />
                运行元数据（run_meta）
              </span>
              <span className="text-xs text-cyan-700">
                tools {Number(msg.runMeta.tool_calls || 0)} · steps {Number(msg.runMeta.supervisor_steps || 0)}
              </span>
            </summary>
            <div className="border-t border-cyan-200/80 bg-white/85 px-4 py-3">
              <div className="grid grid-cols-2 gap-2 text-[12px] md:grid-cols-3">
                {[
                  ['finish_reason', String(msg.runMeta.finish_reason || '-')],
                  ['last_worker', String(msg.runMeta.last_worker || '-')],
                  ['worker_round', String(msg.runMeta.worker_round ?? '-')],
                  ['supervisor_steps', String(msg.runMeta.supervisor_steps ?? '-')],
                  ['last_decision_source', String(msg.runMeta.last_decision_source || '-')],
                  ['last_decision_at', String(msg.runMeta.last_decision_at || '-')],
                  ['requires_analysis', String(Boolean(msg.runMeta.requires_analysis))],
                  ['requires_delivery', String(Boolean(msg.runMeta.requires_delivery))],
                  ['analysis_done', String(Boolean(msg.runMeta.analysis_done))],
                  ['delivery_done', String(Boolean(msg.runMeta.delivery_done))],
                  ['idle_rounds', String(msg.runMeta.consecutive_idle_rounds ?? 0)],
                  ['stream_fallback', String(Boolean(msg.runMeta.stream_fallback))],
                ].map(([k, v]) => (
                  <div key={k} className="rounded-md border border-cyan-100 bg-cyan-50/40 px-2 py-1.5">
                    <div className="text-[10px] uppercase tracking-wide text-cyan-700">{k}</div>
                    <div className="mt-0.5 truncate text-slate-700" title={v}>{v}</div>
                  </div>
                ))}
              </div>
            </div>
          </details>
        )}

        {(msg.ragHits?.length > 0 || msg.ragStatus === 'warming') && (
          <div className="mb-4 overflow-hidden rounded-2xl border border-emerald-200/80 bg-emerald-50/40">
            <div className="flex items-center justify-between border-b border-emerald-200/70 px-4 py-2.5">
              <span className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
                RAG 命中片段（{msg.ragHits.length}）
              </span>
              <span className="text-[11px] text-emerald-700/80">
                {msg.ragStatus === 'warming' ? '模型预热中' : '本轮注入审计'}
              </span>
            </div>
            {msg.ragStatus === 'warming' && msg.ragHits.length === 0 && (
              <div className="border-b border-emerald-100 bg-amber-50 px-3 py-2 text-[12px] text-amber-700">
                Embedding 模型正在后台下载/加载，本轮先不注入 RAG，后续轮次将自动恢复。
              </div>
            )}
            <div className="overflow-x-auto bg-white/80">
              <table className="w-full min-w-[560px] border-collapse text-[12.5px]">
                <thead className="bg-emerald-50 text-emerald-800">
                  <tr>
                    <th className="border-b border-emerald-100 px-3 py-2 text-left font-semibold">来源</th>
                    <th className="border-b border-emerald-100 px-3 py-2 text-left font-semibold">片段</th>
                    <th className="border-b border-emerald-100 px-3 py-2 text-left font-semibold">得分</th>
                  </tr>
                </thead>
                <tbody>
                  {msg.ragHits.map((hit, idx) => (
                    <tr key={`${hit.source || 'source'}-${idx}`}>
                      <td className="border-b border-emerald-50 px-3 py-2 align-top text-slate-700">
                        <div className="font-medium">{hit.source || 'unknown'}</div>
                        {(hit.chunk_index && hit.chunk_total) ? (
                          <div className="mt-0.5 text-[11px] text-slate-500">chunk {hit.chunk_index}/{hit.chunk_total}</div>
                        ) : null}
                      </td>
                      <td className="border-b border-emerald-50 px-3 py-2 align-top text-slate-700">
                        <div className="line-clamp-4 whitespace-pre-wrap">{hit.snippet || ''}</div>
                      </td>
                      <td className="border-b border-emerald-50 px-3 py-2 align-top text-slate-600">
                        {typeof hit.score === 'number' ? hit.score.toFixed(4) : '--'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="space-y-5 text-[15.5px] leading-[1.8] text-foreground">
          {reasoningText && (
            <div className="mb-4 overflow-hidden rounded-xl border border-border bg-muted/30">
              <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/50 px-3 py-2">
                <button
                  className="flex items-center gap-2 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
                  onClick={() => {
                    if (!reasoningPinned) setReasoningCollapsed((prev) => !prev);
                  }}
                >
                  <ChevronRightIcon
                    size={14}
                    className={cn('transition-transform', !reasoningCollapsed ? 'rotate-90' : '')}
                  />
                  <SparklesIcon size={12} />
                  思考过程
                  <span className="rounded-full border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] text-slate-500">
                    {reasoningMode === 'timeline' ? '时间轴' : '全文'}
                  </span>
                </button>
                <div className="flex items-center gap-1">
                  <button
                    className={cn(ui.iconButton, 'rounded-md p-1.5 text-[11px]')}
                    onClick={() => setReasoningMode((prev) => (prev === 'timeline' ? 'plain' : 'timeline'))}
                    title="切换时间轴/全文"
                  >
                    视图
                  </button>
                  <button
                    className={cn(ui.iconButton, 'rounded-md p-1.5 text-[11px]', reasoningPinned ? 'text-brand-700' : '')}
                    onClick={() => {
                      const next = !reasoningPinned;
                      setReasoningPinned(next);
                      localStorage.setItem('sqlAgentReasoningPinned', String(next));
                      if (next) setReasoningCollapsed(false);
                    }}
                    title="固定展开"
                  >
                    固定
                  </button>
                  <button
                    className={cn(ui.iconButton, 'rounded-md p-1.5')}
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(reasoningText);
                        setReasoningCopied(true);
                        setTimeout(() => setReasoningCopied(false), 1500);
                      } catch {}
                    }}
                    title="复制思考过程"
                  >
                    {reasoningCopied ? <CheckIcon size={13} /> : <CopyIcon size={13} />}
                  </button>
                </div>
              </div>

              {(!reasoningCollapsed || reasoningPinned) && (
                <div className="bg-bot-msg/50 px-4 py-3 text-[13.5px] leading-[1.75] text-muted-foreground">
                  {reasoningMode === 'timeline' ? (
                    <ol className="space-y-2">
                      {timelineItems.map((item, index) => (
                        <li key={item.id} className="flex gap-2.5">
                          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-slate-300 bg-white text-[10px] font-semibold text-slate-500">
                            {index + 1}
                          </span>
                          <span className="whitespace-pre-wrap">{item.text}</span>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <div className="whitespace-pre-wrap italic">{reasoningText}</div>
                  )}
                  {isStreaming && isLast && !contentObj.text && (
                    <span className="ml-1 inline-block h-3 w-2.5 animate-pulse bg-muted-foreground align-middle" />
                  )}
                </div>
              )}
            </div>
          )}

          {hasRenderableContent && useStructuredCards && takeaways.length > 0 && (
            <div className="overflow-hidden rounded-2xl border border-brand-100 bg-gradient-to-br from-brand-50/90 to-white">
              <div className="border-b border-brand-100/70 px-5 py-2.5 text-xs font-semibold uppercase tracking-wider text-brand-700">
                关键结论
              </div>
              <div className="px-5 py-3.5">
                <ul className="list-disc space-y-1.5 pl-4 text-[14px] leading-7 text-slate-700">
                  {takeaways.map((item, index) => (
                    <li key={`${index}-${item.slice(0, 20)}`}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {hasRenderableContent && useStructuredCards && (
            <div className="overflow-hidden rounded-[26px] border border-white/80 bg-white/80 shadow-[0_18px_44px_rgba(30,41,59,0.07)]">
              <div className="border-b border-slate-100 bg-slate-50/70 px-5 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
                分析结论
              </div>
              <div className="px-5 py-4">
                {reportSections.conclusion ? (
                  <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                    {reportSections.conclusion}
                  </ReactMarkdown>
                ) : (
                  markdownContent
                )}
                {isStreaming && isLast && <span className="ml-1.5 inline-block h-4 w-2.5 animate-pulse rounded-sm bg-foreground align-middle" />}
              </div>
            </div>
          )}

          {hasEvidenceSection && useStructuredCards && (
            <div className="overflow-hidden rounded-[24px] border border-white/80 bg-white/85 shadow-[0_12px_30px_rgba(30,41,59,0.06)]">
              <div className="border-b border-slate-100 bg-slate-50/70 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                数据证据
              </div>
              <div className="px-5 py-4">
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                  {reportSections.evidence}
                </ReactMarkdown>
              </div>
            </div>
          )}

          {hasRenderableContent && !useStructuredCards && (
            <div className="overflow-hidden rounded-[26px] border border-white/80 bg-white/80 px-5 py-4 shadow-[0_18px_44px_rgba(30,41,59,0.07)]">
              {preferPlainPre ? (
                <div className="whitespace-pre-wrap leading-8 text-slate-700">{contentObj.text}</div>
              ) : (
                markdownContent
              )}
              {isStreaming && isLast && <span className="ml-1.5 inline-block h-4 w-2.5 animate-pulse rounded-sm bg-foreground align-middle" />}
            </div>
          )}

          {msg.charts?.length > 0 && (
            <div className="mt-3 flex flex-col gap-4">
              <div className="px-1 text-xs font-semibold uppercase tracking-wider text-slate-500">
                可视化图表（{msg.charts.length}）
              </div>
              {msg.charts.map((chart, index) => (
                <div key={chart.id} className="overflow-hidden rounded-[24px] border border-white/80 bg-white/85 shadow-[0_16px_36px_rgba(30,41,59,0.07)] transition-shadow hover:shadow-[0_20px_40px_rgba(30,41,59,0.10)]">
                  <div className="border-b border-slate-100 bg-slate-50/70 px-4 py-2 text-xs font-semibold text-slate-500">
                    图表 {index + 1}
                  </div>
                  <div className="p-4">
                    <ChartWrapper chartJson={chart.json} />
                  </div>
                </div>
              ))}
            </div>
          )}

          {hasRecommendationSection && useStructuredCards && (
            <div className="overflow-hidden rounded-[24px] border border-white/80 bg-white/85 shadow-[0_12px_30px_rgba(30,41,59,0.06)]">
              <div className="border-b border-slate-100 bg-slate-50/70 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                行动建议
              </div>
              <div className="px-5 py-4">
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                  {reportSections.recommendation}
                </ReactMarkdown>
              </div>
            </div>
          )}

          {msg.codeOutputs?.length > 0 && (
            <div className="mt-4 flex flex-col gap-4">
              <div className="px-1 text-xs font-semibold uppercase tracking-wider text-slate-500">脚本输出</div>
              {msg.codeOutputs.map((output, index) => (
                <div key={output.id || index} className="overflow-hidden rounded-2xl border border-border bg-muted/30 shadow-sm">
                  {output.stdout && (
                    <div className="p-4">
                      <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                        Python 输出
                      </div>
                      <pre className="overflow-x-auto whitespace-pre-wrap rounded-xl border border-border bg-bot-msg/50 p-3 text-[13px] leading-relaxed text-foreground">{output.stdout}</pre>
                    </div>
                  )}

                  {output.images?.length > 0 && (
                    <div className="flex flex-col gap-3 p-4 pt-0">
                      {output.images.map((image, imageIndex) => (
                        <div key={imageIndex} className="overflow-hidden rounded-xl border border-border bg-bot-msg/50 shadow-sm">
                          <Image
                            src={`data:image/png;base64,${image}`}
                            alt={`Python 图表 ${imageIndex + 1}`}
                            width={1200}
                            height={720}
                            unoptimized
                            className="mx-auto block w-full max-w-2xl"
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {isStreaming && isLast && !hasRenderableContent && (!msg.toolSteps || msg.toolSteps.length === 0) && (
          <div className="flex items-center gap-2 py-2 text-sm text-slate-500" aria-live="polite">
            <SparklesIcon size={16} className="animate-spin text-brand-600" />
            <span className="animate-pulse">AI 推理中...</span>
          </div>
        )}

        {msg.files?.length > 0 && (
          <div className="mt-6 flex flex-wrap gap-3">
            {msg.files.map((file, index) => (
              <a
                key={index}
                className="group/file flex w-full max-w-[300px] items-center gap-3 rounded-xl border border-white/80 bg-white/85 p-3 shadow-sm transition-all hover:border-brand-100 hover:bg-white"
                href={getFileUrl(file.filename)}
                download={file.filename}
                target="_blank"
                rel="noreferrer"
              >
                <div className="rounded-lg bg-muted/50 p-2 text-muted-foreground">
                  <FileIcon size={20} />
                </div>
                <div className="min-w-0 flex-1 overflow-hidden">
                  <div className="truncate text-sm font-medium text-foreground">{file.filename}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">{file.message || '点击下载文档'}</div>
                </div>
                <DownloadIcon className="text-muted-foreground group-hover/file:text-foreground" size={16} />
              </a>
            ))}
          </div>
        )}

        {(!isStreaming || !isLast) && (hasRenderableContent || msg.charts?.length > 0) && (
          <div className="mt-6 flex items-center gap-3 pt-1 opacity-0 transition-opacity group-hover/ai:opacity-100">
            {hasRenderableContent && <CopyButton text={contentObj.text} />}
            {(msg.charts?.length > 0 || contentObj.text?.includes('|')) && <ReportGenerator message={msg} />}
            {(msg.charts?.length > 0 || analysisRequested) && onViewReport && (
              <button
                className="flex items-center gap-1.5 rounded-lg border border-brand-100 bg-brand-50 px-3 py-1.5 text-[13px] font-medium text-brand-700 shadow-sm transition-colors hover:bg-brand-100"
                onClick={() => onViewReport(msg)}
              >
                <BookOpenIcon size={14} />
                进入全视野报告模式
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
});

MessageItem.displayName = 'MessageItem';

const ChartWrapper = memo(({ chartJson }) => {
  const [chartData, setChartData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!chartJson) {
      setError('图表数据为空');
      return;
    }

    try {
      const parsed = parseChartPayload(chartJson);
      if (!parsed) throw new Error('图表数据为空');
      setChartData(parsed);
      setError(null);
    } catch (currentError) {
      setError(currentError.message);
      setChartData(null);
    }
  }, [chartJson]);

  if (error) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">
        <BarChartIcon size={20} className="shrink-0" />
        <span>图表解析失败: {error}</span>
      </div>
    );
  }

  if (!chartData) {
    return (
      <div className="flex h-[200px] items-center justify-center rounded-xl border border-gray-200 bg-gray-50">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
      </div>
    );
  }

  if (chartData.type === 'chart_data' && chartData.data && chartData.data.length > 0) {
    return <SmartChart data={chartData} height={400} />;
  }

  if (chartData.type === 'chart_data') {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-gray-200 bg-gray-50 p-8 text-gray-400">
        <BarChartIcon size={32} className="mb-2 opacity-50" />
        <span className="text-sm">图表数据为空</span>
      </div>
    );
  }

  if (chartData.data && chartData.layout) {
    const trace = chartData.data[0];
    const xData = trace.x || [];
    const yData = trace.y || [];

    const data = xData.map((x, index) => ({
      [trace.name || 'category']: x,
      [trace.name || 'value']: yData[index],
    }));

    let chartType = 'bar';
    if (trace.type === 'scatter') chartType = 'line';
    if (trace.type === 'pie') chartType = 'pie';

    return (
      <SmartChart
        data={data}
        chartType={chartType}
        title={chartData.layout.title?.text || ''}
        xCol={trace.name || 'category'}
        yCol={trace.name || 'value'}
        height={400}
      />
    );
  }

  if (Array.isArray(chartData)) {
    return <SmartChart data={chartData} height={400} />;
  }

  return (
    <div className="flex items-center gap-2 rounded-xl border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-700">
      <BarChartIcon size={20} className="shrink-0" />
      <span>无法识别的图表数据格式</span>
    </div>
  );
});

ChartWrapper.displayName = 'ChartWrapper';

export default function ChatMessages({ messages, isStreaming, onViewReport, onEditSend, compactMode = true }) {
  const bottomRef = useRef(null);
  const containerRef = useRef(null);
  const [isUserAtBottom, setIsUserAtBottom] = useState(true);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      setIsUserAtBottom(scrollHeight - scrollTop - clientHeight < 100);
    };

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    if (!bottomRef.current || !isUserAtBottom || isStreaming) return;
    requestAnimationFrame(() => {
      bottomRef.current?.scrollIntoView({ behavior: 'auto' });
    });
  }, [messages, isStreaming, isUserAtBottom]);

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="flex w-full max-w-2xl flex-col items-center">
          <EmptyState
            icon={<SparklesIcon size={32} className="text-brand-700" />}
            title="SQL Agent"
            description="你的智能数据分析助手。通过自然语言对话，轻松完成数据库查询、可视化图表和业务报告撰写。"
          />

          <div className="mb-4 -mt-3">
            <StatusBadge tone="info">你可以直接从下面的提示开始</StatusBadge>
          </div>

          <div className="grid w-full grid-cols-1 gap-4 md:grid-cols-2">
            {[
              { icon: <DatabaseIcon size={20} />, title: '查询数据库', desc: '连接并分析任意数据源', prompt: '查看所有数据库表结构' },
              { icon: <BarChartIcon size={20} />, title: '生成图表', desc: '10多种图表支持', prompt: '对比各部门的业绩并画柱状图' },
              { icon: <SparklesIcon size={20} />, title: '复杂分析', desc: '多维交叉探索', prompt: '帮我分析最近一个月的销售趋势' },
              { icon: <FileIcon size={20} />, title: '导出报告', desc: 'Markdown长图与CSV', prompt: '生成上一季度的综合业绩报告' },
            ].map((item, index) => (
              <div key={index} className="group cursor-pointer rounded-[24px] border border-white/80 bg-white/80 p-4 text-left shadow-[0_12px_34px_rgba(30,41,59,0.06)] transition-all hover:border-brand-200 hover:shadow-[0_18px_40px_rgba(30,41,59,0.10)]">
                <div className="mb-2 flex items-center gap-3 font-medium text-foreground">
                  {item.icon}
                  <span>{item.title}</span>
                </div>
                <div className="mb-3 text-xs text-muted-foreground">{item.desc}</div>
                <div className="rounded-lg border border-brand-100 bg-brand-50/70 p-2 text-[0.8rem] text-muted-foreground transition-colors group-hover:bg-brand-50">
                  &quot;{item.prompt}&quot;
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full overflow-y-auto overflow-x-hidden" ref={containerRef}>
      <div className={compactMode ? 'mx-auto w-full max-w-4xl px-5 py-6 lg:px-8' : 'mx-auto w-full max-w-4xl px-6 py-8 lg:px-10'}>
        {messages.map((msg, index) => (
          (() => {
            const recentUser = [...messages.slice(0, index)].reverse().find((item) => item.role === 'user');
            const analysisRequested = isExplicitAnalysisRequest(recentUser?.content || '');
            return (
          <MessageItem
            key={msg.id}
            msg={msg}
            isStreaming={isStreaming}
            isLast={index === messages.length - 1}
            onViewReport={onViewReport}
            onEditSend={onEditSend}
            analysisRequested={analysisRequested}
          />
            );
          })()
        ))}
        <div ref={bottomRef} className="h-4" />
      </div>
    </div>
  );
}
