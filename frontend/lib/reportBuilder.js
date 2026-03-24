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

function extractBulletPoints(text = '', limit = 4) {
  const bulletLines = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^[-*]\s+/.test(line) || /^\d+\.\s+/.test(line));

  if (!bulletLines.length) {
    return [];
  }

  return bulletLines.slice(0, limit).map((line) => line.replace(/^[-*]\s+/, '').replace(/^\d+\.\s+/, ''));
}

function extractLeadSentence(text = '') {
  return text
    .split('\n')
    .map((line) => line.trim())
    .find(Boolean) || '';
}

function buildSpecialistSections(specialists = []) {
  return specialists.map((item, index) => ({
    title: `专家观点 ${index + 1}: ${item.role}`,
    content: item.content,
    tone: item.role?.includes('风险') ? 'note' : 'section',
  }));
}

function buildDecisionSummary(finalReport = '', actionItems = []) {
  const summaryPoints = extractBulletPoints(finalReport, 3);
  return {
    verdict: extractLeadSentence(finalReport) || '需要补充更多证据以形成明确结论。',
    rationale: summaryPoints.length ? summaryPoints.join('\n') : finalReport,
    nextStep: actionItems[0]?.title || '补充下一步动作。',
  };
}

function buildEvidenceItems(finalReport = '', specialists = []) {
  const finalBullets = extractBulletPoints(finalReport, 4).map((item, index) => ({
    claim: `联合结论 ${index + 1}`,
    evidence: item,
  }));

  const specialistBullets = specialists.slice(0, 3).map((item) => ({
    claim: item.role,
    evidence: extractLeadSentence(item.content) || '该专家暂无可提炼证据。',
  }));

  return [...finalBullets, ...specialistBullets].slice(0, 6);
}

function buildDebateItems(specialists = []) {
  if (!specialists.length) {
    return [];
  }

  return specialists.slice(0, 3).map((item) => ({
    perspective: item.role,
    point: extractLeadSentence(item.content) || '暂无观点',
  }));
}

function buildDecisionFlow(specialists = [], evidenceItems = [], debateItems = [], actionItems = [], decision = null) {
  const specialistNodes = specialists.slice(0, 3).map((item, index) => ({
    id: `specialist-${index + 1}`,
    kind: 'specialist',
    label: item.role,
    detail: extractLeadSentence(item.content) || '暂无观点',
    status: index === 0 ? 'adopted' : index === 1 ? 'reserved' : 'challenged',
    strength: index === 0 ? 'high' : 'medium',
  }));

  const evidenceNodes = evidenceItems.slice(0, 3).map((item, index) => ({
    id: `evidence-${index + 1}`,
    kind: 'evidence',
    label: item.claim,
    detail: item.evidence,
    status: 'adopted',
    strength: index === 0 ? 'high' : 'medium',
  }));

  const debateNodes = debateItems.slice(0, 2).map((item, index) => ({
    id: `debate-${index + 1}`,
    kind: 'debate',
    label: item.perspective,
    detail: item.point,
    status: 'reserved',
    strength: 'medium',
  }));

  const actionNodes = actionItems.slice(0, 3).map((item, index) => ({
    id: `action-${index + 1}`,
    kind: 'action',
    label: item.title,
    detail: `${item.owner} · ${item.dueDate}`,
    status: 'adopted',
    strength: index === 0 ? 'high' : 'medium',
  }));

  return {
    title: '决策流追踪',
    decision: decision?.verdict || '待补充最终决策',
    nodes: [...specialistNodes, ...evidenceNodes, ...debateNodes, ...actionNodes],
  };
}

export function buildDecisionReport(brainstormResult) {
  if (!brainstormResult?.final_report) {
    return null;
  }

  const specialists = brainstormResult.specialists || [];
  const actionItems = extractActionItems(brainstormResult.final_report);
  const decision = buildDecisionSummary(brainstormResult.final_report, actionItems);
  const evidenceItems = buildEvidenceItems(brainstormResult.final_report, specialists);
  const debateItems = buildDebateItems(specialists);
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
    decision,
    decisionFlow: buildDecisionFlow(specialists, evidenceItems, debateItems, actionItems, decision),
    evidenceItems,
    debateItems,
    specialists,
    actionItems,
    conclusion: brainstormResult.final_report,
  };
}
