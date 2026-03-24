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

export function generateDecisionPackBlocks(blocks = []) {
  const hero = blocks.find((block) => block.type === 'hero');
  const summarySources = blocks
    .filter((block) => block.type === 'text' || block.type === 'callout')
    .slice(0, 3)
    .map((block) => `- ${block.title}: ${(block.content || '').split('\n').find(Boolean) || ''}`)
    .join('\n');
  const actions = blocks.find((block) => block.type === 'action_items');
  const actionItems = (actions?.items || []).slice(0, 5);
  const risks = blocks
    .filter((block) => block.type === 'expert_opinion' && block.stance === 'risk')
    .slice(0, 3)
    .map((block) => `- ${block.title}: ${(block.content || '').split('\n').find(Boolean) || ''}`)
    .join('\n');

  return [
    createCanvasBlock('hero', {
      title: `${hero?.title || '未命名报告'} · 决策包`,
      subtitle: '用于高层同步的浓缩版摘要、风险与执行动作',
      badge: 'Decision Pack',
      createdAt: new Date().toLocaleString(),
    }),
    createCanvasBlock('text', {
      title: '高层摘要',
      content: summarySources || '补充核心判断、关键数据和结论。',
      tone: 'summary',
    }),
    createCanvasBlock('callout', {
      title: '核心风险',
      content: risks || '当前暂无显著风险，请补充依赖与潜在阻塞。',
      tone: 'note',
    }),
    createCanvasBlock('action_items', {
      title: '关键动作',
      items: actionItems.length
        ? actionItems
        : [
            { id: makeId('task'), title: '补充关键动作', owner: '待分配', dueDate: '待定', status: 'todo', priority: 'high' },
          ],
    }),
  ];
}

export function convertExpertOpinionToBlock(expertBlock, targetType = 'action_items') {
  const title = expertBlock?.title || expertBlock?.role || '专家观点';
  const content = expertBlock?.content || '';

  if (targetType === 'callout') {
    return createCanvasBlock('callout', {
      title: `${title} 风险提炼`,
      content,
      tone: 'note',
    });
  }

  if (targetType === 'text') {
    return createCanvasBlock('text', {
      title: `${title} 结论摘录`,
      content,
      tone: 'summary',
    });
  }

  return createCanvasBlock('action_items', {
    title: `${title} 执行动作`,
    items: [
      {
        id: makeId('task'),
        title: content.split('\n').find(Boolean)?.slice(0, 72) || `跟进 ${title} 建议`,
        owner: '待分配',
        dueDate: '待定',
        status: 'todo',
        priority: expertBlock?.stance === 'risk' ? 'high' : 'medium',
      },
    ],
  });
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

function normalizeActionItems(items = []) {
  if (!items.length) {
    return [
      { id: makeId('task'), title: '补充行动项', owner: '待分配', dueDate: '待定', status: 'todo', priority: 'high' },
    ];
  }

  return items.map((item) => ({
    id: item.id || makeId('task'),
    title: item.title || item.text || '未命名行动项',
    owner: item.owner || '待分配',
    dueDate: item.dueDate || '待定',
    status: item.status || 'todo',
    priority: item.priority || 'medium',
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

  if (report.specialists?.length) {
    report.specialists.forEach((item, index) => {
      blocks.push(
        createCanvasBlock('expert_opinion', {
          title: item.role || `专家 ${index + 1}`,
          content: item.content || '',
          role: item.role || `专家 ${index + 1}`,
          stance: item.role?.includes('风险') ? 'risk' : item.role?.includes('策略') ? 'strategy' : 'analysis',
        })
      );
    });
  }

  report.sections?.forEach((section) => {
    if (section.title?.startsWith('专家观点 ')) {
      return;
    }
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

  if (report.actionItems?.length) {
    blocks.push(
      createCanvasBlock('action_items', {
        title: '执行计划',
        items: normalizeActionItems(report.actionItems),
      })
    );
  }

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

export function exportCanvasToMarkdown(blocks = []) {
  return blocks
    .map((block) => {
      if (block.type === 'hero') {
        return `# ${block.title || '未命名报告'}\n\n${block.subtitle || ''}\n\n> ${block.badge || '报告'} · ${block.createdAt || ''}`.trim();
      }

      if (block.type === 'metrics') {
        const rows = (block.items || []).map((item) => `- **${item.title || item.label || '指标'}**: ${item.value || '-'}`);
        return `## ${block.title || '关键指标'}\n\n${rows.join('\n')}`;
      }

      if (block.type === 'chart') {
        const note = block.note ? `\n\n${block.note}` : '';
        return `## ${block.title || '图表分析'}\n\n[图表已在工作台中编排]${note}`;
      }

      if (block.type === 'table') {
        const columns = block.columns || [];
        const rows = block.rows || [];
        const header = columns.map((column) => column.label || column.key).join(' | ');
        const divider = columns.map(() => '---').join(' | ');
        const body = rows
          .map((row) => columns.map((column) => row[column.key] ?? '').join(' | '))
          .join('\n');
        return `## ${block.title || '数据表'}\n\n| ${header} |\n| ${divider} |\n${body ? `| ${body.replace(/\n/g, ' |\n| ')} |` : ''}`;
      }

      if (block.type === 'checklist') {
        const items = (block.items || [])
          .map((item) => `- [${item.checked ? 'x' : ' '}] ${item.text || ''}`)
          .join('\n');
        return `## ${block.title || '行动清单'}\n\n${block.content || ''}\n\n${items}`.trim();
      }

      if (block.type === 'action_items') {
        const items = (block.items || [])
          .map((item) => `- [${item.status === 'done' ? 'x' : ' '}] ${item.title} | Owner: ${item.owner} | Due: ${item.dueDate} | Priority: ${item.priority}`)
          .join('\n');
        return `## ${block.title || '执行计划'}\n\n${items}`.trim();
      }

      if (block.type === 'expert_opinion') {
        return `## ${block.title || block.role || '专家观点'}\n\n${block.content || ''}`.trim();
      }

      if (block.type === 'orchestration_snapshot') {
        const summary = block.summary || {};
        const rows = [
          `- Deployments: ${summary.deployment_count ?? 0}`,
          `- Recent Runs: ${summary.recent_run_count ?? 0}`,
          `- Bound Runs: ${summary.deployment_run_count ?? 0}`,
        ].join('\n');
        const runs = (block.runs || [])
          .map((run) => `- ${run.name || run.id}: ${run.state_name || 'Unknown'} | ${run.deployment_name || '未绑定'} | ${run.start_time || run.expected_start_time || '未开始'}`)
          .join('\n');
        return `## ${block.title || '任务编排快照'}\n\n${rows}\n\n${runs}\n\n${block.note || ''}`.trim();
      }

      return `## ${block.title || '内容块'}\n\n${block.content || ''}`.trim();
    })
    .filter(Boolean)
    .join('\n\n');
}
