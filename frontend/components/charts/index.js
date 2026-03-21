/**
 * 图表组件库导出
 */

export { default as EChartsRenderer } from './EChartsRenderer';
export { default as NivoRenderer } from './NivoRenderer';
export { default as VisxRenderer } from './VisxRenderer';
export { default as SmartChart, LegacyChartRenderer, chartLibraries, chartTypes } from './SmartChart';

export {
  inferChartType,
  generateChartOption,
  generateBarOption,
  generateLineOption,
  generatePieOption,
  generateScatterOption,
  generateRadarOption,
  generateFunnelOption,
  generateGaugeOption,
  darkTheme,
  gradientColors,
} from './EChartsRenderer';

export {
  NivoBarChart,
  NivoLineChart,
  NivoPieChart,
  NivoScatterChart,
  NivoRadarChart,
  NivoFunnelChart,
  nivoTheme,
  nivoColors,
} from './NivoRenderer';

export {
  VisxBarChart,
  VisxLineChart,
  VisxPieChart,
  colors as visxColors,
  colorPalette as visxColorPalette,
  darkTheme as visxTheme,
} from './VisxRenderer';
