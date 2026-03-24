function extractActionItems(text = '') {
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
  const bulletLines = lines.filter((line) => /^[-*]\s+/.test(line) || /^\d+\.\s+/.test(line));

  if (!bulletLines.length) {
    return [
      {
        title: '确认负责人',
        owner: '待分配',
        dueDate: '本周',
        status: 'todo',
        priority: 'high',
      },
      {
        title: '把结论拆成执行计划',
        owner: '待分配',
        dueDate: '两周内',
        status: 'todo',
        priority: 'medium',
      },
    ];
  }

  return bulletLines.slice(0, 6).map((line, index) => ({
    title: line.replace(/^[-*]\s+/, '').replace(/^\d+\.\s+/, ''),
    owner: '待分配',
    dueDate: index < 2 ? '本周' : '待定',
    status: 'todo',
    priority: index === 0 ? 'high' : 'medium',
  }));
}

function buildSpecialistSections(specialists = []) {
  return specialists.map((item, index) => ({
    title: `专家观点 ${index + 1}: ${item.role}`,
    content: item.content,
    tone: item.role?.includes('风险') ? 'note' : 'section',
  }));
}

export function buildDecisionReport(brainstormResult) {
  if (!brainstormResult?.final_report) {
    return null;
  }

  const specialists = brainstormResult.specialists || [];
  const actionItems = extractActionItems(brainstormResult.final_report);
  return {
    id: `decision-${Date.now()}`,
    type: '决策简报',
    title: brainstormResult.task || '多专家会商报告',
    subtitle: '由数据分析、风险审查、策略建议三位专家联合生成',
    createdAt: new Date().toLocaleString(),
    summary: brainstormResult.final_report,
    metrics: [
      { label: '专家数量', value: specialists.length, tone: 'primary' },
      { label: '任务类型', value: '多角度会商', tone: 'default' },
      { label: '行动项', value: actionItems.length, tone: 'default' },
    ],
    sections: [
      {
        title: '联合判断',
        content: brainstormResult.final_report,
        tone: 'summary',
      },
      ...buildSpecialistSections(specialists),
    ],
    actionItems,
    conclusion: brainstormResult.final_report,
  };
}
