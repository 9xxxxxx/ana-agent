'use client';

/**
 * 数据库连接配置面板 (Tailwind 版本)
 */

import { useState, useEffect } from 'react';
import { testDbConnection, saveDbConfig, getDbConfig, deleteDbConfig } from '@/lib/api';
import { DatabaseIcon, CloseIcon, CheckIcon, TrashIcon } from './Icons';

const DB_TYPES = [
  { value: 'postgresql', label: 'PostgreSQL', port: 5432 },
  { value: 'mysql', label: 'MySQL', port: 3306 },
  { value: 'sqlite', label: 'SQLite', port: null },
  { value: 'duckdb', label: 'DuckDB', port: null },
];

export default function DbConnectionPanel({ isOpen, onClose, onConnect }) {
  const [dbType, setDbType] = useState('postgresql');
  const [host, setHost] = useState('localhost');
  const [port, setPort] = useState(5432);
  const [database, setDatabase] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [sqlitePath, setSqlitePath] = useState('');
  const [customUrl, setCustomUrl] = useState('');
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [savedConfigs, setSavedConfigs] = useState([]);
  const [activeTab, setActiveTab] = useState('form');

  useEffect(() => {
    if (isOpen) {
      loadSavedConfigs();
    }
  }, [isOpen]);

  useEffect(() => {
    const db = DB_TYPES.find(t => t.value === dbType);
    if (db?.port) {
      setPort(db.port);
    }
  }, [dbType]);

  const loadSavedConfigs = async () => {
    try {
      const configs = await getDbConfig();
      setSavedConfigs(configs || []);
    } catch (e) {
      console.error('加载配置失败:', e);
    }
  };

  const buildConnectionUrl = () => {
    if (activeTab === 'custom' && customUrl) {
      return customUrl;
    }

    if (dbType === 'sqlite') {
      return sqlitePath ? `sqlite:///${sqlitePath}` : '';
    }

    if (dbType === 'duckdb') {
      return sqlitePath ? `duckdb:///${sqlitePath}` : '';
    }

    const driver = dbType === 'postgresql' ? 'postgresql+psycopg2' : 'mysql+pymysql';
    return `${driver}://${username}:${password}@${host}:${port}/${database}`;
  };

  const handleTest = async () => {
    const url = buildConnectionUrl();
    if (!url) {
      setTestResult({ success: false, message: '请填写完整的连接信息' });
      return;
    }

    setTesting(true);
    setTestResult(null);
    try {
      const result = await testDbConnection(url);
      setTestResult(result);
    } catch (e) {
      setTestResult({ success: false, message: e.message });
    } finally {
      setTesting(false);
    }
  };

  const handleSaveAndConnect = async () => {
    const url = buildConnectionUrl();
    if (!url) return;

    setSaving(true);
    try {
      await saveDbConfig({
        name: `${DB_TYPES.find(t => t.value === dbType)?.label || 'Custom'} - ${database || 'default'}`,
        url,
        type: dbType,
      });
      onConnect?.(url);
      onClose();
    } catch (e) {
      setTestResult({ success: false, message: e.message });
    } finally {
      setSaving(false);
    }
  };

  const handleUseSaved = async (config) => {
    // 先测试连接，给用户明确的反馈
    setTesting(true);
    setTestResult(null);
    try {
      const result = await testDbConnection(config.url);
      if (result.success) {
        // 连接成功后才调用 onConnect 并关闭面板
        await onConnect?.(config.url);
        setTestResult({ success: true, message: '连接成功！' });
        setTimeout(() => {
          onClose();
        }, 800); // 短暂显示成功消息后关闭
      } else {
        // 连接失败，显示错误，保持面板打开
        setTestResult({ success: false, message: result.message || '连接失败' });
      }
    } catch (e) {
      setTestResult({ success: false, message: '测试连接时出错: ' + e.message });
    } finally {
      setTesting(false);
    }
  };

  const handleDeleteSaved = async (id) => {
    try {
      await deleteDbConfig(id);
      setSavedConfigs(savedConfigs.filter(c => c.id !== id));
    } catch (e) {
      setTestResult({ success: false, message: '删除失败: ' + e.message });
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-[10000] p-4 animate-in fade-in duration-200">
      <div className="bg-popover rounded-2xl w-full max-w-[500px] max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 duration-300 border border-border">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-muted/30">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-primary/10 text-primary rounded-lg">
              <DatabaseIcon size={18} />
            </div>
            <h3 className="text-[1.1rem] font-semibold text-foreground">数据库连接配置</h3>
          </div>
          <button 
            className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
            onClick={onClose}
          >
            <CloseIcon size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border bg-muted">
          <button
            className={`flex-1 py-3 text-sm font-medium transition-colors border-b-2 ${activeTab === 'form' ? 'border-primary text-primary bg-popover' : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50'}`}
            onClick={() => setActiveTab('form')}
          >
            表单配置
          </button>
          <button
            className={`flex-1 py-3 text-sm font-medium transition-colors border-b-2 ${activeTab === 'custom' ? 'border-primary text-primary bg-popover' : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50'}`}
            onClick={() => setActiveTab('custom')}
          >
            自定义URL
          </button>
          <button
            className={`flex-1 py-3 text-sm font-medium transition-colors border-b-2 ${activeTab === 'saved' ? 'border-primary text-primary bg-popover' : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50'}`}
            onClick={() => setActiveTab('saved')}
          >
            已保存 ({savedConfigs.length})
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto min-h-[300px]">
          {activeTab === 'form' && (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-foreground">数据库类型</label>
                <select 
                  className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                  value={dbType} 
                  onChange={(e) => setDbType(e.target.value)}
                >
                  {DB_TYPES.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>

              {(dbType === 'sqlite' || dbType === 'duckdb') ? (
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-foreground">数据库文件路径</label>
                  <input
                    type="text"
                    className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                    value={sqlitePath}
                    onChange={(e) => setSqlitePath(e.target.value)}
                    placeholder="例如: ./data/mydb.sqlite"
                  />
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-sm font-medium text-foreground">主机名</label>
                      <input
                        type="text"
                        className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                        value={host}
                        onChange={(e) => setHost(e.target.value)}
                        placeholder="localhost"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-sm font-medium text-foreground">端口</label>
                      <input
                        type="number"
                        className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                        value={port}
                        onChange={(e) => setPort(parseInt(e.target.value) || '')}
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium text-foreground">数据库名称</label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                      value={database}
                      onChange={(e) => setDatabase(e.target.value)}
                      placeholder="database_name"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-sm font-medium text-foreground">用户名</label>
                      <input
                        type="text"
                        className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="postgres"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-sm font-medium text-foreground">密码</label>
                      <input
                        type="password"
                        className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'custom' && (
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-foreground">自定义连接 URI</label>
              <textarea
                className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all resize-none"
                value={customUrl}
                onChange={(e) => setCustomUrl(e.target.value)}
                placeholder="例如: postgresql+psycopg2://user:pass@localhost:5432/dbname"
                rows={4}
              />
              <div className="text-xs text-primary mt-1">支持标准 SQLAlchemy 连接字符串格式</div>
            </div>
          )}

          {activeTab === 'saved' && (
            <div className="flex flex-col gap-3">
              {savedConfigs.length === 0 ? (
                <div className="py-12 flex flex-col items-center justify-center text-muted-foreground">
                  <DatabaseIcon size={32} className="mb-3 opacity-30" />
                  <span className="text-sm">暂无保存的连接配置</span>
                </div>
              ) : (
                savedConfigs.map(config => (
                  <div key={config.id} className="flex items-center justify-between p-3.5 bg-muted/30 border border-border rounded-xl hover:border-border/80 hover:bg-muted/50 transition-colors">
                    <div className="flex flex-col min-w-0 pr-4">
                      <div className="text-sm font-semibold text-foreground truncate">{config.name}</div>
                      <div className="text-xs text-muted-foreground mt-0.5 uppercase tracking-wider">{config.type}</div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button 
                        className="flex items-center justify-center px-4 py-1.5 bg-primary text-background hover:opacity-90 text-xs font-medium rounded-lg transition-colors shadow-sm"
                        onClick={() => handleUseSaved(config)}
                      >
                        连接
                      </button>
                      <button 
                        className="p-1.5 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 rounded-lg border border-transparent hover:border-red-500/20 transition-all"
                        onClick={() => handleDeleteSaved(config.id)}
                      >
                        <TrashIcon size={14} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {testResult && (
            <div className={`mt-6 p-3 rounded-lg text-sm flex items-start gap-2 ${testResult.success ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
              {testResult.success ? <CheckIcon size={16} className="mt-0.5 shrink-0" /> : <CloseIcon size={16} className="mt-0.5 shrink-0" />}
              <span className="leading-relaxed whitespace-pre-wrap">{testResult.message}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        {activeTab !== 'saved' && (
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border bg-muted/30">
            <button
              className="px-5 py-2 text-sm font-medium text-foreground bg-popover border border-border hover:bg-muted rounded-lg transition-colors shadow-sm disabled:opacity-50"
              onClick={handleTest}
              disabled={testing}
            >
              {testing ? '测试中...' : '测试连接'}
            </button>
            <button
              className="px-5 py-2 text-sm font-medium text-background bg-primary hover:opacity-90 shadow-sm border border-transparent rounded-lg transition-colors disabled:opacity-50"
              onClick={handleSaveAndConnect}
              disabled={saving || testing}
            >
              {saving ? '保存中...' : '保存并连接'}
            </button>
          </div>
        )}
        
      </div>
    </div>
  );
}
