export function mergeStreamText(previous = '', incoming = '') {
  const prev = previous || '';
  const next = incoming || '';

  if (!next) return prev;
  if (!prev) return next;

  // 兼容“增量 token”与“当前全文片段”两种流式模式，避免复读式拼接。
  if (next.startsWith(prev)) return next;
  if (prev.startsWith(next)) return prev;
  return prev + next;
}

export function upsertToolStep(toolSteps = [], nextStep) {
  const existingIndex = toolSteps.findIndex((step) => step.id === nextStep.id);
  if (existingIndex === -1) {
    return [...toolSteps, nextStep];
  }

  return toolSteps.map((step, index) => (index === existingIndex ? { ...step, ...nextStep } : step));
}
