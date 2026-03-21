'use client';

/**
 * 工具调用步骤折叠组件
 */

import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  WrenchIcon, CheckCircleIcon, SpinnerIcon,
  ChevronRightIcon, InputIcon, OutputIcon,
} from './Icons';

export default function ToolStep({ step }) {
  const [expanded, setExpanded] = useState(false);

  const isRunning = step.status === 'running';

  const formatContent = (content) => {
    if (!content) return null;

    // 尝试解析为 JSON 并格式化
    try {
      const parsed = JSON.parse(content);
      return (
        <pre className="tool-step-code">
          <code>{JSON.stringify(parsed, null, 2)}</code>
        </pre>
      );
    } catch {
      // 检查是否包含表格格式
      if (content.includes('|') && content.includes('---')) {
        return <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>;
      }

      // 检查是否包含 schema 信息
      if (content.includes('📂') && (content.includes('schema') || content.includes('Schema'))) {
        return formatSchemaContent(content);
      }

      // 检查是否包含表结构信息
      if (content.includes('列信息') && content.includes('主键')) {
        return formatTableStructure(content);
      }

      // 检查是否包含列表格式
      if (content.includes('\n- ') || content.includes('\n  - ')) {
        return <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>;
      }

      // 普通文本，保留换行
      return (
        <div className="tool-step-text">
          {content.split('\n').map((line, i) => (
            <div key={i}>{line || '\u00A0'}</div>
          ))}
        </div>
      );
    }
  };

  const formatSchemaContent = (content) => {
    const lines = content.split('\n').map(line => line.trim()).filter(line => line);
    let formatted = '# 数据库表结构\n\n';
    let currentSchema = null;
    let tables = [];

    for (const line of lines) {
      if (line.includes('📂') && (line.includes('schema') || line.includes('Schema'))) {
        if (currentSchema) {
          formatted += `## ${currentSchema}\n\n`;
          if (tables.length > 0) {
            formatted += '### 表列表\n\n';
            tables.forEach(table => { formatted += `- ${table}\n`; });
            formatted += '\n';
          }
          tables = [];
        }
        const match = line.match(/📂\s*(\w+)/);
        currentSchema = match ? match[1] : 'Unknown';
      } else if (line.includes('表') && !line.includes('共发现') && !line.includes('个表')) {
        const tableMatch = line.match(/(📋|👁️)\s*(\S+)/);
        if (tableMatch) tables.push(tableMatch[2]);
      }
    }

    if (currentSchema) {
      formatted += `## ${currentSchema}\n\n`;
      if (tables.length > 0) {
        formatted += '### 表列表\n\n';
        tables.forEach(table => { formatted += `- ${table}\n`; });
        formatted += '\n';
      }
    }

    return <ReactMarkdown remarkPlugins={[remarkGfm]}>{formatted}</ReactMarkdown>;
  };

  const formatTableStructure = (content) => {
    const lines = content.split('\n');
    let formatted = '# 表结构\n\n';
    let inColumns = false;

    for (const line of lines) {
      if (line.includes('表:')) {
        formatted += `## ${line}\n\n`;
      } else if (line.includes('列信息')) {
        formatted += '### 列信息\n\n';
        formatted += '| 列名 | 类型 | 可空 | 默认值 |\n';
        formatted += '|------|------|------|--------|\n';
        inColumns = true;
      } else if (line.includes('主键:')) {
        inColumns = false;
        formatted += `\n### 主键\n${line.replace('主键:', '')}\n\n`;
      } else if (line.includes('索引:')) {
        formatted += `### 索引\n${line}\n\n`;
      } else if (line.includes('示例数据:')) {
        formatted += `### 示例数据\n${line}\n\n`;
      } else if (inColumns && line.trim()) {
        const match = line.match(/\s*-\s*(\S+)\s*\(([^)]+)\)\s*(NULL|NOT NULL)\s*(DEFAULT=.+)?/);
        if (match) {
          const [, name, type, nullable, defaultVal] = match;
          formatted += `| ${name} | ${type} | ${nullable} | ${defaultVal ? defaultVal.replace('DEFAULT=', '') : ''} |\n`;
        }
      } else if (!inColumns && line.trim()) {
        formatted += `${line}\n`;
      }
    }

    return <ReactMarkdown remarkPlugins={[remarkGfm]}>{formatted}</ReactMarkdown>;
  };

  return (
    <div className={`tool-step ${isRunning ? 'running' : 'done'}`}>
      <div className="tool-step-header" onClick={() => setExpanded(!expanded)}>
        <div className="tool-step-left">
          {isRunning ? (
            <SpinnerIcon size={16} className="tool-status-icon spinning" />
          ) : (
            <CheckCircleIcon size={16} className="tool-status-icon success" />
          )}
          <WrenchIcon size={14} className="tool-name-icon" />
          <span className="tool-step-name">{step.name}</span>
        </div>
        <div className="tool-step-right">
          <span className={`tool-step-status ${step.status}`}>
            {isRunning ? '执行中' : '完成'}
          </span>
          <ChevronRightIcon
            size={14}
            className={`tool-step-chevron ${expanded ? 'expanded' : ''}`}
          />
        </div>
      </div>
      {expanded && (
        <div className="tool-step-body">
          {step.input && (
            <div className="tool-step-section">
              <div className="tool-step-section-title">
                <InputIcon size={13} />
                <span>输入参数</span>
              </div>
              <div className="tool-step-section-content">
                {formatContent(step.input)}
              </div>
            </div>
          )}
          {step.output && (
            <div className="tool-step-section">
              <div className="tool-step-section-title">
                <OutputIcon size={13} />
                <span>返回结果</span>
              </div>
              <div className="tool-step-section-content">
                {formatContent(step.output)}
              </div>
            </div>
          )}
          {isRunning && !step.output && (
            <div className="tool-step-loading">
              <SpinnerIcon size={16} className="spinning" />
              <span>正在执行...</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
