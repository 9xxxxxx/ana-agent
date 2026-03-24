'use client';

import { useEffect, useState } from 'react';

import { CloseIcon, SparklesIcon, MessageIcon, CheckIcon } from './Icons';
import { runBrainstormAnalysis } from '@/lib/api';
import { buildDecisionReport } from '@/lib/reportBuilder';
import { cn, ui } from './ui';
import { EmptyState, InlineFeedback, LoadingState } from './status';

export default function BrainstormModal({ isOpen, onClose, onAdopt, onOpenReport }) {
  const [task, setTask] = useState('');
  const [context, setContext] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const selectedModel = typeof window === 'undefined'
    ? 'deepseek-chat'
    : (localStorage.getItem('sqlAgentModel') || 'deepseek-chat');

  useEffect(() => {
    if (!isOpen) {
      setLoading(false);
      setError('');
      setResult(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleRun = async () => {
    if (!task.trim() || loading) return;
    setLoading(true);
    setError('');
    setResult(null);

    try {
      const apiKey = localStorage.getItem('sqlAgentApiKey') || '';
      const baseUrl = localStorage.getItem('sqlAgentBaseUrl') || '';
      const response = await runBrainstormAnalysis({
        task,
        context,
        model: selectedModel,
        api_key: apiKey,
        base_url: baseUrl,
      });

      if (!response.success) {
        throw new Error(response.message || '多专家会商失败');
      }

      setResult(response.result);
    } catch (e) {
      setError(e.message || '多专家会商失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm">
      <div className="flex h-[88vh] w-full max-w-6xl overflow-hidden rounded-[30px] border border-zinc-200 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.2)]">
        <div className="flex w-[360px] shrink-0 flex-col border-r border-zinc-200 bg-zinc-50 p-6">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-zinc-900 text-white">
                <SparklesIcon size={18} />
              </div>
              <div>
                <div className="text-sm font-bold text-foreground">多专家会商</div>
                <div className="text-xs text-muted-foreground">Data + Risk + Strategy</div>
              </div>
            </div>
            <button className={cn(ui.iconButton, 'rounded-xl')} onClick={onClose}>
              <CloseIcon size={18} />
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">核心任务</label>
              <textarea
                rows={7}
                className={cn(ui.textarea, 'min-h-[156px] p-4 text-sm leading-7')}
                placeholder="例如：分析最近一个月销售下滑的根因，并给出决策建议"
                value={task}
                onChange={(e) => setTask(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">补充上下文</label>
              <textarea
                rows={8}
                className={cn(ui.textareaMuted, 'min-h-[176px] p-4 text-sm leading-7')}
                placeholder="补充业务背景、现有数据结论、约束条件等"
                value={context}
                onChange={(e) => setContext(e.target.value)}
              />
            </div>
          </div>

          <div className="mt-auto pt-5 space-y-3">
            <div className="text-xs text-muted-foreground">当前模型：{selectedModel}</div>
            <button
              className={cn(ui.buttonPrimary, 'w-full justify-center rounded-2xl px-4 py-3 disabled:opacity-50')}
              onClick={handleRun}
              disabled={loading || !task.trim()}
            >
              {loading ? '会商进行中...' : '启动多专家会商'}
            </button>
            {result?.final_report && (
              <div className="space-y-2">
                <button
                  className={cn(ui.buttonSecondary, 'w-full justify-center rounded-2xl px-4 py-3')}
                  onClick={() => onAdopt?.(result.final_report)}
                >
                  将结论发送到对话
                </button>
                <button
                  className={cn(ui.buttonSecondary, 'w-full justify-center rounded-2xl px-4 py-3')}
                  onClick={() => onOpenReport?.(buildDecisionReport(result))}
                >
                  打开可编排报告画布
                </button>
              </div>
            )}
            {error && <InlineFeedback tone="danger" message={error} />}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto bg-[linear-gradient(180deg,#f8fafc_0%,#f3f4f6_100%)] p-8">
          {loading ? (
            <LoadingState
              title="多专家会商进行中"
              description="正在分别生成数据、风险和策略视角的分析，再汇总为一份决策简报。"
            />
          ) : !result ? (
            <EmptyState
              icon={<MessageIcon size={28} />}
              title="让多个专家先吵一轮"
              description="这个模式会分别从数据分析、风险审查、策略设计三个角度审视问题，然后再合成一份更像“决策简报”的最终报告。"
            />
          ) : (
            <div className="max-w-4xl mx-auto space-y-8">
              <section className="rounded-3xl border border-zinc-200 bg-white p-7 shadow-sm">
                <div className="flex items-center gap-2 mb-4">
                  <CheckIcon size={16} className="text-green-600" />
                  <h2 className="text-lg font-bold text-foreground">最终决策简报</h2>
                </div>
                <div className="whitespace-pre-wrap text-[15px] leading-8 text-foreground">
                  {result.final_report}
                </div>
              </section>

              <section className="grid grid-cols-1 xl:grid-cols-3 gap-5">
                {result.specialists?.map((item) => (
                  <div key={item.role} className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
                    <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                      {item.role}
                    </div>
                    <div className="whitespace-pre-wrap text-sm leading-7 text-foreground/90">
                      {item.content}
                    </div>
                  </div>
                ))}
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
