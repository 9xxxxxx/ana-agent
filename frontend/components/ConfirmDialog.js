'use client';

/**
 * 自定义确认对话框组件 (Tailwind 重构版)
 */
import { useEffect } from 'react';
import { AlertIcon, TrashIcon, InfoIcon, CloseIcon } from './Icons';

export default function ConfirmDialog({ isOpen, title, message, onConfirm, onCancel, type = 'warning' }) {
  // 禁止背景滚动
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'auto';
    }
    return () => {
      document.body.style.overflow = 'auto';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const typeConfig = {
    warning: {
      icon: <AlertIcon size={22} className="text-amber-600" />,
      iconBg: 'bg-amber-100',
      confirmBtnClass: 'bg-amber-500 hover:bg-amber-600 text-white',
    },
    danger: {
      icon: <TrashIcon size={22} className="text-rose-600" />,
      iconBg: 'bg-rose-100',
      confirmBtnClass: 'bg-rose-600 hover:bg-rose-700 text-white',
    },
    info: {
      icon: <InfoIcon size={22} className="text-blue-600" />,
      iconBg: 'bg-blue-100',
      confirmBtnClass: 'bg-blue-600 hover:bg-blue-700 text-white',
    }
  };

  const style = typeConfig[type] || typeConfig.warning;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-sm animate-in fade-in duration-200">
      {/* 弹窗实体 */}
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-xl border border-gray-100 animate-in zoom-in-95 slide-in-from-bottom-4 duration-300 overflow-hidden">
        {/* 关闭按钮 */}
        <button 
          onClick={onCancel}
          className="absolute right-4 top-4 p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <CloseIcon size={18} />
        </button>

        <div className="p-6">
          <div className="flex sm:items-start gap-4 flex-col sm:flex-row items-center text-center sm:text-left">
            {/* 图标容器区 */}
            <div className={`shrink-0 flex items-center justify-center w-12 h-12 rounded-full ${style.iconBg}`}>
              {style.icon}
            </div>

            {/* 文本区 */}
            <div className="flex-1 mt-1 sm:mt-0">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                {title}
              </h3>
              <p className="text-[15px] leading-relaxed text-gray-600">
                {message}
              </p>
            </div>
          </div>
        </div>

        {/* 底部按钮区 */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex flex-col-reverse sm:flex-row sm:justify-end gap-3 rounded-b-2xl">
          <button
            className="w-full sm:w-auto px-5 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-200 focus:ring-offset-1 transition-all"
            onClick={onCancel}
          >
            取消
          </button>
          <button
            className={`w-full sm:w-auto px-5 py-2.5 text-sm font-medium rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-1 transition-all ${style.confirmBtnClass}`}
            onClick={onConfirm}
          >
            确认执行
          </button>
        </div>
      </div>
    </div>
  );
}
