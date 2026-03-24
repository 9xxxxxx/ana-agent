export function buildDecisionReport(brainstormResult) {
  if (!brainstormResult?.final_report) {
    return null;
  }

  const specialists = brainstormResult.specialists || [];
  return {
    type: '决策简报',
    title: brainstormResult.task || '多专家会商报告',
    subtitle: '由数据分析、风险审查、策略建议三位专家联合生成',
    createdAt: new Date().toLocaleString(),
    summary: brainstormResult.final_report,
    metrics: [
      { label: '专家数量', value: specialists.length, tone: 'primary' },
      { label: '任务类型', value: '多角度会商', tone: 'default' },
    ],
    sections: specialists.map((item, index) => ({
      title: `专家观点 ${index + 1}: ${item.role}`,
      content: item.content,
    })),
    conclusion: brainstormResult.final_report,
  };
}
