function makeId(prefix = 'block') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createCanvasBlock(type, overrides = {}) {
  return {
    id: makeId(type),
    type,
    title: '',
    content: '',
    ...overrides,
  };
}

function extractChecklistItems(markdown = '') {
  const matches = markdown.match(/^- \[[ xX]\] .+$/gm);
  if (!matches?.length) {
    return [
      { id: makeId('todo'), text: '补充第一项行动', checked: false },
      { id: makeId('todo'), text: '补充负责人和截止时间', checked: false },
    ];
  }

  return matches.map((line) => ({
    id: makeId('todo'),
    text: line.replace(/^- \[[ xX]\]\s*/, ''),
    checked: line.includes('[x]') || line.includes('[X]'),
  }));
}

export function reportToCanvasBlocks(report) {
  if (!report) return [];

  const blocks = [
    createCanvasBlock('hero', {
      title: report.title || '未命名报告',
      subtitle: report.subtitle || '',
      badge: report.type || '业务报告',
      createdAt: report.createdAt || new Date().toLocaleString(),
    }),
  ];

  if (report.summary) {
    blocks.push(
      createCanvasBlock('text', {
        title: '执行摘要',
        content: report.summary,
        tone: 'summary',
      })
    );
  }

  if (report.metrics?.length) {
    blocks.push(
      createCanvasBlock('metrics', {
        title: '关键指标',
        items: report.metrics,
      })
    );
  }

  report.sections?.forEach((section) => {
    blocks.push(
      createCanvasBlock('text', {
        title: section.title,
        content: section.content || '',
        tone: 'section',
      })
    );

    section.charts?.forEach((chart) => {
      blocks.push(
        createCanvasBlock('chart', {
          title: chart.title || section.title,
          chartData: chart.data,
          note: '',
        })
      );
    });

    if (section.table) {
      blocks.push(
        createCanvasBlock('table', {
          title: section.table.title || `${section.title} 数据表`,
          columns: section.table.columns || [],
          rows: section.table.data || [],
        })
      );
    }

    if (section.metrics?.length) {
      blocks.push(
        createCanvasBlock('metrics', {
          title: `${section.title} 指标`,
          items: section.metrics,
        })
      );
    }
  });

  if (report.conclusion) {
    blocks.push(
      createCanvasBlock('checklist', {
        title: '结论与行动',
        items: extractChecklistItems(report.conclusion),
        content: report.conclusion,
      })
    );
  }

  return blocks;
}

export function getCanvasStorageKey(report) {
  const seed = report?.id || report?.title || 'untitled-report';
  return `sql-agent-report-canvas:${seed}`;
}

export function getBlockHeading(block) {
  if (!block) return '未命名块';
  if (block.type === 'hero') return block.title || '封面';
  return block.title || `${block.type} 模块`;
}
