'use client';

/**
 * 自定义确认对话框组件 (Tailwind 重构版)
 */
import { useEffect } from 'react';
import { AlertIcon, TrashIcon, InfoIcon, CloseIcon } from './Icons';
import { cn, ui } from './ui';

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
      icon: <AlertIcon size={22} className="text-amber-500" />,
      iconBg: 'bg-amber-500/10',
      confirmBtnClass: 'border-amber-500 bg-amber-500 hover:bg-amber-600 text-white',
    },
    danger: {
      icon: <TrashIcon size={22} className="text-rose-500" />,
      iconBg: 'bg-rose-500/10',
      confirmBtnClass: 'border-rose-600 bg-rose-600 hover:bg-rose-700 text-white',
    },
    info: {
      icon: <InfoIcon size={22} className="text-blue-500" />,
      iconBg: 'bg-blue-500/10',
      confirmBtnClass: 'border-blue-600 bg-blue-600 hover:bg-blue-700 text-white',
    }
  };

  const style = typeConfig[type] || typeConfig.warning;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      {/* 弹窗实体 */}
      <div className="relative w-full max-w-md overflow-hidden rounded-[28px] border border-zinc-200 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.2)] animate-in zoom-in-95 slide-in-from-bottom-4 duration-300">
        {/* 关闭按钮 */}
        <button 
          onClick={onCancel}
          className={cn(ui.iconButton, 'absolute right-4 top-4 rounded-lg p-1.5')}
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
              <h3 className="text-lg font-semibold text-foreground mb-2">
                {title}
              </h3>
              <p className="text-[15px] leading-relaxed text-muted-foreground">
                {message}
              </p>
            </div>
          </div>
        </div>

        {/* 底部按钮区 */}
        <div className="flex flex-col-reverse gap-3 border-t border-zinc-200 bg-zinc-50 px-6 py-4 sm:flex-row sm:justify-end">
          <button
            className={cn(ui.buttonSecondary, 'w-full rounded-xl px-5 py-2.5 sm:w-auto')}
            onClick={onCancel}
          >
            取消
          </button>
          <button
            className={`w-full sm:w-auto px-5 py-2.5 text-sm font-medium rounded-xl shadow-sm border transition-all ${style.confirmBtnClass}`}
            onClick={onConfirm}
          >
            确认执行
          </button>
        </div>
      </div>
    </div>
  );
}
