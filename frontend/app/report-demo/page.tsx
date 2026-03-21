'use client';

/**
 * 报告查看器演示页面
 */

import { ReportViewer } from '@/components/report';
import { sampleReport } from '@/components/report/sampleReport';

export default function ReportDemoPage() {
  const handleExport = (format: string) => {
    console.log('导出格式:', format);
    alert(`导出 ${format.toUpperCase()} 功能将在实际应用中实现`);
  };

  return (
    <div style={{ height: '100vh' }}>
      <ReportViewer
        report={sampleReport}
        onExport={handleExport}
      />
    </div>
  );
}
