'use client';

/**
 * 报告生成器组件
 * 将 AI 分析结果转换为结构化的深度业务报告
 */

import { useState, useCallback } from 'react';
import ReportViewer from './ReportViewer';

/**
 * 从 Markdown 表格文本中提取结构化数据
 * 支持 GFM 格式表格：| col1 | col2 |
 */
function parseMarkdownTable(text) {
  const lines = text.split('\n').filter(l => l.trim());
  const tables = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i].trim();
    // 检测表头行（包含 | 符号）
    if (line.startsWith('|') && line.endsWith('|')) {
      // 检查下一行是否是分隔线（|---|---|）
      if (i + 1 < lines.length) {
        const sepLine = lines[i + 1].trim();
        if (sepLine.match(/^\|[\s\-:]+(\|[\s\-:]+)+\|$/)) {
          // 提取表头
          const headers = line.split('|').filter(c => c.trim()).map(c => c.trim());
          const columns = headers.map(h => ({ key: h, label: h }));
          const data = [];

          // 跳过分隔行，提取数据行
          let j = i + 2;
          while (j < lines.length) {
            const dataLine = lines[j].trim();
            if (!dataLine.startsWith('|') || !dataLine.endsWith('|')) break;
            const cells = dataLine.split('|').filter(c => c.trim() !== '').map(c => c.trim());
            if (cells.length > 0) {
              const row = {};
              headers.forEach((h, idx) => {
                row[h] = cells[idx] || '';
              });
              data.push(row);
            }
            j++;
          }

          if (data.length > 0) {
            tables.push({ columns, data });
          }
          i = j;
          continue;
        }
      }
    }
    i++;
  }

  return tables;
}

/**
 * 从 AI 消息内容解析报告数据
 */
export function parseReportFromMessage(content, charts = [], metadata = {}) {
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

    // 检测一级标题
    if (line.startsWith('# ') && !report.title) {
      report.title = line.replace('# ', '');
      continue;
    }

    if (line.startsWith('## ')) {
      // 保存上一个章节
      if (currentSection) {
        currentSection.content = sectionContent.join('\n').trim();
        // 从内容中解析表格数据
        const tables = parseMarkdownTable(currentSection.content);
        if (tables.length > 0) {
          currentSection.table = tables[0]; // 取第一个表格
        }
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
    const tables = parseMarkdownTable(currentSection.content);
    if (tables.length > 0) {
      currentSection.table = tables[0];
    }
    report.sections.push(currentSection);
  }

  // 清理
  report.summary = report.summary.trim();
  report.conclusion = report.conclusion.trim();

  // 如果没有解析出章节，创建默认章节
  if (report.sections.length === 0 && content) {
    // 尝试从整个内容解析表格
    const tables = parseMarkdownTable(content);
    report.sections.push({
      title: '分析详情',
      content: content,
      charts: charts.map((c, i) => ({ title: `图表 ${i + 1}`, data: c.json })),
      table: tables.length > 0 ? tables[0] : null,
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
      const markdown = generateMarkdown(report);
      const blob = new Blob([markdown], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${report.title}.md`;
      a.click();
      URL.revokeObjectURL(url);
    } else if (format === 'pdf') {
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
