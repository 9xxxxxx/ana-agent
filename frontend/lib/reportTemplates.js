import { createCanvasBlock } from './reportCanvas';

export const reportTemplates = [
  {
    id: 'executive-decision-pack',
    name: '高管决策包',
    description: '适合管理层快速判断、资源拍板和优先级决策。',
    build() {
      return [
        createCanvasBlock('hero', {
          title: '高管决策包',
          subtitle: '把核心结论、证据、争议和动作压缩成管理层可直接阅读的版本。',
          badge: 'Executive Pack',
          createdAt: new Date().toLocaleString(),
        }),
        createCanvasBlock('decision', {
          title: '最终建议',
          verdict: '建议优先投入资源解决当前最关键的结构性问题。',
          rationale: '这里写核心依据、为什么现在做、为什么必须这样做。',
          nextStep: '48 小时内确认负责人和资源。',
        }),
        createCanvasBlock('evidence', {
          title: '支撑证据',
          items: [
            { claim: '业务现状', evidence: '用一条最重要的数据事实支撑当前判断。' },
            { claim: '机会窗口', evidence: '描述为什么现在做仍有价值。' },
          ],
        }),
        createCanvasBlock('debate', {
          title: '关键争议',
          items: [
            { perspective: '增长视角', point: '强调抢速度与窗口期。' },
            { perspective: '风险视角', point: '强调证据不足和资源约束。' },
          ],
        }),
        createCanvasBlock('metrics', {
          title: '管理摘要指标',
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
    id: 'incident-retrospective',
    name: '故障复盘报告',
    description: '适合事故分析、执行偏差、失败链路和修复计划。',
    build() {
      return [
        createCanvasBlock('hero', {
          title: '故障复盘报告',
          subtitle: '把事实、根因、影响面和修复动作讲清楚。',
          badge: 'Incident Review',
          createdAt: new Date().toLocaleString(),
        }),
        createCanvasBlock('callout', {
          title: '事故概述',
          content: '一句话说明发生了什么，影响了什么。',
          tone: 'note',
        }),
        createCanvasBlock('evidence', {
          title: '关键事实',
          items: [
            { claim: '触发条件', evidence: '描述本次问题的触发条件。' },
            { claim: '影响范围', evidence: '说明影响到的用户、系统或业务。' },
          ],
        }),
        createCanvasBlock('text', {
          title: '根因分析',
          content: '说明技术根因、流程根因和组织根因。',
          tone: 'section',
        }),
        createCanvasBlock('debate', {
          title: '争议与误判',
          items: [
            { perspective: '当时判断', point: '当时团队对问题的判断是什么。' },
            { perspective: '事后复盘', point: '事后看哪些判断是偏差。' },
          ],
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
    id: 'project-weekly-brief',
    name: '项目推进周报',
    description: '适合跨团队项目、里程碑管理和周度推进同步。',
    build() {
      return [
        createCanvasBlock('hero', {
          title: '项目推进周报',
          subtitle: '同步阶段进展、阻塞点、风险和下周动作。',
          badge: 'Weekly Brief',
          createdAt: new Date().toLocaleString(),
        }),
        createCanvasBlock('metrics', {
          title: '周度进展指标',
          items: [
            { label: '里程碑完成率', value: '68%' },
            { label: '阻塞项', value: '2 个' },
            { label: '下周重点', value: '3 项' },
          ],
        }),
        createCanvasBlock('text', {
          title: '本周进展',
          content: '用 3 到 5 条说明本周完成了什么、距离目标还有多远。',
          tone: 'section',
        }),
        createCanvasBlock('debate', {
          title: '关键阻塞',
          items: [
            { perspective: '研发', point: '描述技术侧阻塞。' },
            { perspective: '业务', point: '描述业务侧等待项或依赖。' },
          ],
        }),
        createCanvasBlock('callout', {
          title: '风险提醒',
          content: '列出最可能影响下周里程碑的风险。',
          tone: 'note',
        }),
        createCanvasBlock('action_items', {
          title: '下周动作',
          items: [
            { id: 'task-e', title: '确认需求边界', owner: '产品', dueDate: '周三', status: 'todo', priority: 'high' },
            { id: 'task-f', title: '落实负责人', owner: '项目经理', dueDate: '周三', status: 'doing', priority: 'high' },
            { id: 'task-g', title: '确定验收指标', owner: '数据分析', dueDate: '周五', status: 'todo', priority: 'medium' },
          ],
        }),
      ];
    },
  },
  {
    id: 'risk-review-memo',
    name: '风险审查备忘录',
    description: '适合投前判断、方案审查和高风险事项评估。',
    build() {
      return [
        createCanvasBlock('hero', {
          title: '风险审查备忘录',
          subtitle: '从证据、争议、边界条件和缓释动作四个维度审视问题。',
          badge: 'Risk Memo',
          createdAt: new Date().toLocaleString(),
        }),
        createCanvasBlock('decision', {
          title: '审查结论',
          verdict: '建议谨慎推进，先补足关键证据再扩大投入。',
          rationale: '当前结论基于有限样本，仍存在较高不确定性。',
          nextStep: '优先补充证据并验证假设。',
        }),
        createCanvasBlock('evidence', {
          title: '已掌握证据',
          items: [
            { claim: '支持推进', evidence: '列出支持方案成立的事实。' },
            { claim: '风险信号', evidence: '列出当前已暴露的风险证据。' },
          ],
        }),
        createCanvasBlock('debate', {
          title: '审查争议',
          items: [
            { perspective: '乐观假设', point: '阐述最乐观的假设。' },
            { perspective: '保守假设', point: '阐述最保守的假设。' },
          ],
        }),
        createCanvasBlock('action_items', {
          title: '缓释动作',
          items: [
            { id: 'task-h', title: '补充缺失证据', owner: '分析团队', dueDate: '本周', status: 'todo', priority: 'high' },
            { id: 'task-i', title: '确认风险阈值', owner: '业务负责人', dueDate: '下周', status: 'todo', priority: 'high' },
          ],
        }),
      ];
    },
  },
];
