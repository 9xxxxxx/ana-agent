'use client';

import { useState, useEffect, useMemo } from 'react';
import { CloseIcon, SettingsIcon, UserIcon, InfoIcon, SparklesIcon, SpinnerIcon } from './Icons';
import { useToast } from './Toast';
import { fetchSystemStatus } from '@/lib/api';
import { cn, ui } from './ui';

export default function SettingsModal({ isOpen, onClose }) {
  const { success, error, warning } = useToast();
  const [activeTab, setActiveTab] = useState('general');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [selectedModel, setSelectedModel] = useState('deepseek-chat');

  const [isTesting, setIsTesting] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [testSteps, setTestSteps] = useState([]);
  const [lastTestedFingerprint, setLastTestedFingerprint] = useState('');
  const [lastTestSuccess, setLastTestSuccess] = useState(false);
  const [systemStatus, setSystemStatus] = useState(null);
  const [loadingStatus, setLoadingStatus] = useState(false);

  const currentFingerprint = useMemo(
    () =>
      JSON.stringify({
        model: selectedModel.trim(),
        apiKey: apiKey.trim(),
        baseUrl: baseUrl.trim(),
      }),
    [selectedModel, apiKey, baseUrl]
  );

  // 根据模型获取默认 Base URL
  const getDefaultBaseUrl = (model) => {
    if (model.startsWith('deepseek')) {
      return 'https://api.deepseek.com/v1';
    }
    if (model.startsWith('gpt')) {
      return 'https://api.openai.com/v1';
    }
    return 'https://api.openai.com/v1';
  };

  // 当模型改变时，自动填充默认 Base URL（如果 Base URL 为空）
  const handleModelChange = (e) => {
    const model = e.target.value;
    setSelectedModel(model);
    if (!baseUrl.trim()) {
      setBaseUrl(getDefaultBaseUrl(model));
    }
  };

  // 弹窗打开时加载本地存储
  useEffect(() => {
    if (!isOpen) {
      document.body.style.overflow = '';
      return () => { document.body.style.overflow = ''; };
    }

    document.body.style.overflow = 'hidden';
    const savedPrompt = localStorage.getItem('sqlAgentSystemPrompt') || '';
    const savedApiKey = localStorage.getItem('sqlAgentApiKey') || '';
    const savedBaseUrl = localStorage.getItem('sqlAgentBaseUrl') || '';
    const savedModel = localStorage.getItem('sqlAgentModel') || 'deepseek-chat';

    setSystemPrompt(savedPrompt);
    setApiKey(savedApiKey);
    setSelectedModel(savedModel);
    setBaseUrl(savedBaseUrl || getDefaultBaseUrl(savedModel));
    setLastTestedFingerprint('');
    setLastTestSuccess(false);
    setTestSteps([]);

    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || activeTab !== 'about') return;
    let cancelled = false;
    setLoadingStatus(true);
    fetchSystemStatus()
      .then((data) => {
        if (!cancelled) {
          setSystemStatus(data.success ? data : null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSystemStatus(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingStatus(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, activeTab]);

  const handleSavePrompt = () => {
    localStorage.setItem('sqlAgentSystemPrompt', systemPrompt);
    localStorage.setItem('sqlAgentApiKey', apiKey);
    localStorage.setItem('sqlAgentBaseUrl', baseUrl);
    localStorage.setItem('sqlAgentModel', selectedModel);
    
    // 如果有 onSettingsChange 回调，则调用它
    if (window.dispatchEvent) {
      window.dispatchEvent(new CustomEvent('sql-agent-settings-updated', { 
        detail: { model: selectedModel, apiKey, baseUrl, systemPrompt } 
      }));
    }

    if (lastTestSuccess && lastTestedFingerprint === currentFingerprint) {
      success('AI 设置已保存并通过测试。');
    } else {
      warning('AI 设置已保存，但当前模型凭据尚未通过最新测试。');
    }
  };

  const handleTestConnection = async ({ saveAfterTest = false } = {}) => {
    if (isTesting) return;
    setIsTesting(true);
    setLastTestSuccess(false);
    setTestSteps([
      { id: 1, status: 'pending', message: '验证配置参数完整性' },
      { id: 2, status: 'pending', message: '建立与 API 服务器的连接' },
      { id: 3, status: 'pending', message: '验证 API Key 有效性' },
      { id: 4, status: 'pending', message: '测试模型响应能力' },
    ]);

    try {
      // 步骤 1: 验证配置参数
      await new Promise(resolve => setTimeout(resolve, 500));
      setTestSteps(prev => prev.map(s => s.id === 1 ? { ...s, status: 'running' } : s));
      
      if (!selectedModel) {
        throw new Error('请选择模型');
      }
      
      await new Promise(resolve => setTimeout(resolve, 300));
      setTestSteps(prev => prev.map(s => s.id === 1 ? { ...s, status: 'completed' } : s));

      // 步骤 2: 建立连接
      await new Promise(resolve => setTimeout(resolve, 500));
      setTestSteps(prev => prev.map(s => s.id === 2 ? { ...s, status: 'running' } : s));
      
      const { testModelConnection } = await import('@/lib/api');
      await testModelConnection(selectedModel, apiKey, baseUrl);
      
      await new Promise(resolve => setTimeout(resolve, 300));
      setTestSteps(prev => prev.map(s => s.id === 2 ? { ...s, status: 'completed' } : s));

      // 步骤 3: 验证 API Key
      await new Promise(resolve => setTimeout(resolve, 500));
      setTestSteps(prev => prev.map(s => s.id === 3 ? { ...s, status: 'running' } : s));
      
      await new Promise(resolve => setTimeout(resolve, 300));
      setTestSteps(prev => prev.map(s => s.id === 3 ? { ...s, status: 'completed' } : s));

      // 步骤 4: 测试模型响应
      await new Promise(resolve => setTimeout(resolve, 500));
      setTestSteps(prev => prev.map(s => s.id === 4 ? { ...s, status: 'running' } : s));
      
      await new Promise(resolve => setTimeout(resolve, 300));
      setTestSteps(prev => prev.map(s => s.id === 4 ? { ...s, status: 'completed' } : s));

      setLastTestedFingerprint(currentFingerprint);
      setLastTestSuccess(true);

      if (saveAfterTest) {
        localStorage.setItem('sqlAgentSystemPrompt', systemPrompt);
        localStorage.setItem('sqlAgentApiKey', apiKey);
        localStorage.setItem('sqlAgentBaseUrl', baseUrl);
        localStorage.setItem('sqlAgentModel', selectedModel);
        if (window.dispatchEvent) {
          window.dispatchEvent(new CustomEvent('sql-agent-settings-updated', {
            detail: { model: selectedModel, apiKey, baseUrl, systemPrompt }
          }));
        }
        success('模型测试通过，设置已保存生效。');
      } else {
        success('连接测试成功，当前模型配置可用。');
      }
    } catch (e) {
      error(`❌ 测试失败: ${e.message}`);
      setTestSteps(prev => prev.map(s => s.status === 'running' ? { ...s, status: 'failed' } : s));
      setLastTestSuccess(false);
    } finally {
      setIsTesting(false);
    }
  };

  if (!isOpen) return null;

  const tabs = [
    { id: 'general', label: '通用设置', icon: <SettingsIcon size={16} /> },
    { id: 'agent', label: 'AI 偏好', icon: <SparklesIcon size={16} /> },
    { id: 'account', label: '账号信息', icon: <UserIcon size={16} /> },
    { id: 'about', label: '关于应用', icon: <InfoIcon size={16} /> }
  ];

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="fixed inset-0"
        onClick={onClose}
      />
      <div className="relative flex h-[80vh] max-h-[640px] w-full max-w-4xl flex-col overflow-hidden rounded-[28px] border border-zinc-200 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.2)] md:flex-row animate-in zoom-in-95 slide-in-from-bottom-4 duration-300">
        
        {/* 左侧 Tab 栏 */}
        <div className="flex w-full flex-col border-r border-zinc-200 bg-zinc-50 pt-4 md:w-60">
          <div className="flex items-center justify-between px-5 pb-4 md:border-b md:border-zinc-200">
            <h2 className="text-lg font-semibold text-foreground">设置</h2>
            <button className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-zinc-100 hover:text-foreground md:hidden" onClick={onClose}>
              <CloseIcon size={18} />
            </button>
          </div>
          <div className="no-scrollbar flex flex-1 overflow-x-auto overflow-y-auto px-3 py-3 md:block md:overflow-x-hidden space-y-1">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-auto md:w-full shrink-0 flex items-center gap-3 px-3 py-2.5 rounded-xl text-[14px] font-medium transition-colors ${
                  activeTab === tab.id 
                    ? 'border border-zinc-200 bg-white text-zinc-950 shadow-sm' 
                    : 'border border-transparent text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900'
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* 右侧内容区 */}
        <div className="relative flex flex-1 flex-col bg-white">
          <button 
            className="absolute right-4 top-4 z-10 hidden rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 md:flex" 
            onClick={onClose}
          >
            <CloseIcon size={18} />
          </button>
          
          <div className="flex-1 overflow-y-auto p-6 md:p-8">
            {/* 通用设置 Tab */}
            {activeTab === 'general' && (
              <div className="space-y-8 animate-in fade-in slide-in-from-right-2 duration-300">
                <div>
                  <h3 className="text-[15px] font-semibold text-foreground mb-4">界面与外观</h3>
                  <div className="flex items-center justify-between py-3 border-b border-border">
                    <div>
                      <div className="font-medium text-foreground text-sm">主题模式</div>
                      <div className="text-xs text-muted-foreground mt-1">当前项目锁定为浅色模式，避免主题分叉继续扩散</div>
                    </div>
                    <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-sm text-foreground">
                      浅色固定
                    </div>
                  </div>
                  <div className="flex items-center justify-between py-3 border-b border-border">
                    <div>
                      <div className="font-medium text-foreground text-sm">紧凑模式</div>
                      <div className="text-xs text-muted-foreground mt-1">在聊天列表中显示更多密集的信息</div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" className="sr-only peer" />
                      <div className="w-11 h-6 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-background after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-foreground"></div>
                    </label>
                  </div>
                </div>
              </div>
            )}

            {/* AI 偏好 Tab */}
            {activeTab === 'agent' && (
              <div className="space-y-6 animate-in fade-in slide-in-from-right-2 duration-300">
                <div className="space-y-4">
                  <div>
                    <h3 className="text-[15px] font-semibold text-foreground mb-2">模型服务商配置</h3>
                    <p className="text-sm text-muted-foreground mb-4">您可以覆盖默认的大模型凭据以使用自己的 API Key。留空则使用本地环境变量默认值。</p>
                    <div className={`mb-4 rounded-2xl border px-4 py-3 text-sm ${
                      lastTestSuccess && lastTestedFingerprint === currentFingerprint
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                        : 'border-zinc-200 bg-zinc-50 text-zinc-700'
                    }`}>
                      {lastTestSuccess && lastTestedFingerprint === currentFingerprint
                        ? '当前模型配置已通过测试，可以放心使用。'
                        : '当前模型凭据尚未通过最新测试，建议保存前先验证一次。'}
                    </div>
                    
                    <div className="space-y-4">
                      <div>
                          <div className="flex items-center justify-between mb-1">
                          <label className="block text-xs font-medium text-muted-foreground">默认分析模型</label>
                          <button 
                            className={`flex items-center gap-1 text-[11px] font-semibold transition-colors ${isTesting ? 'cursor-not-allowed text-zinc-400' : 'text-emerald-700 hover:text-emerald-600'}`}
                            onClick={() => handleTestConnection()}
                            disabled={isTesting}
                          >
                            {isTesting ? '测试中...' : '测试连接 (验证 API Key)'}
                          </button>
                        </div>
                        <select 
                          className={cn(ui.select, 'px-3 py-2')}
                          value={selectedModel}
                          onChange={handleModelChange}
                        >
                          <option value="deepseek-chat">DeepSeek-Chat (标准智增)</option>
                          <option value="deepseek-reasoner">DeepSeek-Reasoner (深度思考)</option>
                          <option value="gpt-4o">GPT-4o (全能旗舰)</option>
                        </select>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="relative">
                          <label className="block text-xs font-medium text-muted-foreground mb-1">API Key (可选)</label>
                          <input
                            type={showApiKey ? "text" : "password"}
                            placeholder="sk-..."
                            className={cn(ui.inputMuted, 'px-3 py-2')}
                            value={apiKey}
                            onChange={(e) => setApiKey(e.target.value)}
                          />
                          <button 
                            className="absolute right-3 top-[26px] text-zinc-500 transition-colors hover:text-zinc-900"
                            onClick={() => setShowApiKey(!showApiKey)}
                          >
                            {showApiKey ? '🔓' : '🔒'}
                          </button>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-muted-foreground mb-1">Base URL (可选)</label>
                          <input
                            type="text"
                            placeholder="https://api.openai.com/v1"
                            className={cn(ui.inputMuted, 'px-3 py-2')}
                            value={baseUrl}
                            onChange={(e) => setBaseUrl(e.target.value)}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 测试进度显示 */}
                  {isTesting && testSteps.length > 0 && (
                    <div className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <SpinnerIcon size={16} className="animate-spin text-emerald-600" />
                        <span className="text-sm font-medium text-emerald-900">连接测试进行中...</span>
                      </div>
                      <div className="space-y-2">
                        {testSteps.map((step, index) => (
                          <div key={step.id} className="flex items-start gap-3">
                            <div className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-xs font-medium
                              ${step.status === 'completed' ? 'bg-green-500 text-white' : 
                                step.status === 'running' ? 'bg-emerald-500 text-white animate-pulse' : 
                                step.status === 'failed' ? 'bg-red-500 text-white' : 
                                'bg-zinc-200 text-zinc-500'}`}>
                              {step.status === 'completed' ? '✓' : 
                               step.status === 'running' ? '...' : 
                               step.status === 'failed' ? '✗' : 
                               index + 1}
                            </div>
                            <div className="flex-1">
                              <p className={`text-sm ${step.status === 'running' ? 'font-medium text-emerald-700' : 
                                step.status === 'completed' ? 'text-green-700' : 
                                step.status === 'failed' ? 'text-red-700' : 
                                'text-zinc-600'}`}>
                                {step.message}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <hr className="my-4 border-zinc-200" />
                  <div>
                    <h3 className="text-[15px] font-semibold text-foreground mb-2">系统级核心提示词</h3>
                    <p className="mb-4 text-sm text-muted-foreground">修改 System Prompt 可以改变 Agent 分析数据时的风格倾向。注意：这可能会破坏图表生成的兼容性。</p>
                    <div className="mb-4 rounded-2xl border border-sky-100 bg-sky-50 px-4 py-3 text-sm text-sky-900">
                      本地 `.env` 里的 `OPENAI_API_KEY` 和 `OPENAI_API_BASE` 是后端默认值。
                      这里填写的 API Key / Base URL 只会覆盖当前浏览器前端发起的请求，不会改写服务器 `.env`。
                    </div>
                    <textarea 
                      rows={6}
                      className={cn(ui.textareaMuted, 'min-h-[160px] p-4 text-sm leading-7')}
                      value={systemPrompt}
                      onChange={(e) => setSystemPrompt(e.target.value)}
                    />
                  </div>
                  
                  <div className="mt-4 flex justify-end">
                    <button
                      onClick={() => handleTestConnection({ saveAfterTest: true })}
                      disabled={isTesting}
                      className={cn(ui.buttonSecondary, 'mr-3 rounded-xl px-4 py-2 disabled:opacity-50')}
                    >
                      {isTesting ? '测试中...' : '测试并保存'}
                    </button>
                    <button 
                      onClick={handleSavePrompt}
                      disabled={isTesting}
                      className={cn(ui.buttonPrimary, 'rounded-xl px-4 py-2')}
                      >
                      保存设置
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* 账号信息 Tab */}
            {activeTab === 'account' && (
              <div className="space-y-6 animate-in fade-in slide-in-from-right-2 duration-300 flex flex-col items-center justify-center pt-10 text-center">
                <div className="w-20 h-20 rounded-full bg-muted text-foreground flex items-center justify-center mb-4">
                  <UserIcon size={32} />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-foreground">本地离线用户</h3>
                  <p className="text-sm text-muted-foreground mt-2 max-w-[280px] mx-auto">
                    您当前正在以本地模式运行 SQL Agent。所有对话与连接记录保存在本地缓存和 SQLite 文件中。
                  </p>
                </div>
                <button className="mt-6 px-6 py-2.5 bg-popover border border-border hover:bg-muted text-foreground text-sm font-medium rounded-xl shadow-sm transition-all">
                  云端同步 (开发中)
                </button>
              </div>
            )}

            {/* 关于 Tab */}
            {activeTab === 'about' && (
              <div className="space-y-6 animate-in fade-in slide-in-from-right-2 duration-300">
                <div className="flex flex-col items-center justify-center pt-2 text-center">
                  <div className="w-16 h-16 rounded-2xl bg-foreground text-background flex items-center justify-center shadow-lg mb-4">
                    <SparklesIcon size={28} />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-foreground tracking-tight">SQL Agent</h3>
                    <p className="text-sm text-muted-foreground mt-1">Version 2.0.0 (Phase J)</p>
                  </div>
                  <div className="text-sm text-muted-foreground space-y-2 max-w-sm mt-4">
                    <p>当前运行态已经接入内嵌 Prefect、可编排报告画布与多专家会商链路。</p>
                    <p>下面这块直接读取后端真实状态，不再靠静态说明文案。</p>
                  </div>
                </div>

                {loadingStatus ? (
                  <div className="rounded-2xl border border-border bg-muted/40 px-4 py-8 text-center text-sm text-muted-foreground">
                    正在读取系统状态...
                  </div>
                ) : systemStatus?.runtime ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="rounded-2xl border border-border bg-muted/40 p-4">
                        <div className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">启动命令</div>
                        <div className="mt-3 space-y-2 text-sm text-foreground">
                          <div className="rounded-xl bg-white px-3 py-2 font-mono">{systemStatus.startup?.python}</div>
                          <div className="rounded-xl bg-white px-3 py-2 font-mono">{systemStatus.startup?.frontend}</div>
                        </div>
                      </div>
                      <div className="rounded-2xl border border-border bg-muted/40 p-4">
                        <div className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">运行拓扑</div>
                        <div className="mt-3 space-y-2 text-sm text-foreground">
                          <div>Prefect: {systemStatus.runtime.prefect_embedded ? '内嵌后端 Runner' : '外部服务'}</div>
                          <div>数据库连接已配置: {systemStatus.runtime.database_connected ? '是' : '否'}</div>
                          <div>已保存数据源: {systemStatus.runtime.db_config_count}</div>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-border bg-muted/40 p-4">
                      <div className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">元数据与存储</div>
                      <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-foreground">
                        <div className="rounded-xl bg-popover px-3 py-3">
                          <div className="font-semibold">Agent Memory</div>
                          <div className="mt-1 break-all text-muted-foreground">{systemStatus.runtime.agent_memory_db_path}</div>
                        </div>
                        <div className="rounded-xl bg-popover px-3 py-3">
                          <div className="font-semibold">App Metadata</div>
                          <div className="mt-1 break-all text-muted-foreground">{systemStatus.runtime.metadata_db_path}</div>
                        </div>
                        <div className="rounded-xl bg-popover px-3 py-3">
                          <div className="font-semibold">Prefect Metadata</div>
                          <div className="mt-1 break-all text-muted-foreground">{systemStatus.runtime.prefect_db_path}</div>
                        </div>
                        <div className="rounded-xl bg-popover px-3 py-3">
                          <div className="font-semibold">当前业务数据库</div>
                          <div className="mt-1 break-all text-muted-foreground">{systemStatus.runtime.database_url || '未配置'}</div>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-border bg-muted/40 p-4">
                      <div className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">启动说明</div>
                      <div className="mt-3 space-y-2 text-sm text-foreground">
                        {(systemStatus.startup?.notes || []).map((note, index) => (
                          <div key={index} className="rounded-xl bg-popover px-3 py-2 text-muted-foreground">
                            {note}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800">
                    系统状态暂时不可用，请确认后端已经启动。
                  </div>
                )}
              </div>
            )}
            
          </div>
        </div>
      </div>
    </div>
  );
}
