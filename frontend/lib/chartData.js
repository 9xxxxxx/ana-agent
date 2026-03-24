export function parseChartPayload(chartJson) {
  if (!chartJson) {
    throw new Error('图表数据为空');
  }

  if (typeof chartJson === 'object') {
    return chartJson;
  }

  if (typeof chartJson !== 'string') {
    throw new Error('图表数据格式无效');
  }

  let cleanedJson = chartJson.trim();
  if (cleanedJson.startsWith('[CHART_DATA]')) {
    cleanedJson = cleanedJson.replace('[CHART_DATA]', '').trim();
  }
  if (cleanedJson.includes('... (已截断)')) {
    cleanedJson = cleanedJson.replace('... (已截断)', '');
  }

  try {
    return JSON.parse(cleanedJson);
  } catch (parseError) {
    let fixedJson = cleanedJson;
    const openBraces = (fixedJson.match(/\{/g) || []).length;
    const closeBraces = (fixedJson.match(/\}/g) || []).length;
    const openBrackets = (fixedJson.match(/\[/g) || []).length;
    const closeBrackets = (fixedJson.match(/\]/g) || []).length;

    for (let i = 0; i < openBraces - closeBraces; i += 1) fixedJson += '}';
    for (let i = 0; i < openBrackets - closeBrackets; i += 1) fixedJson += ']';

    try {
      return JSON.parse(fixedJson);
    } catch {
      throw new Error(`JSON 解析失败: ${parseError.message}`);
    }
  }
}
