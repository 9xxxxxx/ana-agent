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
  CloseIcon
} from './Icons';
import { useToast } from './Toast';
import { cn, ui } from './ui';

export default function WatchdogPanel({ isOpen, onClose }) {
  const { success, error } = useToast();
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="flex max-h-[85vh] w-full max-w-4xl flex-col overflow-hidden rounded-[30px] border border-zinc-200 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.2)] animate-in zoom-in-95 duration-300">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-200 bg-white px-8 py-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
              <BellIcon size={22} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-foreground leading-tight">数据值班室 (Watchdog)</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">自动探测业务异常并主动推送预警</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setShowAddModal(true)}
              className={cn(ui.buttonPrimary, 'rounded-xl px-4 py-2')}
            >
              <PlusIcon size={16} />
              <span>新增监控</span>
            </button>
            <button onClick={onClose} className={ui.iconButton}>
              <CloseIcon size={20} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto bg-zinc-50 p-8">
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
                <div key={rule.id} className={cn(ui.panel, 'group p-6 transition-all hover:shadow-md')}>
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="font-bold text-foreground transition-colors group-hover:text-emerald-700">{rule.name}</h3>
                      <div className="mt-1.5 flex w-fit items-center gap-2 rounded-md bg-zinc-100 px-2 py-0.5 text-[11px] font-mono text-muted-foreground">
                         <AlarmClockIcon size={12} />
                         {rule.schedule}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={() => handleTestRule(rule.id)}
                        className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-green-500/10 hover:text-green-500"
                        title="立即测试"
                      >
                         <PlayIcon size={16} />
                      </button>
                      <button 
                        onClick={() => handleDeleteRule(rule.id)}
                        className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-rose-500/10 hover:text-rose-500"
                        title="删除"
                      >
                         <TrashIcon size={16} />
                      </button>
                    </div>
                  </div>
                  
                  <div className="mb-4 rounded-xl bg-zinc-950 p-3 font-mono text-[11px] text-emerald-300 line-clamp-2">
                    {rule.sql}
                  </div>

                  <div className="mt-4 flex items-center justify-between border-t border-zinc-200 py-3">
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
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="flex w-full max-w-lg flex-col gap-6 rounded-[28px] border border-zinc-200 bg-white p-8 shadow-[0_24px_80px_rgba(15,23,42,0.2)] animate-in zoom-in-95 duration-200">
              <h3 className="text-xl font-bold text-foreground">配置新监控</h3>
              
              <div className="space-y-4 text-sm">
                <div>
                  <label className="block font-semibold text-foreground mb-1.5 ml-1">规则名称</label>
                  <input 
                    className={ui.inputMuted}
                    placeholder="例如: 每日收入异常预警"
                    value={newRule.name}
                    onChange={e => setNewRule({...newRule, name: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block font-semibold text-foreground mb-1.5 ml-1 text-xs">查询 SQL (应返回一个数值)</label>
                  <textarea 
                    className={cn(ui.textareaMuted, 'h-24 min-h-[96px] font-mono text-[13px] leading-6')}
                    placeholder="SELECT COUNT(*) FROM orders WHERE status='fail'"
                    value={newRule.sql}
                    onChange={e => setNewRule({...newRule, sql: e.target.value})}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block font-semibold text-foreground mb-1.5 ml-1 text-xs">判定方式</label>
                    <select 
                      className={cn(ui.select, 'px-4 py-3')}
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
                      className={ui.inputMuted}
                      value={newRule.threshold}
                      onChange={e => setNewRule({...newRule, threshold: parseFloat(e.target.value)})}
                    />
                  </div>
                </div>
                <div>
                  <label className="block font-semibold text-foreground mb-1.5 ml-1 text-xs">Cron 调度周期 (5段式)</label>
                  <input 
                    className={cn(ui.inputMuted, 'font-mono')}
                    value={newRule.schedule}
                    onChange={e => setNewRule({...newRule, schedule: e.target.value})}
                  />
                </div>
              </div>

              <div className="flex gap-3 mt-4">
                <button 
                  onClick={() => setShowAddModal(false)}
                  className={cn(ui.buttonSecondary, 'flex-1 rounded-2xl justify-center py-3')}
                >
                  取消
                </button>
                <button 
                  onClick={handleAddRule}
                  className={cn(ui.buttonPrimary, 'flex-1 rounded-2xl justify-center py-3')}
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
