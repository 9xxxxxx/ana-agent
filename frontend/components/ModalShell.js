'use client';

import { CloseIcon } from './Icons';
import { cn, ui } from './ui';

export default function ModalShell({
  isOpen,
  onClose,
  children,
  title,
  description,
  headerRight,
  maxWidth = 'max-w-4xl',
  heightClass = '',
  overlayClass = '',
  bodyClass = '',
  showClose = true,
  centered = true,
}) {
  if (!isOpen) return null;

  return (
    <div className={cn('fixed inset-0 z-[9999] bg-black/45 p-4 backdrop-blur-sm animate-in fade-in duration-200', centered ? 'flex items-center justify-center' : 'flex items-start justify-center pt-[10vh]', overlayClass)}>
      <div className="fixed inset-0" onClick={onClose} />
      <div className={cn('relative flex w-full flex-col overflow-hidden rounded-[28px] border border-zinc-200 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.2)] animate-in zoom-in-95 duration-300', maxWidth, heightClass)}>
        {(title || description || headerRight || showClose) && (
          <div className="flex items-start justify-between border-b border-zinc-200 bg-white px-6 py-5">
            <div className="min-w-0">
              {title && <h2 className="text-lg font-semibold text-zinc-950">{title}</h2>}
              {description && <p className="mt-1 text-sm leading-6 text-zinc-500">{description}</p>}
            </div>
            <div className="ml-4 flex items-center gap-2">
              {headerRight}
              {showClose && (
                <button className={cn(ui.iconButton, 'rounded-lg')} onClick={onClose}>
                  <CloseIcon size={18} />
                </button>
              )}
            </div>
          </div>
        )}
        <div className={cn('min-h-0 flex-1 overflow-y-auto', bodyClass)}>{children}</div>
      </div>
    </div>
  );
}
