'use client';

/**
 * 报告查看器演示页面
 */

import { ReportViewer } from '@/components/report';
import { sampleReport } from '@/components/report/sampleReport';

export default function ReportDemoPage() {
  const handleExport = (format: string) => {
    console.log('导出格式:', format);
  };

  return (
    <div className="h-screen bg-[linear-gradient(180deg,#efe4d2_0%,#f8f2e7_100%)] p-4 md:p-6">
      <div className="mx-auto flex h-full max-w-[1600px] flex-col overflow-hidden rounded-[36px] border border-stone-200 bg-[#fbf7ef] shadow-[0_24px_80px_rgba(95,73,44,0.12)]">
        <div className="border-b border-stone-200 px-6 py-5">
          <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-stone-500">Demo Environment</div>
          <div className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-stone-950">可编排报告工作台演示</div>
          <div className="mt-2 text-sm leading-7 text-stone-600">
            这里直接展示新的报告画布能力：拖拽排序、模板切换、块级编辑、成品预览和 Markdown 导出。
          </div>
        </div>
        <div className="min-h-0 flex-1">
          <ReportViewer
            report={sampleReport}
            onExport={handleExport}
            onClose={() => console.log('关闭报告')}
          />
        </div>
      </div>
    </div>
  );
}
