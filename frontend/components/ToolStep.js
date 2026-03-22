'use client';

/**
 * 工具调用步骤折叠组件 (纯 Tailwind 实现)
 */

import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  WrenchIcon, CheckCircleIcon, SpinnerIcon,
  ChevronRightIcon, InputIcon, OutputIcon,
} from './Icons';

export default function ToolStep({ step }) {
  const [expanded, setExpanded] = useState(false);

  const isRunning = step.status === 'running';

  const formatContent = (content) => {
    if (!content) return null;

    try {
      const parsed = JSON.parse(content);
      
      // 智能猜测是否为 SQL 查询的行集数组，若是则渲染美观的小表格
      if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'object' && parsed[0] !== null) {
        const keys = Object.keys(parsed[0]);
        if (keys.length > 0) {
          return (
            <div className="my-2 overflow-x-auto border border-gray-200 rounded-lg shadow-sm">
              <table className="w-full text-left border-collapse text-[13px]">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200 text-gray-700">
                    {keys.map((k, i) => <th key={i} className="px-3 py-2 font-medium whitespace-nowrap">{k}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {parsed.slice(0, 10).map((row, i) => (
                    <tr key={i} className="hover:bg-gray-50/50 transition-colors">
                      {keys.map((k, j) => (
                        <td key={j} className="px-3 py-1.5 text-gray-600 truncate max-w-[200px]" title={String(row[k])}>
                          {String(row[k])}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {parsed.length > 10 && (
                    <tr>
                      <td colSpan={keys.length} className="px-3 py-2 text-center text-gray-400 italic bg-gray-50/50">
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
        <pre className="p-3 bg-gray-50 text-gray-800 border border-gray-200 rounded-xl text-[13px] font-mono overflow-x-auto my-2 shadow-inner">
          <code>{JSON.stringify(parsed, null, 2)}</code>
        </pre>
      );
    } catch {
      if (content.includes('|') && content.includes('---')) {
        return <div className="prose prose-sm max-w-none"><ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown></div>;
      }
      if (content.includes('\n- ') || content.includes('\n  - ')) {
        return <div className="prose prose-sm max-w-none"><ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown></div>;
      }

      return (
        <div className="text-sm text-gray-700 font-mono leading-relaxed bg-gray-50 p-3 rounded-lg border border-gray-100 whitespace-pre-wrap word-break">
          {content}
        </div>
      );
    }
  };

  return (
    <div className={`mt-1.5 mb-1 w-full max-w-full rounded-xl border overflow-hidden transition-all duration-300 ${isRunning ? 'border-amber-200/50 bg-amber-50/30' : 'border-transparent bg-white shadow-sm hover:shadow-md'}`}>
      <div 
        className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-gray-50 transition-colors select-none"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {isRunning ? (
            <SpinnerIcon size={14} className="text-amber-500 animate-spin shrink-0" />
          ) : (
            <CheckCircleIcon size={14} className="text-emerald-500 shrink-0" />
          )}
          <span className="font-semibold text-[13px] text-gray-700 truncate tracking-wide">{step.name}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0 pl-2">
          <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-md ${isRunning ? 'text-amber-600' : 'text-gray-400'}`}>
            {isRunning ? '处理中...' : '完成'}
          </span>
          <ChevronRightIcon
            size={16}
            className={`text-gray-400 transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`}
          />
        </div>
      </div>
      
      {expanded && (
        <div className="px-4 pb-4 pt-1 border-t border-gray-100 bg-white">
          {step.input && (
            <div className="mt-3">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-brand-600 uppercase tracking-wide mb-2">
                <InputIcon size={13} />
                <span>输入参数</span>
              </div>
              <div>{formatContent(step.input)}</div>
            </div>
          )}
          {step.output && (
            <div className="mt-4 pt-4 border-t border-gray-100">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-brand-600 uppercase tracking-wide mb-2">
                <OutputIcon size={13} />
                <span>返回结果</span>
              </div>
              <div>{formatContent(step.output)}</div>
            </div>
          )}
          {isRunning && !step.output && (
            <div className="flex items-center gap-2 mt-4 pt-4 border-t border-gray-100 text-sm text-gray-500">
              <SpinnerIcon size={14} className="animate-spin" />
              <span>正在处理...</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
