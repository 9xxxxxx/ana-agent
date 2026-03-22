'use client';

import { useState, useEffect } from 'react';
import { CloseIcon, SettingsIcon, UserIcon, InfoIcon, SparklesIcon } from './Icons';

export default function SettingsModal({ isOpen, onClose }) {
  const [activeTab, setActiveTab] = useState('general');
  const [theme, setTheme] = useState('light');
  const [systemPrompt, setSystemPrompt] = useState('你是 SQL Agent，一个智能数据分析助手...');

  // 弹窗打开时加载本地存储
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      const savedPrompt = localStorage.getItem('sqlAgentSystemPrompt');
      if (savedPrompt) {
        setSystemPrompt(savedPrompt);
      }
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  const handleSavePrompt = () => {
    localStorage.setItem('sqlAgentSystemPrompt', systemPrompt);
    alert('AI 偏好提示词已保存生效！');
  };

  if (!isOpen) return null;

  const tabs = [
    { id: 'general', label: '通用设置', icon: <SettingsIcon size={16} /> },
    { id: 'agent', label: 'AI 偏好', icon: <SparklesIcon size={16} /> },
    { id: 'account', label: '账号信息', icon: <UserIcon size={16} /> },
    { id: 'about', label: '关于应用', icon: <InfoIcon size={16} /> }
  ];

  return (
    <div className="fixed inset-0 z-[9999] bg-gray-900/40 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div 
        className="fixed inset-0"
        onClick={onClose}
      />
      <div className="relative w-full max-w-3xl bg-white rounded-2xl shadow-2xl border border-gray-100 flex flex-col md:flex-row h-[80vh] max-h-[600px] overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-4 duration-300">
        
        {/* 左侧 Tab 栏 */}
        <div className="w-full md:w-56 bg-gray-50 border-r border-gray-100 flex flex-col pt-4">
          <div className="px-5 pb-4 md:border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">设置</h2>
            <button className="md:hidden p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-200 rounded-lg transition" onClick={onClose}>
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
                    ? 'bg-white text-blue-600 shadow-sm border border-gray-200/60' 
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 border border-transparent'
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* 右侧内容区 */}
        <div className="flex-1 bg-white relative flex flex-col">
          <button 
            className="hidden md:flex absolute right-4 top-4 p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors z-10" 
            onClick={onClose}
          >
            <CloseIcon size={18} />
          </button>
          
          <div className="flex-1 overflow-y-auto p-6 md:p-8">
            {/* 通用设置 Tab */}
            {activeTab === 'general' && (
              <div className="space-y-8 animate-in fade-in slide-in-from-right-2 duration-300">
                <div>
                  <h3 className="text-[15px] font-semibold text-gray-900 mb-4">界面与外观</h3>
                  <div className="flex items-center justify-between py-3 border-b border-gray-100">
                    <div>
                      <div className="font-medium text-gray-800 text-sm">主题模式</div>
                      <div className="text-xs text-gray-500 mt-1">切换应用的色彩风格 (当前默认白雅 UI)</div>
                    </div>
                    <select 
                      className="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-200"
                      value={theme}
                      onChange={(e) => setTheme(e.target.value)}
                    >
                      <option value="light">浅色 (Light)</option>
                      <option value="dark">深色 (Dark) - 即将到来</option>
                      <option value="system">跟随系统</option>
                    </select>
                  </div>
                  <div className="flex items-center justify-between py-3 border-b border-gray-100">
                    <div>
                      <div className="font-medium text-gray-800 text-sm">紧凑模式</div>
                      <div className="text-xs text-gray-500 mt-1">在聊天列表中显示更多密集的信息</div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" className="sr-only peer" />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                  </div>
                </div>
              </div>
            )}

            {/* AI 偏好 Tab */}
            {activeTab === 'agent' && (
              <div className="space-y-6 animate-in fade-in slide-in-from-right-2 duration-300">
                <div>
                  <h3 className="text-[15px] font-semibold text-gray-900 mb-4">代理设定与核心提示词</h3>
                  <p className="text-sm text-gray-500 mb-4">修改 System Prompt 可以改变 Agent 分析数据时的风格倾向。注意：这可能会破坏图表生成的兼容性。</p>
                  <textarea 
                    rows={8}
                    className="w-full p-4 border border-gray-200 rounded-xl bg-gray-50 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 focus:bg-white transition-all resize-none"
                    value={systemPrompt}
                    onChange={(e) => setSystemPrompt(e.target.value)}
                  />
                  <div className="mt-4 flex justify-end">
                    <button 
                      onClick={handleSavePrompt}
                      className="px-4 py-2 bg-gray-900 hover:bg-black text-white text-sm font-medium rounded-lg transition-colors"
                    >
                      保存更改
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* 账号信息 Tab */}
            {activeTab === 'account' && (
              <div className="space-y-6 animate-in fade-in slide-in-from-right-2 duration-300 flex flex-col items-center justify-center pt-10 text-center">
                <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-blue-100 to-indigo-100 text-blue-600 flex items-center justify-center mb-4">
                  <UserIcon size={32} />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">本地离线用户</h3>
                  <p className="text-sm text-gray-500 mt-2 max-w-[280px] mx-auto">
                    您当前正在以本地模式运行 SQL Agent。所有对话与连接记录保存在本地缓存和 SQLite 文件中。
                  </p>
                </div>
                <button className="mt-6 px-6 py-2.5 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 text-sm font-medium rounded-xl shadow-sm transition-all">
                  云端同步 (开发中)
                </button>
              </div>
            )}

            {/* 关于 Tab */}
            {activeTab === 'about' && (
              <div className="space-y-6 animate-in fade-in slide-in-from-right-2 duration-300 flex flex-col items-center justify-center pt-8 text-center">
                <div className="w-16 h-16 rounded-2xl bg-black text-white flex items-center justify-center shadow-lg mb-4">
                  <SparklesIcon size={28} />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-gray-900 tracking-tight">SQL Agent</h3>
                  <p className="text-sm text-gray-500 mt-1">Version 2.0.0 (Phase J)</p>
                </div>
                <div className="text-sm text-gray-600 space-y-2 max-w-sm mt-4">
                  <p>感谢您体验这款融合 ChatGPT 与极简纯白美学设计的智能数据分析助手。</p>
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
