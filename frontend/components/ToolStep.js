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
      return (
        <pre className="p-3 bg-gray-900 text-gray-100 rounded-lg text-xs font-mono overflow-x-auto my-2">
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
    <div className={`mt-2 mb-2 w-full max-w-full rounded-xl border overflow-hidden transition-all duration-300 ${isRunning ? 'border-amber-300 bg-amber-50/30' : 'border-gray-200 bg-white'}`}>
      <div 
        className="flex items-center justify-between p-3 cursor-pointer hover:bg-gray-50 transition-colors select-none"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          {isRunning ? (
            <SpinnerIcon size={16} className="text-amber-500 animate-spin shrink-0" />
          ) : (
            <CheckCircleIcon size={16} className="text-green-500 shrink-0" />
          )}
          <WrenchIcon size={14} className="text-gray-400 shrink-0" />
          <span className="font-medium text-sm text-gray-700 truncate">{step.name}</span>
        </div>
        <div className="flex items-center gap-3 shrink-0 pl-2">
          <span className={`text-[0.65rem] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full ${isRunning ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'}`}>
            {isRunning ? '执行中...' : '完成'}
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
