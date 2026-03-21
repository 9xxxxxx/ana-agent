'use client';

/**
 * 报告生成器组件
 * 将 AI 分析结果转换为结构化的深度业务报告
 */

import { useState, useCallback } from 'react';
import ReportViewer from './ReportViewer';

/**
 * 从 AI 消息内容解析报告数据
 */
export function parseReportFromMessage(content, charts = [], metadata = {}) {
  // 尝试解析 Markdown 格式的报告
  const lines = content.split('\n');
  
  const report = {
    id: `report-${Date.now()}`,
    title: metadata.title || '数据分析报告',
    subtitle: metadata.subtitle || '',
    type: metadata.type || '业务报告',
    createdAt: new Date().toLocaleString('zh-CN'),
    summary: '',
    sections: [],
    conclusion: '',
    metrics: metadata.metrics || [],
    charts: charts || [],
  };

  let currentSection = null;
  let sectionContent = [];
  let isInSummary = false;
  let isInConclusion = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // 检测标题
    if (line.startsWith('# ') && !report.title) {
      report.title = line.replace('# ', '');
      continue;
    }
    
    if (line.startsWith('## ')) {
      // 保存上一个章节
      if (currentSection) {
        currentSection.content = sectionContent.join('\n').trim();
        report.sections.push(currentSection);
      }
      
      // 检测特殊章节
      const heading = line.replace('## ', '').toLowerCase();
      if (heading.includes('摘要') || heading.includes('概述')) {
        isInSummary = true;
        isInConclusion = false;
        currentSection = null;
        sectionContent = [];
        continue;
      }
      if (heading.includes('结论') || heading.includes('建议')) {
        isInConclusion = true;
        isInSummary = false;
        currentSection = null;
        sectionContent = [];
        continue;
      }
      
      // 新章节
      isInSummary = false;
      isInConclusion = false;
      currentSection = {
        title: line.replace('## ', ''),
        content: '',
        charts: [],
        metrics: [],
        table: null,
      };
      sectionContent = [];
      continue;
    }
    
    // 收集内容
    if (isInSummary) {
      report.summary += line + '\n';
    } else if (isInConclusion) {
      report.conclusion += line + '\n';
    } else if (currentSection) {
      sectionContent.push(line);
    }
  }
  
  // 保存最后一个章节
  if (currentSection) {
    currentSection.content = sectionContent.join('\n').trim();
    report.sections.push(currentSection);
  }
  
  // 清理
  report.summary = report.summary.trim();
  report.conclusion = report.conclusion.trim();
  
  // 如果没有解析出章节，创建默认章节
  if (report.sections.length === 0 && content) {
    report.sections.push({
      title: '分析详情',
      content: content,
      charts: charts.map((c, i) => ({ title: `图表 ${i + 1}`, data: c.json })),
    });
  } else {
    // 将图表分配到各章节
    report.sections.forEach((section, index) => {
      if (charts[index]) {
        section.charts = [{ title: '', data: charts[index].json }];
      }
    });
  }
  
  return report;
}

/**
 * 报告生成器组件
 */
export default function ReportGenerator({ message, onClose }) {
  const [showReport, setShowReport] = useState(false);
  
  const report = parseReportFromMessage(
    message.content,
    message.charts,
    { title: '数据分析报告' }
  );

  const handleExport = useCallback((format) => {
    if (format === 'markdown') {
      // 导出 Markdown
      const markdown = generateMarkdown(report);
      const blob = new Blob([markdown], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${report.title}.md`;
      a.click();
      URL.revokeObjectURL(url);
    } else if (format === 'pdf') {
      // 触发浏览器打印为 PDF
      window.print();
    }
  }, [report]);

  if (showReport) {
    return (
      <div className="report-modal-overlay" onClick={onClose}>
        <div className="report-modal" onClick={(e) => e.stopPropagation()}>
          <ReportViewer
            report={report}
            onExport={handleExport}
            onClose={() => setShowReport(false)}
          />
        </div>
      </div>
    );
  }

  return (
    <button
      className="generate-report-btn"
      onClick={() => setShowReport(true)}
    >
      <span className="btn-icon">📊</span>
      <span>查看完整报告</span>
    </button>
  );
}

/**
 * 生成 Markdown 格式报告
 */
function generateMarkdown(report) {
  let md = `# ${report.title}\n\n`;
  
  if (report.subtitle) {
    md += `> ${report.subtitle}\n\n`;
  }
  
  md += `**生成时间**: ${report.createdAt}\n\n`;
  
  if (report.summary) {
    md += `## 执行摘要\n\n${report.summary}\n\n`;
  }
  
  report.sections.forEach((section) => {
    md += `## ${section.title}\n\n`;
    md += `${section.content}\n\n`;
  });
  
  if (report.conclusion) {
    md += `## 结论与建议\n\n${report.conclusion}\n\n`;
  }
  
  return md;
}
