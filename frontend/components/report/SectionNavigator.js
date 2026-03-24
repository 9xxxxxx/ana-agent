'use client';

/**
 * 章节导航组件
 * 固定在侧边，快速跳转到报告各章节
 */

import { useState } from 'react';

export default function SectionNavigator({
  sections = [],
  activeIndex = 0,
  onSelect,
}) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  if (!sections || sections.length === 0) return null;

  return (
    <nav className={`shrink-0 flex flex-col bg-muted/50 border-r border-border transition-all duration-300 ${isCollapsed ? 'w-12' : 'w-64'}`}>
      <div className="flex items-center justify-between p-4 border-b border-border bg-popover">
        {!isCollapsed && <span className="font-bold text-foreground tracking-wide text-sm">目录导航</span>}
        <button
          className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-md transition-colors ml-auto"
          onClick={() => setIsCollapsed(!isCollapsed)}
          title={isCollapsed ? '展开目录' : '收起目录'}
        >
          {isCollapsed ? '→' : '←'}
        </button>
      </div>

      {!isCollapsed && (
        <ul className="flex-1 overflow-y-auto p-3 flex flex-col gap-1">
          {sections.map((section, index) => (
            <li
              key={index}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer text-sm transition-all duration-200 ${
                index === activeIndex
                  ? 'bg-primary/10 text-primary font-semibold shadow-sm ring-1 ring-primary/20'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
              onClick={() => onSelect?.(index)}
            >
              <span className={`flex items-center justify-center shrink-0 w-6 h-6 rounded-md text-xs font-bold ${
                index === activeIndex ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'
              }`}>
                {index + 1}
              </span>
              <span className="truncate">{section.title}</span>
            </li>
          ))}
        </ul>
      )}
    </nav>
  );
}
