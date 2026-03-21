'use client';

/**
 * 数据库连接配置面板
 * 支持多种数据库类型的连接配置
 */

import { useState, useEffect } from 'react';
import { testDbConnection, saveDbConfig, getDbConfig } from '@/lib/api';

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
  const [useCustomUrl, setUseCustomUrl] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [savedConfigs, setSavedConfigs] = useState([]);
  const [activeTab, setActiveTab] = useState('form'); // 'form' | 'saved' | 'custom'

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
    if (useCustomUrl && customUrl) {
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

  const handleUseSaved = (config) => {
    onConnect?.(config.url);
    onClose();
  };

  const handleDeleteSaved = async (id) => {
    // TODO: 实现删除API
    setSavedConfigs(savedConfigs.filter(c => c.id !== id));
  };

  if (!isOpen) return null;

  return (
    <div className="db-panel-overlay">
      <div className="db-panel">
        <div className="db-panel-header">
          <h3>🔗 数据库连接配置</h3>
          <button className="db-panel-close" onClick={onClose}>✕</button>
        </div>

        <div className="db-panel-tabs">
          <button
            className={`db-panel-tab ${activeTab === 'form' ? 'active' : ''}`}
            onClick={() => setActiveTab('form')}
          >
            表单配置
          </button>
          <button
            className={`db-panel-tab ${activeTab === 'custom' ? 'active' : ''}`}
            onClick={() => setActiveTab('custom')}
          >
            自定义URL
          </button>
          <button
            className={`db-panel-tab ${activeTab === 'saved' ? 'active' : ''}`}
            onClick={() => setActiveTab('saved')}
          >
            已保存 ({savedConfigs.length})
          </button>
        </div>

        <div className="db-panel-body">
          {activeTab === 'form' && (
            <div className="db-form">
              <div className="db-form-group">
                <label>数据库类型</label>
                <select value={dbType} onChange={(e) => setDbType(e.target.value)}>
                  {DB_TYPES.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>

              {(dbType === 'sqlite' || dbType === 'duckdb') ? (
                <div className="db-form-group">
                  <label>数据库文件路径</label>
                  <input
                    type="text"
                    value={sqlitePath}
                    onChange={(e) => setSqlitePath(e.target.value)}
                    placeholder="例如: ./data/mydb.sqlite"
                  />
                </div>
              ) : (
                <>
                  <div className="db-form-row">
                    <div className="db-form-group">
                      <label>主机</label>
                      <input
                        type="text"
                        value={host}
                        onChange={(e) => setHost(e.target.value)}
                        placeholder="localhost"
                      />
                    </div>
                    <div className="db-form-group">
                      <label>端口</label>
                      <input
                        type="number"
                        value={port}
                        onChange={(e) => setPort(parseInt(e.target.value) || '')}
                      />
                    </div>
                  </div>

                  <div className="db-form-group">
                    <label>数据库名</label>
                    <input
                      type="text"
                      value={database}
                      onChange={(e) => setDatabase(e.target.value)}
                      placeholder="database_name"
                    />
                  </div>

                  <div className="db-form-row">
                    <div className="db-form-group">
                      <label>用户名</label>
                      <input
                        type="text"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                      />
                    </div>
                    <div className="db-form-group">
                      <label>密码</label>
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                      />
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {activeTab === 'custom' && (
            <div className="db-form">
              <div className="db-form-group">
                <label>自定义连接URL</label>
                <textarea
                  value={customUrl}
                  onChange={(e) => setCustomUrl(e.target.value)}
                  placeholder="例如: postgresql+psycopg2://user:pass@localhost:5432/dbname"
                  rows={3}
                />
                <div className="db-form-hint">
                  支持标准 SQLAlchemy 连接字符串格式
                </div>
              </div>
            </div>
          )}

          {activeTab === 'saved' && (
            <div className="db-saved-list">
              {savedConfigs.length === 0 ? (
                <div className="db-empty">暂无保存的连接配置</div>
              ) : (
                savedConfigs.map(config => (
                  <div key={config.id} className="db-saved-item">
                    <div className="db-saved-info">
                      <div className="db-saved-name">{config.name}</div>
                      <div className="db-saved-type">{config.type}</div>
                    </div>
                    <div className="db-saved-actions">
                      <button onClick={() => handleUseSaved(config)}>连接</button>
                      <button onClick={() => handleDeleteSaved(config.id)}>删除</button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {testResult && (
            <div className={`db-test-result ${testResult.success ? 'success' : 'error'}`}>
              {testResult.success ? '✅' : '❌'} {testResult.message}
            </div>
          )}
        </div>

        {activeTab !== 'saved' && (
          <div className="db-panel-footer">
            <button
              className="db-btn db-btn-secondary"
              onClick={handleTest}
              disabled={testing}
            >
              {testing ? '测试中...' : '测试连接'}
            </button>
            <button
              className="db-btn db-btn-primary"
              onClick={handleSaveAndConnect}
              disabled={saving || testing}
            >
              {saving ? '保存中...' : '保存并连接'}
            </button>
          </div>
        )}
      </div>

      <style jsx>{`
        .db-panel-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.6);
          backdrop-filter: blur(4px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 10000;
          animation: fadeIn 0.2s ease-out;
        }

        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        .db-panel {
          background: var(--bg-primary);
          border: 1px solid var(--border-color);
          border-radius: 16px;
          width: 90%;
          max-width: 500px;
          max-height: 90vh;
          overflow: hidden;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
          animation: slideUp 0.3s ease-out;
        }

        @keyframes slideUp {
          from { transform: translateY(20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }

        .db-panel-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 20px 24px;
          border-bottom: 1px solid var(--border-color);
        }

        .db-panel-header h3 {
          margin: 0;
          font-size: 18px;
          font-weight: 600;
          color: var(--text-primary);
        }

        .db-panel-close {
          background: none;
          border: none;
          color: var(--text-secondary);
          font-size: 20px;
          cursor: pointer;
          padding: 4px;
          border-radius: 4px;
          transition: all 0.2s;
        }

        .db-panel-close:hover {
          background: var(--bg-hover);
          color: var(--text-primary);
        }

        .db-panel-tabs {
          display: flex;
          border-bottom: 1px solid var(--border-color);
          background: var(--bg-secondary);
        }

        .db-panel-tab {
          flex: 1;
          padding: 12px;
          border: none;
          background: none;
          color: var(--text-secondary);
          font-size: 14px;
          cursor: pointer;
          transition: all 0.2s;
          border-bottom: 2px solid transparent;
        }

        .db-panel-tab:hover {
          color: var(--text-primary);
          background: var(--bg-hover);
        }

        .db-panel-tab.active {
          color: var(--accent);
          border-bottom-color: var(--accent);
        }

        .db-panel-body {
          padding: 24px;
          max-height: 50vh;
          overflow-y: auto;
        }

        .db-form-group {
          margin-bottom: 16px;
        }

        .db-form-group label {
          display: block;
          margin-bottom: 6px;
          font-size: 13px;
          font-weight: 500;
          color: var(--text-secondary);
        }

        .db-form-group input,
        .db-form-group select,
        .db-form-group textarea {
          width: 100%;
          padding: 10px 12px;
          border: 1px solid var(--border-color);
          border-radius: 8px;
          background: var(--bg-primary);
          color: var(--text-primary);
          font-size: 14px;
          transition: all 0.2s;
        }

        .db-form-group input:focus,
        .db-form-group select:focus,
        .db-form-group textarea:focus {
          outline: none;
          border-color: var(--accent);
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
        }

        .db-form-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }

        .db-form-hint {
          margin-top: 6px;
          font-size: 12px;
          color: var(--text-tertiary);
        }

        .db-saved-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .db-saved-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px;
          background: var(--bg-secondary);
          border: 1px solid var(--border-color);
          border-radius: 8px;
        }

        .db-saved-name {
          font-weight: 500;
          color: var(--text-primary);
        }

        .db-saved-type {
          font-size: 12px;
          color: var(--text-tertiary);
          margin-top: 2px;
        }

        .db-saved-actions {
          display: flex;
          gap: 8px;
        }

        .db-saved-actions button {
          padding: 6px 12px;
          border: none;
          border-radius: 6px;
          font-size: 13px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .db-saved-actions button:first-child {
          background: var(--accent);
          color: white;
        }

        .db-saved-actions button:first-child:hover {
          opacity: 0.9;
        }

        .db-saved-actions button:last-child {
          background: var(--bg-primary);
          color: var(--text-secondary);
          border: 1px solid var(--border-color);
        }

        .db-saved-actions button:last-child:hover {
          background: var(--bg-hover);
        }

        .db-empty {
          text-align: center;
          padding: 40px;
          color: var(--text-tertiary);
        }

        .db-test-result {
          margin-top: 16px;
          padding: 12px;
          border-radius: 8px;
          font-size: 14px;
        }

        .db-test-result.success {
          background: rgba(34, 197, 94, 0.1);
          color: #22c55e;
          border: 1px solid rgba(34, 197, 94, 0.3);
        }

        .db-test-result.error {
          background: rgba(239, 68, 68, 0.1);
          color: #ef4444;
          border: 1px solid rgba(239, 68, 68, 0.3);
        }

        .db-panel-footer {
          display: flex;
          gap: 12px;
          padding: 16px 24px;
          background: var(--bg-secondary);
          border-top: 1px solid var(--border-color);
        }

        .db-btn {
          flex: 1;
          padding: 12px 20px;
          border: none;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
        }

        .db-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .db-btn-primary {
          background: var(--accent);
          color: white;
        }

        .db-btn-primary:hover:not(:disabled) {
          opacity: 0.9;
        }

        .db-btn-secondary {
          background: var(--bg-primary);
          color: var(--text-secondary);
          border: 1px solid var(--border-color);
        }

        .db-btn-secondary:hover:not(:disabled) {
          background: var(--bg-hover);
          border-color: var(--border-hover);
        }
      `}</style>
    </div>
  );
}
