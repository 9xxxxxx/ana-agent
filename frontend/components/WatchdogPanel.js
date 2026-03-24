'use client';

import { useState, useEffect } from 'react';
import { 
  fetchWatchdogRules, 
  addWatchdogRule, 
  deleteWatchdogRule, 
  testWatchdogRule 
} from '@/lib/api';
import { 
  BellIcon, 
  AlarmClockIcon, 
  TrashIcon, 
  PlayIcon, 
  PlusIcon, 
  CloseIcon,
  AlertIcon,
  CheckCircleIcon
} from './Icons';
import { useToast } from './Toast';

export default function WatchdogPanel({ isOpen, onClose }) {
  const { success, error, info } = useToast();
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newRule, setNewRule] = useState({
    id: '',
    name: '',
    sql: '',
    condition: 'gt',
    threshold: 0,
    schedule: '0 9 * * *',
    notify_channel: 'feishu'
  });

  useEffect(() => {
    if (isOpen) {
      loadRules();
    }
  }, [isOpen]);

  const loadRules = async () => {
    setLoading(true);
    try {
      const data = await fetchWatchdogRules();
      setRules(Array.isArray(data) ? data : (data.rules || []));
    } catch (err) {
      console.error('Failed to load rules:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddRule = async () => {
    if (!newRule.name || !newRule.sql) return;
    try {
      const id = 'rule_' + Math.random().toString(36).substr(2, 9);
      await addWatchdogRule({ ...newRule, id });
      setShowAddModal(false);
      loadRules();
      setNewRule({
        id: '',
        name: '',
        sql: '',
        condition: 'gt',
        threshold: 0,
        schedule: '0 9 * * *',
        notify_channel: 'feishu'
      });
      success('监控规则添加成功！');
    } catch (err) {
      error('添加失败: ' + err.message);
    }
  };

  const handleDeleteRule = async (id) => {
    if (!confirm('确定要删除这条监控规则吗？')) return;
    try {
      await deleteWatchdogRule(id);
      loadRules();
      success('监控规则删除成功！');
    } catch (err) {
      error('删除失败: ' + err.message);
    }
  };

  const handleTestRule = async (id) => {
    try {
      const res = await testWatchdogRule(id);
      success(res.message || (res.success ? '测试已触发' : '测试失败'));
    } catch (err) {
      error('测试失败: ' + err.message);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="bg-popover w-full max-w-4xl max-h-[85vh] rounded-3xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-300 border border-border">
        
        {/* Header */}
        <div className="px-8 py-6 border-b border-border flex items-center justify-between bg-popover">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
              <BellIcon size={22} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-foreground leading-tight">数据值班室 (Watchdog)</h2>
              <p className="text-sm text-muted-foreground mt-0.5">自动探测业务异常并主动推送预警</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setShowAddModal(true)}
              className="px-4 py-2 bg-primary hover:opacity-90 text-background text-sm font-medium rounded-xl transition-all shadow-md shadow-primary/20 flex items-center gap-2"
            >
              <PlusIcon size={16} />
              <span>新增监控</span>
            </button>
            <button onClick={onClose} className="p-2 hover:bg-muted rounded-full text-muted-foreground transition">
              <CloseIcon size={20} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-8 bg-muted/30">
          {loading ? (
            <div className="flex items-center justify-center h-48 text-muted-foreground">正在加载巡检规则...</div>
          ) : rules.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-muted-foreground gap-4">
              <AlarmClockIcon size={48} className="opacity-20" />
              <p>尚未配置监控巡检任务</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {rules.map(rule => (
                <div key={rule.id} className="bg-popover border border-border rounded-2xl p-6 shadow-sm hover:shadow-md transition-all group">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="font-bold text-foreground group-hover:text-primary transition-colors">{rule.name}</h3>
                      <div className="flex items-center gap-2 mt-1.5 text-[11px] font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded-md w-fit">
                         <AlarmClockIcon size={12} />
                         {rule.schedule}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={() => handleTestRule(rule.id)}
                        className="p-1.5 text-muted-foreground hover:text-green-500 hover:bg-green-500/10 rounded-lg transition"
                        title="立即测试"
                      >
                         <PlayIcon size={16} />
                      </button>
                      <button 
                        onClick={() => handleDeleteRule(rule.id)}
                        className="p-1.5 text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10 rounded-lg transition"
                        title="删除"
                      >
                         <TrashIcon size={16} />
                      </button>
                    </div>
                  </div>
                  
                  <div className="bg-zinc-950 rounded-xl p-3 mb-4 text-[11px] text-primary/70 font-mono line-clamp-2">
                    {rule.sql}
                  </div>

                  <div className="flex items-center justify-between py-3 border-t border-border mt-4">
                    <div className="flex flex-col">
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">判断条件</span>
                      <span className="text-sm font-medium text-foreground">当值 {rule.condition} {rule.threshold}</span>
                    </div>
                    <div className="flex flex-col items-end text-right">
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">上次结果</span>
                      <span className={`text-sm font-bold ${rule.last_result !== null && rule.last_result > rule.threshold ? 'text-rose-500' : 'text-green-500'}`}>
                        {rule.last_result !== null ? rule.last_result : '未运行'}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Add Modal */}
        {showAddModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-background/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-popover w-full max-w-lg rounded-3xl shadow-2xl p-8 flex flex-col gap-6 animate-in zoom-in-95 duration-200 border border-border">
              <h3 className="text-xl font-bold text-foreground">配置新监控</h3>
              
              <div className="space-y-4 text-sm">
                <div>
                  <label className="block font-semibold text-foreground mb-1.5 ml-1">规则名称</label>
                  <input 
                    className="w-full px-4 py-3 bg-muted border-none rounded-2xl focus:ring-2 focus:ring-primary/10 transition-all outline-none text-foreground"
                    placeholder="例如: 每日收入异常预警"
                    value={newRule.name}
                    onChange={e => setNewRule({...newRule, name: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block font-semibold text-foreground mb-1.5 ml-1 text-xs">查询 SQL (应返回一个数值)</label>
                  <textarea 
                    className="w-full px-4 py-3 bg-muted border-none rounded-2xl focus:ring-2 focus:ring-primary/10 transition-all outline-none font-mono text-[13px] h-24 text-foreground"
                    placeholder="SELECT COUNT(*) FROM orders WHERE status='fail'"
                    value={newRule.sql}
                    onChange={e => setNewRule({...newRule, sql: e.target.value})}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block font-semibold text-foreground mb-1.5 ml-1 text-xs">判定方式</label>
                    <select 
                      className="w-full px-4 py-3 bg-muted border-none rounded-2xl focus:ring-2 focus:ring-primary/10 transition-all outline-none appearance-none text-foreground"
                      value={newRule.condition}
                      onChange={e => setNewRule({...newRule, condition: e.target.value})}
                    >
                      <option value="gt">大于 (&gt;)</option>
                      <option value="lt">小于 (&lt;)</option>
                      <option value="eq">等于 (=)</option>
                      <option value="ne">不等于 (!=)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block font-semibold text-foreground mb-1.5 ml-1 text-xs">阈值</label>
                    <input 
                      type="number"
                      className="w-full px-4 py-3 bg-muted border-none rounded-2xl focus:ring-2 focus:ring-primary/10 transition-all outline-none text-foreground"
                      value={newRule.threshold}
                      onChange={e => setNewRule({...newRule, threshold: parseFloat(e.target.value)})}
                    />
                  </div>
                </div>
                <div>
                  <label className="block font-semibold text-foreground mb-1.5 ml-1 text-xs">Cron 调度周期 (5段式)</label>
                  <input 
                    className="w-full px-4 py-3 bg-muted border-none rounded-2xl focus:ring-2 focus:ring-primary/10 transition-all outline-none font-mono text-foreground"
                    value={newRule.schedule}
                    onChange={e => setNewRule({...newRule, schedule: e.target.value})}
                  />
                </div>
              </div>

              <div className="flex gap-3 mt-4">
                <button 
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 py-3 bg-muted hover:bg-muted/80 text-foreground font-bold rounded-2xl transition"
                >
                  取消
                </button>
                <button 
                  onClick={handleAddRule}
                  className="flex-1 py-3 bg-primary hover:opacity-90 text-background font-bold rounded-2xl transition shadow-lg shadow-primary/20"
                >
                  确认启用
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
