/**
 * 示例报告数据
 * 用于测试和演示报告查看器组件
 */

export const sampleReport = {
  id: 'report-sample-001',
  title: '2024年Q1销售数据分析报告',
  subtitle: '基于全渠道销售数据的深度洞察与业务建议',
  type: '业务报告',
  createdAt: '2024-03-21 14:30:00',
  
  // 关键指标概览
  metrics: [
    {
      title: '总销售额',
      value: '¥2,847万',
      change: 23.5,
      changeType: 'positive',
      trend: 'up',
      description: '同比增长',
      icon: '💰',
      color: 'green',
    },
    {
      title: '订单量',
      value: '15,234',
      change: 15.2,
      changeType: 'positive',
      trend: 'up',
      description: '环比增长',
      icon: '📦',
      color: 'blue',
    },
    {
      title: '客单价',
      value: '¥1,868',
      change: 7.2,
      changeType: 'positive',
      trend: 'up',
      description: '稳步提升',
      icon: '🛒',
      color: 'purple',
    },
    {
      title: '退货率',
      value: '3.2%',
      change: -1.5,
      changeType: 'positive',
      trend: 'down',
      description: '同比下降',
      icon: '↩️',
      color: 'orange',
    },
  ],
  
  // 执行摘要
  summary: `
本季度销售表现强劲，总销售额达到 **¥2,847万**，同比增长 **23.5%**，超出预期目标。主要驱动因素包括：

- 新产品线推出获得市场积极反响
- 线上渠道转化率提升显著
- 客户复购率增长至 45%

建议下季度重点关注供应链优化和客户体验提升。
  `,
  
  // 章节内容
  sections: [
    {
      title: '销售趋势分析',
      content: `
Q1销售额呈现稳步上升趋势，1月受春节影响略有回落，但2-3月快速反弹并创下新高。

**关键发现**：
- 3月份销售额达到峰值 ¥1,020万
- 周末销售占比提升至 35%
- 移动端订单占比首次超过 60%
      `,
      charts: [
        {
          title: '月度销售趋势',
          data: JSON.stringify({
            data: [
              {
                x: ['1月', '2月', '3月'],
                y: [850, 920, 1077],
                type: 'bar',
                marker: { color: '#3b82f6' },
                name: '销售额（万元）',
              },
            ],
            layout: {
              title: 'Q1月度销售额',
              xaxis: { title: '月份' },
              yaxis: { title: '销售额（万元）' },
            },
          }),
        },
      ],
      metrics: [
        { title: '月均销售额', value: '¥949万', size: 'small' },
        { title: '最高月', value: '3月', size: 'small' },
        { title: '增长率', value: '+26.7%', changeType: 'positive', size: 'small' },
      ],
    },
    {
      title: '品类表现分析',
      content: `
电子产品依然是销售主力，占总销售额的 42%。服装类目增长最快，同比增长 38%。

**品类排名**：
1. 电子产品 - ¥1,196万（42%）
2. 服装配饰 - ¥854万（30%）
3. 家居用品 - ¥569万（20%）
4. 其他 - ¥228万（8%）
      `,
      charts: [
        {
          title: '品类销售占比',
          data: JSON.stringify({
            data: [
              {
                values: [42, 30, 20, 8],
                labels: ['电子产品', '服装配饰', '家居用品', '其他'],
                type: 'pie',
                hole: 0.4,
                marker: {
                  colors: ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b'],
                },
              },
            ],
            layout: {
              title: '品类销售占比',
            },
          }),
        },
      ],
      table: {
        title: '品类销售详情',
        columns: [
          { key: 'category', label: '品类' },
          { key: 'sales', label: '销售额' },
          { key: 'percentage', label: '占比' },
          { key: 'growth', label: '同比增长' },
        ],
        data: [
          { category: '电子产品', sales: '¥1,196万', percentage: '42%', growth: '+18%' },
          { category: '服装配饰', sales: '¥854万', percentage: '30%', growth: '+38%' },
          { category: '家居用品', sales: '¥569万', percentage: '20%', growth: '+12%' },
          { category: '其他', sales: '¥228万', percentage: '8%', growth: '+5%' },
        ],
      },
    },
    {
      title: '渠道分析',
      content: `
线上渠道持续发力，APP端销售占比达到 45%，成为最大销售渠道。

**渠道表现**：
- APP端：¥1,281万（45%）
- 小程序：¥854万（30%）
- 官网：¥427万（15%）
- 线下门店：¥285万（10%）
      `,
    },
  ],
  
  // 结论与建议
  conclusion: `
## 核心结论

1. **整体表现优异**：Q1销售额同比增长 23.5%，各项关键指标均超预期
2. **线上化趋势明显**：移动端订单占比突破 60%，需持续优化移动体验
3. **品类结构优化**：高毛利品类占比提升，整体毛利率改善 2.3%

## 行动建议

### 短期（1-2个月）
- [ ] 增加热销品类库存，避免断货
- [ ] 优化 APP 结账流程，提升转化率
- [ ] 开展会员专属促销活动

### 中期（3-6个月）
- [ ] 拓展服装品类 SKU，抓住增长机会
- [ ] 建立智能补货系统
- [ ] 推出个性化推荐功能

### 长期（6-12个月）
- [ ] 探索海外市场机会
- [ ] 建立自有品牌产品线
- [ ] 完善全渠道会员体系
  `,
};

export default sampleReport;
