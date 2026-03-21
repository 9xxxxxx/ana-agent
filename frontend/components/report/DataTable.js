'use client';

/**
 * 数据表格组件
 * 支持排序、搜索、分页和导出
 */

import { useState, useMemo } from 'react';

export default function DataTable({
  data = [],
  columns = [],
  title,
  pageSize = 10,
  searchable = true,
  sortable = true,
  exportable = true,
  onExport,
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortColumn, setSortColumn] = useState(null);
  const [sortDirection, setSortDirection] = useState('asc');
  const [currentPage, setCurrentPage] = useState(1);

  // 过滤数据
  const filteredData = useMemo(() => {
    if (!searchTerm) return data;
    
    return data.filter((row) =>
      Object.values(row).some((value) =>
        String(value).toLowerCase().includes(searchTerm.toLowerCase())
      )
    );
  }, [data, searchTerm]);

  // 排序数据
  const sortedData = useMemo(() => {
    if (!sortColumn) return filteredData;

    return [...filteredData].sort((a, b) => {
      const aVal = a[sortColumn];
      const bVal = b[sortColumn];
      
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
      }
      
      const aStr = String(aVal).toLowerCase();
      const bStr = String(bVal).toLowerCase();
      
      if (sortDirection === 'asc') {
        return aStr.localeCompare(bStr);
      }
      return bStr.localeCompare(aStr);
    });
  }, [filteredData, sortColumn, sortDirection]);

  // 分页数据
  const totalPages = Math.ceil(sortedData.length / pageSize);
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedData.slice(start, start + pageSize);
  }, [sortedData, currentPage, pageSize]);

  // 处理排序
  const handleSort = (columnKey) => {
    if (!sortable) return;
    
    if (sortColumn === columnKey) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(columnKey);
      setSortDirection('asc');
    }
  };

  // 获取排序图标
  const getSortIcon = (columnKey) => {
    if (sortColumn !== columnKey) return '⇅';
    return sortDirection === 'asc' ? '↑' : '↓';
  };

  // 导出数据
  const handleExport = () => {
    if (onExport) {
      onExport(sortedData);
      return;
    }

    // 默认导出 CSV
    const headers = columns.map((col) => col.label || col.key).join(',');
    const rows = sortedData.map((row) =>
      columns.map((col) => `"${String(row[col.key] || '').replace(/"/g, '""')}"`).join(',')
    );
    const csv = [headers, ...rows].join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${title || 'data'}.csv`;
    link.click();
  };

  return (
    <div className="data-table-wrapper">
      {(title || searchable || exportable) && (
        <div className="data-table-header">
          {title && <h4 className="data-table-title">{title}</h4>}
          
          <div className="data-table-actions">
            {searchable && (
              <div className="table-search">
                <input
                  type="text"
                  placeholder="搜索数据..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="table-search-input"
                />
              </div>
            )}
            {exportable && (
              <button className="btn-icon" onClick={handleExport} title="导出数据">
                ⬇
              </button>
            )}
          </div>
        </div>
      )}

      <div className="data-table-container">
        <table className="data-table">
          <thead>
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={sortable ? 'sortable' : ''}
                  onClick={() => handleSort(col.key)}
                  style={{ width: col.width }}
                >
                  <div className="th-content">
                    <span>{col.label || col.key}</span>
                    {sortable && <span className="sort-icon">{getSortIcon(col.key)}</span>}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paginatedData.length > 0 ? (
              paginatedData.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {columns.map((col) => (
                    <td key={col.key}>
                      {col.render ? col.render(row[col.key], row) : row[col.key]}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={columns.length} className="empty-cell">
                  暂无数据
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="data-table-pagination">
          <button
            className="pagination-btn"
            disabled={currentPage === 1}
            onClick={() => setCurrentPage((p) => p - 1)}
          >
            ←
          </button>
          
          <span className="pagination-info">
            第 {currentPage} / {totalPages} 页
            <span className="pagination-total">（共 {sortedData.length} 条）</span>
          </span>
          
          <button
            className="pagination-btn"
            disabled={currentPage === totalPages}
            onClick={() => setCurrentPage((p) => p + 1)}
          >
            →
          </button>
        </div>
      )}
    </div>
  );
}
