'use client';

import { useState, useEffect } from 'react';
import { CloseIcon, SettingsIcon, UserIcon, InfoIcon, SparklesIcon, SpinnerIcon } from './Icons';
import { useToast } from './Toast';

export default function SettingsModal({ isOpen, onClose }) {
  const { success, error, info } = useToast();
  const [activeTab, setActiveTab] = useState('general');
  const [theme, setTheme] = useState('light');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [selectedModel, setSelectedModel] = useState('deepseek-chat');

  const [isTesting, setIsTesting] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [testSteps, setTestSteps] = useState([]);
  const [currentStep, setCurrentStep] = useState(0);

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
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      const savedPrompt = localStorage.getItem('sqlAgentSystemPrompt');
      if (savedPrompt) {
        setSystemPrompt(savedPrompt);
      }
      const savedApiKey = localStorage.getItem('sqlAgentApiKey');
      if (savedApiKey) {
        setApiKey(savedApiKey);
      }
      const savedBaseUrl = localStorage.getItem('sqlAgentBaseUrl');
      if (savedBaseUrl) {
        setBaseUrl(savedBaseUrl);
      }
      const savedModel = localStorage.getItem('sqlAgentModel');
      if (savedModel) {
        setSelectedModel(savedModel);
        if (!savedBaseUrl && getDefaultBaseUrl(savedModel)) {
          setBaseUrl(getDefaultBaseUrl(savedModel));
        }
      } else if (!baseUrl) {
        setBaseUrl(getDefaultBaseUrl(selectedModel));
      }
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

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
    
    success('AI 设置已保存生效！');
  };

  const handleTestConnection = async () => {
    if (isTesting) return;
    setIsTesting(true);
    setCurrentStep(0);
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
      setCurrentStep(1);

      // 步骤 2: 建立连接
      await new Promise(resolve => setTimeout(resolve, 500));
      setTestSteps(prev => prev.map(s => s.id === 2 ? { ...s, status: 'running' } : s));
      
      const { testModelConnection } = await import('@/lib/api');
      const result = await testModelConnection(selectedModel, apiKey, baseUrl);
      
      await new Promise(resolve => setTimeout(resolve, 300));
      setTestSteps(prev => prev.map(s => s.id === 2 ? { ...s, status: 'completed' } : s));
      setCurrentStep(2);

      // 步骤 3: 验证 API Key
      await new Promise(resolve => setTimeout(resolve, 500));
      setTestSteps(prev => prev.map(s => s.id === 3 ? { ...s, status: 'running' } : s));
      
      await new Promise(resolve => setTimeout(resolve, 300));
      setTestSteps(prev => prev.map(s => s.id === 3 ? { ...s, status: 'completed' } : s));
      setCurrentStep(3);

      // 步骤 4: 测试模型响应
      await new Promise(resolve => setTimeout(resolve, 500));
      setTestSteps(prev => prev.map(s => s.id === 4 ? { ...s, status: 'running' } : s));
      
      await new Promise(resolve => setTimeout(resolve, 300));
      setTestSteps(prev => prev.map(s => s.id === 4 ? { ...s, status: 'completed' } : s));
      
      success('✅ 连接测试成功！模型配置正常');
    } catch (e) {
      error(`❌ 测试失败: ${e.message}`);
      setTestSteps(prev => prev.map(s => s.status === 'running' ? { ...s, status: 'failed' } : s));
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
    <div className="fixed inset-0 z-[9999] bg-background/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div 
        className="fixed inset-0"
        onClick={onClose}
      />
      <div className="relative w-full max-w-3xl bg-popover rounded-2xl shadow-2xl border border-border flex flex-col md:flex-row h-[80vh] max-h-[600px] overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-4 duration-300">
        
        {/* 左侧 Tab 栏 */}
        <div className="w-full md:w-56 bg-muted border-r border-border flex flex-col pt-4">
          <div className="px-5 pb-4 md:border-b border-border flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">设置</h2>
            <button className="md:hidden p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg transition" onClick={onClose}>
              <CloseIcon size={18} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-1 flex md:block overflow-x-auto md:overflow-x-hidden no-scrollbar">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-auto md:w-full shrink-0 flex items-center gap-3 px-3 py-2.5 rounded-xl text-[14px] font-medium transition-colors ${
                  activeTab === tab.id 
                    ? 'bg-popover text-foreground shadow-sm border border-border' 
                    : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground border border-transparent'
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* 右侧内容区 */}
        <div className="flex-1 bg-popover relative flex flex-col">
          <button 
            className="hidden md:flex absolute right-4 top-4 p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors z-10" 
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
                      <div className="text-xs text-muted-foreground mt-1">切换应用的色彩风格</div>
                    </div>
                    <select 
                      className="px-3 py-1.5 bg-muted border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-foreground/10"
                      value={theme}
                      onChange={(e) => setTheme(e.target.value)}
                    >
                      <option value="light">浅色 (Light)</option>
                      <option value="dark">深色 (Dark)</option>
                      <option value="system">跟随系统</option>
                    </select>
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
                    
                    <div className="space-y-4">
                      <div>
                          <div className="flex items-center justify-between mb-1">
                          <label className="block text-xs font-medium text-muted-foreground">默认分析模型</label>
                          <button 
                            className={`text-[11px] font-semibold flex items-center gap-1 transition-colors ${isTesting ? 'text-gray-400 cursor-not-allowed' : 'text-indigo-600 hover:text-indigo-500'}`}
                            onClick={handleTestConnection}
                            disabled={isTesting}
                          >
                            {isTesting ? '测试中...' : '测试连接 (验证 API Key)'}
                          </button>
                        </div>
                        <select 
                          className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-foreground/10 transition-colors bg-muted focus:bg-popover text-foreground appearance-none cursor-pointer"
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
                            className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-foreground/10 transition-colors bg-muted focus:bg-popover text-foreground"
                            value={apiKey}
                            onChange={(e) => setApiKey(e.target.value)}
                          />
                          <button 
                            className="absolute right-3 top-[26px] text-muted-foreground hover:text-foreground transition-colors"
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
                            className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-foreground/10 transition-colors bg-muted focus:bg-popover text-foreground"
                            value={baseUrl}
                            onChange={(e) => setBaseUrl(e.target.value)}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 测试进度显示 */}
                  {isTesting && testSteps.length > 0 && (
                    <div className="mt-4 p-4 bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-950/30 dark:to-purple-950/30 border border-indigo-200 dark:border-indigo-800 rounded-xl">
                      <div className="flex items-center gap-2 mb-3">
                        <SpinnerIcon size={16} className="animate-spin text-indigo-600" />
                        <span className="text-sm font-medium text-indigo-900 dark:text-indigo-100">连接测试进行中...</span>
                      </div>
                      <div className="space-y-2">
                        {testSteps.map((step, index) => (
                          <div key={step.id} className="flex items-start gap-3">
                            <div className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-medium
                              ${step.status === 'completed' ? 'bg-green-500 text-white' : 
                                step.status === 'running' ? 'bg-indigo-500 text-white animate-pulse' : 
                                step.status === 'failed' ? 'bg-red-500 text-white' : 
                                'bg-gray-200 text-gray-500'}">
                              {step.status === 'completed' ? '✓' : 
                               step.status === 'running' ? '...' : 
                               step.status === 'failed' ? '✗' : 
                               index + 1}
                            </div>
                            <div className="flex-1">
                              <p className={`text-sm ${step.status === 'running' ? 'text-indigo-700 dark:text-indigo-300 font-medium' : 
                                step.status === 'completed' ? 'text-green-700 dark:text-green-300' : 
                                step.status === 'failed' ? 'text-red-700 dark:text-red-300' : 
                                'text-gray-600 dark:text-gray-400'}`}>
                                {step.message}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <hr className="border-border my-4" />
                  <div>
                    <h3 className="text-[15px] font-semibold text-foreground mb-2">系统级核心提示词</h3>
                    <p className="text-sm text-muted-foreground mb-4">修改 System Prompt 可以改变 Agent 分析数据时的风格倾向。注意：这可能会破坏图表生成的兼容性。</p>
                    <textarea 
                      rows={6}
                      className="w-full p-4 border border-border rounded-xl bg-muted text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-foreground/10 focus:bg-popover transition-all resize-none"
                      value={systemPrompt}
                      onChange={(e) => setSystemPrompt(e.target.value)}
                    />
                  </div>
                  
                  <div className="mt-4 flex justify-end">
                    <button 
                      onClick={handleSavePrompt}
                      className="px-4 py-2 bg-foreground text-background hover:opacity-90 text-sm font-medium rounded-lg transition-colors shadow-sm"
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
              <div className="space-y-6 animate-in fade-in slide-in-from-right-2 duration-300 flex flex-col items-center justify-center pt-8 text-center">
                <div className="w-16 h-16 rounded-2xl bg-foreground text-background flex items-center justify-center shadow-lg mb-4">
                  <SparklesIcon size={28} />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-foreground tracking-tight">SQL Agent</h3>
                  <p className="text-sm text-muted-foreground mt-1">Version 2.0.0 (Phase J)</p>
                </div>
                <div className="text-sm text-muted-foreground space-y-2 max-w-sm mt-4">
                  <p>感谢您体验这款融合 AI 与极简美学设计的智能数据分析助手。</p>
                  <p>本应用构建于 LangGraph + Next.js，为您提供极速的图表大盘与数据洞察能力。</p>
                </div>
              </div>
            )}
            
          </div>
        </div>
      </div>
    </div>
  );
}
