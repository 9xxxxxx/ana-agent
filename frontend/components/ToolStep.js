'use client';

/**
 * 工具调用步骤折叠组件
 */

import { useState } from 'react';

export default function ToolStep({ step }) {
  const [expanded, setExpanded] = useState(false);

  const statusLabel = step.status === 'running' ? '执行中...' : '✓ 完成';

  return (
    <div className="tool-step">
      <div className="tool-step-header" onClick={() => setExpanded(!expanded)}>
        <span className="tool-step-icon">🔧</span>
        <span className="tool-step-name">{step.name}</span>
        <span className={`tool-step-status ${step.status}`}>{statusLabel}</span>
        <span className={`tool-step-chevron ${expanded ? 'expanded' : ''}`}>▶</span>
      </div>
      {expanded && (
        <div className="tool-step-body">
          {step.input && (
            <>
              <div style={{ color: 'var(--text-tertiary)', marginBottom: '4px', fontWeight: 500 }}>📥 输入参数:</div>
              <div style={{ marginBottom: '8px' }}>{step.input}</div>
            </>
          )}
          {step.output && (
            <>
              <div style={{ color: 'var(--text-tertiary)', marginBottom: '4px', fontWeight: 500 }}>📤 返回结果:</div>
              <div>{step.output}</div>
            </>
          )}
          {step.status === 'running' && !step.output && (
            <div style={{ color: 'var(--warning)' }}>⏳ 正在执行...</div>
          )}
        </div>
      )}
    </div>
  );
}
