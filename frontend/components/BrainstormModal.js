'use client';

import { useEffect, useState } from 'react';

import { CloseIcon, SparklesIcon, MessageIcon, CheckIcon } from './Icons';
import { runBrainstormAnalysis } from '@/lib/api';
import { buildDecisionReport } from '@/lib/reportBuilder';

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
    <div className="fixed inset-0 z-[10000] bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-6xl h-[88vh] bg-popover border border-border rounded-3xl shadow-2xl overflow-hidden flex">
        <div className="w-[360px] shrink-0 border-r border-border bg-muted/30 p-6 flex flex-col">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-foreground text-background flex items-center justify-center">
                <SparklesIcon size={18} />
              </div>
              <div>
                <div className="text-sm font-bold text-foreground">多专家会商</div>
                <div className="text-xs text-muted-foreground">Data + Risk + Strategy</div>
              </div>
            </div>
            <button className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl transition" onClick={onClose}>
              <CloseIcon size={18} />
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">核心任务</label>
              <textarea
                rows={7}
                className="w-full p-4 rounded-2xl border border-border bg-popover text-sm text-foreground resize-none focus:outline-none focus:ring-2 focus:ring-foreground/10"
                placeholder="例如：分析最近一个月销售下滑的根因，并给出决策建议"
                value={task}
                onChange={(e) => setTask(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">补充上下文</label>
              <textarea
                rows={8}
                className="w-full p-4 rounded-2xl border border-border bg-popover text-sm text-foreground resize-none focus:outline-none focus:ring-2 focus:ring-foreground/10"
                placeholder="补充业务背景、现有数据结论、约束条件等"
                value={context}
                onChange={(e) => setContext(e.target.value)}
              />
            </div>
          </div>

          <div className="mt-auto pt-5 space-y-3">
            <div className="text-xs text-muted-foreground">当前模型：{selectedModel}</div>
            <button
              className="w-full px-4 py-3 rounded-2xl bg-foreground text-background text-sm font-semibold hover:opacity-90 transition disabled:opacity-50"
              onClick={handleRun}
              disabled={loading || !task.trim()}
            >
              {loading ? '会商进行中...' : '启动多专家会商'}
            </button>
            {result?.final_report && (
              <div className="space-y-2">
                <button
                  className="w-full px-4 py-3 rounded-2xl border border-border bg-popover text-foreground text-sm font-semibold hover:bg-muted transition"
                  onClick={() => onAdopt?.(result.final_report)}
                >
                  将结论发送到对话
                </button>
                <button
                  className="w-full px-4 py-3 rounded-2xl border border-border bg-popover text-foreground text-sm font-semibold hover:bg-muted transition"
                  onClick={() => onOpenReport?.(buildDecisionReport(result))}
                >
                  打开结构化报告
                </button>
              </div>
            )}
            {error && <div className="text-sm text-red-600">{error}</div>}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-8 bg-background">
          {!result ? (
            <div className="h-full flex items-center justify-center">
              <div className="max-w-xl text-center">
                <div className="w-16 h-16 mx-auto mb-5 rounded-3xl bg-muted flex items-center justify-center text-muted-foreground">
                  <MessageIcon size={28} />
                </div>
                <div className="text-2xl font-bold text-foreground mb-3">让多个专家先吵一轮</div>
                <div className="text-sm text-muted-foreground leading-7">
                  这个模式会分别从数据分析、风险审查、策略设计三个角度审视问题，
                  然后再合成一份更像“决策简报”的最终报告。
                </div>
              </div>
            </div>
          ) : (
            <div className="max-w-4xl mx-auto space-y-8">
              <section className="bg-popover border border-border rounded-3xl p-7 shadow-sm">
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
                  <div key={item.role} className="bg-popover border border-border rounded-3xl p-6 shadow-sm">
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
