'use client';

import { useState, useEffect } from 'react';
import { testDbConnection, saveDbConfig, getDbConfig, deleteDbConfig } from '@/lib/api';
import { DatabaseIcon, CheckIcon, TrashIcon, CloseIcon } from './Icons';
import ModalShell from './ModalShell';
import { useToast } from './Toast';
import { cn, ui, SectionCard, ToolbarButton } from './ui';
import { EmptyState, InlineFeedback, LoadingState, StatusBadge } from './status';

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
  const [loadingSaved, setLoadingSaved] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [savedConfigs, setSavedConfigs] = useState([]);
  const [activeTab, setActiveTab] = useState('form');
  const [verifiedUrl, setVerifiedUrl] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadSavedConfigs();
    }
  }, [isOpen]);

  useEffect(() => {
    const db = DB_TYPES.find((t) => t.value === dbType);
    if (db?.port) {
      setPort(db.port);
    }
  }, [dbType]);

  const loadSavedConfigs = async () => {
    setLoadingSaved(true);
    try {
      const configs = await getDbConfig();
      setSavedConfigs(configs || []);
    } catch (e) {
      console.error('加载配置失败:', e);
    } finally {
      setLoadingSaved(false);
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
    const encodedUsername = encodeURIComponent(username);
    const encodedPassword = encodeURIComponent(password);
    const encodedDatabase = encodeURIComponent(database);
    return `${driver}://${encodedUsername}:${encodedPassword}@${host}:${port}/${encodedDatabase}`;
  };

  const validateConnectionForm = () => {
    if (activeTab === 'custom') {
      if (!customUrl.trim()) return '请填写自定义连接 URI';
      return '';
    }

    if (dbType === 'sqlite' || dbType === 'duckdb') {
      if (!sqlitePath.trim()) return '请填写数据库文件路径';
      return '';
    }

    if (!host.trim()) return '请填写主机名';
    if (!port) return '请填写端口';
    if (!database.trim()) return '请填写数据库名称';
    if (!username.trim()) return '请填写用户名';
    if (!password.trim()) return '请填写密码';
    return '';
  };

  const currentUrl = buildConnectionUrl();

  useEffect(() => {
    if (verifiedUrl && verifiedUrl !== currentUrl) {
      setVerifiedUrl('');
    }
  }, [currentUrl, verifiedUrl]);

  const handleTest = async () => {
    const validationMessage = validateConnectionForm();
    if (validationMessage) {
      setTestResult({ success: false, message: validationMessage });
      return;
    }

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
    const validationMessage = validateConnectionForm();
    if (validationMessage) {
      setTestResult({ success: false, message: validationMessage });
      warning(validationMessage);
      return;
    }

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
        name: `${DB_TYPES.find((t) => t.value === dbType)?.label || 'Custom'} - ${database || 'default'}`,
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
    setTesting(true);
    setTestResult(null);
    try {
      const result = await testDbConnection(config.url);
      if (result.success) {
        await onConnect?.(config.url);
        setVerifiedUrl(config.url);
        setTestResult({ success: true, message: '连接成功。' });
        success(`已连接到 ${config.name}`);
        setTimeout(() => {
          onClose();
        }, 800);
      } else {
        setTestResult({ success: false, message: result.message || '连接失败' });
        error(result.message || '连接失败');
      }
    } catch (e) {
      setTestResult({ success: false, message: `测试连接时出错: ${e.message}` });
      error(`测试连接时出错: ${e.message}`);
    } finally {
      setTesting(false);
    }
  };

  const handleDeleteSaved = async (id) => {
    try {
      await deleteDbConfig(id);
      setSavedConfigs(savedConfigs.filter((c) => c.id !== id));
      success('已删除保存的数据库配置。');
    } catch (e) {
      setTestResult({ success: false, message: `删除失败: ${e.message}` });
      error(`删除失败: ${e.message}`);
    }
  };

  const tabClass = (key) =>
    `flex-1 border-b-2 py-3 text-sm font-medium transition-colors ${
      activeTab === key
        ? 'border-emerald-600 bg-white text-emerald-700'
        : 'border-transparent text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900'
    }`;

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="max-w-[620px]"
      heightClass="max-h-[90vh]"
      bodyClass="bg-zinc-50"
      title={
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-emerald-50 p-2 text-emerald-700">
            <DatabaseIcon size={18} />
          </div>
          <div>
            <div className="text-[1.1rem] font-semibold text-foreground">数据库连接配置</div>
            <p className="mt-1 text-sm text-zinc-500">统一管理测试、保存和切换你的数据源连接。</p>
          </div>
        </div>
      }
    >
      <div className="border-b border-zinc-200 bg-zinc-50">
        <div className="flex">
          <button className={tabClass('form')} onClick={() => setActiveTab('form')}>表单配置</button>
          <button className={tabClass('custom')} onClick={() => setActiveTab('custom')}>自定义 URL</button>
          <button className={tabClass('saved')} onClick={() => setActiveTab('saved')}>已保存 ({savedConfigs.length})</button>
        </div>
      </div>

      <div className="min-h-[340px] overflow-y-auto p-6">
        {activeTab !== 'saved' && (
          <div className="mb-5">
            <InlineFeedback
              tone={verifiedUrl && verifiedUrl === currentUrl ? 'success' : 'info'}
              title={verifiedUrl && verifiedUrl === currentUrl ? '连接已验证' : '等待验证'}
              message={
                verifiedUrl && verifiedUrl === currentUrl
                  ? '当前连接参数已通过测试，可以直接保存并连接。'
                  : '当前连接参数尚未验证，保存并连接前会自动重新测试。'
              }
            />
          </div>
        )}

        {activeTab === 'form' && (
          <SectionCard title="表单连接参数" description="适合 PostgreSQL、MySQL、SQLite 和 DuckDB。">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-foreground">数据库类型</label>
                <select className={cn(ui.select, 'rounded-xl px-3 py-2')} value={dbType} onChange={(e) => setDbType(e.target.value)}>
                  {DB_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>

              {(dbType === 'sqlite' || dbType === 'duckdb') ? (
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-foreground">数据库文件路径</label>
                  <input
                    type="text"
                    className={cn(ui.inputMuted, 'rounded-xl px-3 py-2')}
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
                        className={cn(ui.inputMuted, 'rounded-xl px-3 py-2')}
                        value={host}
                        onChange={(e) => setHost(e.target.value)}
                        placeholder="localhost"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-sm font-medium text-foreground">端口</label>
                      <input
                        type="number"
                        className={cn(ui.inputMuted, 'rounded-xl px-3 py-2')}
                        value={port}
                        onChange={(e) => setPort(parseInt(e.target.value, 10) || '')}
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium text-foreground">数据库名称</label>
                    <input
                      type="text"
                      className={cn(ui.inputMuted, 'rounded-xl px-3 py-2')}
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
                        className={cn(ui.inputMuted, 'rounded-xl px-3 py-2')}
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="postgres"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-sm font-medium text-foreground">密码</label>
                      <div className="relative">
                        <input
                          type={showPassword ? 'text' : 'password'}
                          className={cn(ui.inputMuted, 'rounded-xl px-3 py-2 pr-16')}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="••••••••"
                        />
                        <button
                          type="button"
                          className="absolute inset-y-0 right-3 text-xs font-medium text-zinc-500 transition-colors hover:text-zinc-900"
                          onClick={() => setShowPassword((value) => !value)}
                        >
                          {showPassword ? '隐藏' : '查看'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </SectionCard>
        )}

        {activeTab === 'custom' && (
          <SectionCard title="自定义连接 URI" description="直接填写标准 SQLAlchemy 连接字符串。">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-foreground">连接 URI</label>
              <textarea
                className={cn(ui.textareaMuted, 'min-h-[110px] rounded-xl px-3 py-2 text-sm leading-6')}
                value={customUrl}
                onChange={(e) => setCustomUrl(e.target.value)}
                placeholder="例如: postgresql+psycopg2://user:pass@localhost:5432/dbname"
                rows={4}
              />
              <div className="mt-1 text-xs text-emerald-700">支持标准 SQLAlchemy 连接字符串格式</div>
            </div>
          </SectionCard>
        )}

        {activeTab === 'saved' && (
          <SectionCard title="已保存的数据源" description="先测试再连接，避免无效配置直接接入工作区。">
            {loadingSaved ? (
              <LoadingState title="正在加载已保存连接" description="读取本地元数据中的数据库配置。" />
            ) : savedConfigs.length === 0 ? (
              <EmptyState
                icon={<DatabaseIcon size={28} />}
                title="暂无保存的连接配置"
                description="先在表单配置或自定义 URL 里保存一条数据源，后续就可以一键复用。"
              />
            ) : (
              <div className="flex flex-col gap-3">
                {savedConfigs.map((config) => (
                  <div key={config.id} className="flex items-center justify-between rounded-2xl border border-zinc-200 bg-zinc-50 p-3.5 transition-colors hover:border-zinc-300 hover:bg-zinc-100">
                    <div className="min-w-0 pr-4">
                      <div className="flex items-center gap-2">
                        <div className="truncate text-sm font-semibold text-foreground">{config.name}</div>
                        <StatusBadge>{config.type}</StatusBadge>
                      </div>
                      <div className="mt-1 text-xs text-zinc-500">保存后会在连接前自动做测试。</div>
                    </div>
                    <div className="shrink-0 flex items-center gap-2">
                      <ToolbarButton variant="primary" className="rounded-xl px-4 py-1.5 text-xs shadow-sm" onClick={() => handleUseSaved(config)}>
                        连接
                      </ToolbarButton>
                      <button
                        className="rounded-lg border border-transparent p-1.5 text-zinc-500 transition-all hover:border-rose-200 hover:bg-rose-50 hover:text-rose-500"
                        onClick={() => handleDeleteSaved(config.id)}
                      >
                        <TrashIcon size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        )}

        {testResult && (
          <div className="mt-6">
            <InlineFeedback
              tone={testResult.success ? 'success' : 'danger'}
              title={testResult.success ? '连接测试通过' : '连接测试失败'}
              message={testResult.message}
            />
          </div>
        )}
      </div>

      {activeTab !== 'saved' && (
        <div className="flex items-center justify-between gap-3 border-t border-zinc-200 bg-zinc-50 px-6 py-4">
          <div className="flex items-center gap-2 text-xs text-zinc-500">
            {verifiedUrl && verifiedUrl === currentUrl ? (
              <>
                <CheckIcon size={14} className="text-emerald-600" />
                当前配置已验证
              </>
            ) : (
              <>
                <CloseIcon size={14} className="text-zinc-400" />
                当前配置尚未验证
              </>
            )}
          </div>
          <div className="flex items-center gap-3">
            <ToolbarButton className="rounded-xl px-5 py-2 disabled:opacity-50" onClick={handleTest} disabled={testing}>
              {testing ? '测试中...' : '测试连接'}
            </ToolbarButton>
            <ToolbarButton
              variant="primary"
              className="rounded-xl px-5 py-2 disabled:opacity-50"
              onClick={handleSaveAndConnect}
              disabled={saving || testing}
            >
              {saving ? '保存中...' : '保存并连接'}
            </ToolbarButton>
          </div>
        </div>
      )}
    </ModalShell>
  );
}
