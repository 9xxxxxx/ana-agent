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
    <div className="rounded-[24px] border border-stone-200 bg-white shadow-sm">
      {(title || searchable || exportable) && (
        <div className="flex flex-col gap-3 border-b border-stone-200 px-5 py-4 md:flex-row md:items-center md:justify-between">
          {title && <h4 className="text-lg font-semibold tracking-tight text-stone-950">{title}</h4>}

          <div className="flex items-center gap-3">
            {searchable && (
              <div>
                <input
                  type="text"
                  placeholder="搜索数据..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="h-10 min-w-[220px] rounded-full border border-stone-200 bg-stone-50 px-4 text-sm text-stone-700 outline-none"
                />
              </div>
            )}
            {exportable && (
              <button className="rounded-full border border-stone-200 bg-stone-50 px-4 py-2 text-sm font-medium text-stone-700 hover:border-stone-300 hover:bg-stone-100 transition" onClick={handleExport} title="导出数据">
                导出 CSV
              </button>
            )}
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-stone-50/70">
            <tr className="border-b border-stone-200">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`px-4 py-3 text-left font-semibold text-stone-600 ${sortable ? 'cursor-pointer select-none' : ''}`}
                  onClick={() => handleSort(col.key)}
                  style={{ width: col.width }}
                >
                  <div className="flex items-center gap-2">
                    <span>{col.label || col.key}</span>
                    {sortable && <span className="text-xs text-stone-400">{getSortIcon(col.key)}</span>}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paginatedData.length > 0 ? (
              paginatedData.map((row, rowIndex) => (
                <tr key={rowIndex} className="border-b border-stone-100 last:border-b-0">
                  {columns.map((col) => (
                    <td key={col.key} className="px-4 py-3 text-stone-700">
                      {col.render ? col.render(row[col.key], row) : row[col.key]}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={columns.length} className="px-4 py-8 text-center text-sm text-stone-500">
                  暂无数据
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-stone-200 px-5 py-4">
          <button
            className="rounded-full border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-700 disabled:opacity-40"
            disabled={currentPage === 1}
            onClick={() => setCurrentPage((p) => p - 1)}
          >
            ←
          </button>

          <span className="text-sm text-stone-600">
            第 {currentPage} / {totalPages} 页
            <span className="ml-1 text-stone-400">（共 {sortedData.length} 条）</span>
          </span>

          <button
            className="rounded-full border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-700 disabled:opacity-40"
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
