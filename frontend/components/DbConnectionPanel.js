'use client';

/**
 * 数据库连接配置面板 (Tailwind 版本)
 */

import { useState, useEffect } from 'react';
import { testDbConnection, saveDbConfig, getDbConfig, deleteDbConfig } from '@/lib/api';
import { DatabaseIcon, CloseIcon, CheckIcon, TrashIcon } from './Icons';
import { useToast } from './Toast';

const DB_TYPES = [
  { value: 'postgresql', label: 'PostgreSQL', port: 5432 },
  { value: 'mysql', label: 'MySQL', port: 3306 },
  { value: 'sqlite', label: 'SQLite', port: null },
  { value: 'duckdb', label: 'DuckDB', port: null },
];

export default function DbConnectionPanel({ isOpen, onClose, onConnect }) {
  const { success, error, warning } = useToast();
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
  const [verifiedUrl, setVerifiedUrl] = useState('');

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

  const currentUrl = buildConnectionUrl();

  useEffect(() => {
    if (verifiedUrl && verifiedUrl !== currentUrl) {
      setVerifiedUrl('');
    }
  }, [currentUrl, verifiedUrl]);

  const handleTest = async () => {
    const url = currentUrl;
    if (!url) {
      setTestResult({ success: false, message: '请填写完整的连接信息' });
      return;
    }

    setTesting(true);
    setTestResult(null);
    try {
      const result = await testDbConnection(url);
      setTestResult(result);
      if (result.success) {
        setVerifiedUrl(url);
        success('数据库连接测试通过。');
      } else {
        setVerifiedUrl('');
        error(result.message || '数据库连接测试失败');
      }
    } catch (e) {
      setTestResult({ success: false, message: e.message });
      setVerifiedUrl('');
      error(e.message);
    } finally {
      setTesting(false);
    }
  };

  const handleSaveAndConnect = async () => {
    const url = currentUrl;
    if (!url) {
      warning('请先填写完整的数据库连接信息。');
      return;
    }

    setSaving(true);
    try {
      let result = testResult;
      if (verifiedUrl !== url) {
        result = await testDbConnection(url);
        setTestResult(result);
      }

      if (!result?.success) {
        setVerifiedUrl('');
        error(result?.message || '数据库连接不可用，未保存。');
        return;
      }

      setVerifiedUrl(url);
      const saved = await saveDbConfig({
        name: `${DB_TYPES.find(t => t.value === dbType)?.label || 'Custom'} - ${database || 'default'}`,
        url,
        type: dbType,
      });
      await loadSavedConfigs();
      onConnect?.(url);
      success(saved?.success ? '数据库配置已保存并连接。' : '数据库连接已建立。');
      onClose();
    } catch (e) {
      setTestResult({ success: false, message: e.message });
      error(e.message);
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
        setVerifiedUrl(config.url);
        setTestResult({ success: true, message: '连接成功！' });
        success(`已连接到 ${config.name}`);
        setTimeout(() => {
          onClose();
        }, 800); // 短暂显示成功消息后关闭
      } else {
        // 连接失败，显示错误，保持面板打开
        setTestResult({ success: false, message: result.message || '连接失败' });
        error(result.message || '连接失败');
      }
    } catch (e) {
      setTestResult({ success: false, message: '测试连接时出错: ' + e.message });
      error('测试连接时出错: ' + e.message);
    } finally {
      setTesting(false);
    }
  };

  const handleDeleteSaved = async (id) => {
    try {
      await deleteDbConfig(id);
      setSavedConfigs(savedConfigs.filter(c => c.id !== id));
      success('已删除保存的数据库配置。');
    } catch (e) {
      setTestResult({ success: false, message: '删除失败: ' + e.message });
      error('删除失败: ' + e.message);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="flex max-h-[90vh] w-full max-w-[560px] flex-col overflow-hidden rounded-[28px] border border-zinc-200 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.2)] animate-in slide-in-from-bottom-4 duration-300">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-200 bg-zinc-50 px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-emerald-50 p-1.5 text-emerald-700">
              <DatabaseIcon size={18} />
            </div>
            <h3 className="text-[1.1rem] font-semibold text-foreground">数据库连接配置</h3>
          </div>
          <button 
            className="rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900"
            onClick={onClose}
          >
            <CloseIcon size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-zinc-200 bg-zinc-50">
          <button
            className={`flex-1 border-b-2 py-3 text-sm font-medium transition-colors ${activeTab === 'form' ? 'border-emerald-600 bg-white text-emerald-700' : 'border-transparent text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900'}`}
            onClick={() => setActiveTab('form')}
          >
            表单配置
          </button>
          <button
            className={`flex-1 border-b-2 py-3 text-sm font-medium transition-colors ${activeTab === 'custom' ? 'border-emerald-600 bg-white text-emerald-700' : 'border-transparent text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900'}`}
            onClick={() => setActiveTab('custom')}
          >
            自定义URL
          </button>
          <button
            className={`flex-1 border-b-2 py-3 text-sm font-medium transition-colors ${activeTab === 'saved' ? 'border-emerald-600 bg-white text-emerald-700' : 'border-transparent text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900'}`}
            onClick={() => setActiveTab('saved')}
          >
            已保存 ({savedConfigs.length})
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto min-h-[300px]">
          {activeTab !== 'saved' && (
            <div className={`mb-5 rounded-2xl border px-4 py-3 text-sm ${
              verifiedUrl && verifiedUrl === currentUrl
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : 'border-zinc-200 bg-zinc-50 text-zinc-700'
            }`}>
              {verifiedUrl && verifiedUrl === currentUrl
                ? '当前连接参数已通过测试，可以保存并连接。'
                : '当前连接参数尚未验证，保存并连接前会自动重新测试。'}
            </div>
          )}

          {activeTab === 'form' && (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-foreground">数据库类型</label>
                <select 
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-foreground transition-all focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-100"
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
                    className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-foreground transition-all focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-100"
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
                        className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-foreground transition-all focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-100"
                        value={host}
                        onChange={(e) => setHost(e.target.value)}
                        placeholder="localhost"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-sm font-medium text-foreground">端口</label>
                      <input
                        type="number"
                        className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-foreground transition-all focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-100"
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
                        className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-foreground transition-all focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-100"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="postgres"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-sm font-medium text-foreground">密码</label>
                      <input
                        type="password"
                        className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-foreground transition-all focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-100"
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
                className="w-full resize-none rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-foreground transition-all focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-100"
                value={customUrl}
                onChange={(e) => setCustomUrl(e.target.value)}
                placeholder="例如: postgresql+psycopg2://user:pass@localhost:5432/dbname"
                rows={4}
              />
              <div className="mt-1 text-xs text-emerald-700">支持标准 SQLAlchemy 连接字符串格式</div>
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
                  <div key={config.id} className="flex items-center justify-between rounded-2xl border border-zinc-200 bg-zinc-50 p-3.5 transition-colors hover:border-zinc-300 hover:bg-zinc-100">
                    <div className="flex flex-col min-w-0 pr-4">
                      <div className="text-sm font-semibold text-foreground truncate">{config.name}</div>
                      <div className="mt-0.5 text-xs uppercase tracking-wider text-zinc-500">{config.type}</div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button 
                        className="flex items-center justify-center rounded-xl bg-zinc-900 px-4 py-1.5 text-xs font-medium text-white shadow-sm transition-colors hover:bg-zinc-800"
                        onClick={() => handleUseSaved(config)}
                      >
                        连接
                      </button>
                      <button 
                        className="rounded-lg border border-transparent p-1.5 text-zinc-500 transition-all hover:border-red-500/20 hover:bg-red-500/10 hover:text-red-500"
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
            <div className={`mt-6 flex items-start gap-2 rounded-xl border p-3 text-sm ${testResult.success ? 'border-green-200 bg-green-50 text-green-700' : 'border-red-200 bg-red-50 text-red-700'}`}>
              {testResult.success ? <CheckIcon size={16} className="mt-0.5 shrink-0" /> : <CloseIcon size={16} className="mt-0.5 shrink-0" />}
              <span className="leading-relaxed whitespace-pre-wrap">{testResult.message}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        {activeTab !== 'saved' && (
          <div className="flex items-center justify-end gap-3 border-t border-zinc-200 bg-zinc-50 px-6 py-4">
            <button
              className="rounded-xl border border-zinc-300 bg-white px-5 py-2 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-zinc-50 disabled:opacity-50"
              onClick={handleTest}
              disabled={testing}
            >
              {testing ? '测试中...' : '测试连接'}
            </button>
            <button
              className="rounded-xl border border-transparent bg-zinc-900 px-5 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-zinc-800 disabled:opacity-50"
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
