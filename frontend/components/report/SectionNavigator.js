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
    <nav className={`section-navigator ${isCollapsed ? 'collapsed' : ''}`}>
      <div className="navigator-header">
        <span className="navigator-title">目录</span>
        <button
          className="navigator-toggle"
          onClick={() => setIsCollapsed(!isCollapsed)}
          title={isCollapsed ? '展开' : '收起'}
        >
          {isCollapsed ? '→' : '←'}
        </button>
      </div>

      {!isCollapsed && (
        <ul className="navigator-list">
          {sections.map((section, index) => (
            <li
              key={index}
              className={`navigator-item ${index === activeIndex ? 'active' : ''}`}
              onClick={() => onSelect?.(index)}
            >
              <span className="navigator-number">{index + 1}</span>
              <span className="navigator-label">{section.title}</span>
            </li>
          ))}
        </ul>
      )}
    </nav>
  );
}
