import { createCanvasBlock } from './reportCanvas';

export const reportTemplates = [
  {
    id: 'decision-brief',
    name: '决策简报',
    description: '适合多专家会商、战略判断和高层汇报。',
    build() {
      return [
        createCanvasBlock('hero', {
          title: '战略决策简报',
          subtitle: '一句话概括业务判断、机会和建议动作。',
          badge: 'Decision Brief',
          createdAt: new Date().toLocaleString(),
        }),
        createCanvasBlock('text', {
          title: '执行摘要',
          content: '用 3 到 5 句话讲清楚现状、问题和建议。',
          tone: 'summary',
        }),
        createCanvasBlock('metrics', {
          title: '关键指标',
          items: [
            { label: '核心增长', value: '+12.4%' },
            { label: '风险暴露', value: '中' },
            { label: '建议优先级', value: 'P1' },
          ],
        }),
        createCanvasBlock('callout', {
          title: '核心判断',
          content: '这里写一句最关键的判断，要求能直接进入领导摘要。',
          tone: 'note',
        }),
        createCanvasBlock('action_items', {
          title: '行动计划',
          items: [
            { id: 'task-a', title: '确认负责人与资源', owner: '待分配', dueDate: '本周', status: 'todo', priority: 'high' },
            { id: 'task-b', title: '制定 2 周内落地计划', owner: '待分配', dueDate: '两周内', status: 'todo', priority: 'medium' },
          ],
        }),
      ];
    },
  },
  {
    id: 'analysis-review',
    name: '分析复盘',
    description: '适合复盘项目、分析指标异动和输出经验教训。',
    build() {
      return [
        createCanvasBlock('hero', {
          title: '分析复盘报告',
          subtitle: '总结事实、洞察、偏差与后续修正策略。',
          badge: 'Review',
          createdAt: new Date().toLocaleString(),
        }),
        createCanvasBlock('text', {
          title: '背景与目标',
          content: '说明这次分析/项目为什么做、衡量目标是什么。',
          tone: 'section',
        }),
        createCanvasBlock('text', {
          title: '主要发现',
          content: '分点列出这次复盘发现的事实与异常。',
          tone: 'summary',
        }),
        createCanvasBlock('callout', {
          title: '经验与教训',
          content: '哪些做得对，哪些地方低估了复杂度，下一次怎么避免。',
          tone: 'note',
        }),
        createCanvasBlock('action_items', {
          title: '后续修正项',
          items: [
            { id: 'task-c', title: '补充监控指标', owner: '数据团队', dueDate: '本周', status: 'todo', priority: 'high' },
            { id: 'task-d', title: '修正文档与流程', owner: '项目负责人', dueDate: '下周', status: 'todo', priority: 'medium' },
          ],
        }),
      ];
    },
  },
  {
    id: 'execution-plan',
    name: '执行方案',
    description: '适合把结论转成路线图、里程碑和责任清单。',
    build() {
      return [
        createCanvasBlock('hero', {
          title: '执行方案画布',
          subtitle: '把结论拆成阶段目标、关键动作和验收标准。',
          badge: 'Execution Plan',
          createdAt: new Date().toLocaleString(),
        }),
        createCanvasBlock('metrics', {
          title: '项目北极星',
          items: [
            { label: '目标完成率', value: '0%' },
            { label: '关键里程碑', value: '3 个' },
            { label: '跨团队依赖', value: '2 项' },
          ],
        }),
        createCanvasBlock('text', {
          title: '阶段拆解',
          content: '阶段 1 / 阶段 2 / 阶段 3 分别做什么，验收什么。',
          tone: 'section',
        }),
        createCanvasBlock('callout', {
          title: '风险与依赖',
          content: '把会阻塞交付的依赖提前写出来，而不是到执行期才暴露。',
          tone: 'note',
        }),
        createCanvasBlock('action_items', {
          title: '本周动作',
          items: [
            { id: 'task-e', title: '确认需求边界', owner: '产品', dueDate: '周三', status: 'todo', priority: 'high' },
            { id: 'task-f', title: '落实负责人', owner: '项目经理', dueDate: '周三', status: 'doing', priority: 'high' },
            { id: 'task-g', title: '确定验收指标', owner: '数据分析', dueDate: '周五', status: 'todo', priority: 'medium' },
          ],
        }),
      ];
    },
  },
];
