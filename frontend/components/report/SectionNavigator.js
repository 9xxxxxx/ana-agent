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
    <nav className={`shrink-0 flex flex-col bg-gray-50 border-r border-gray-200 transition-all duration-300 ${isCollapsed ? 'w-12' : 'w-64'}`}>
      <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-white">
        {!isCollapsed && <span className="font-bold text-gray-800 tracking-wide text-sm">目录导航</span>}
        <button
          className="p-1.5 text-gray-400 hover:text-brand-600 hover:bg-brand-50 rounded-md transition-colors ml-auto"
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
                  ? 'bg-brand-50 text-brand-700 font-semibold shadow-sm ring-1 ring-brand-200/50'
                  : 'text-gray-600 hover:bg-gray-200/50 hover:text-gray-900'
              }`}
              onClick={() => onSelect?.(index)}
            >
              <span className={`flex items-center justify-center shrink-0 w-6 h-6 rounded-md text-xs font-bold ${
                index === activeIndex ? 'bg-brand-100/50 text-brand-600' : 'bg-gray-200 text-gray-500'
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
