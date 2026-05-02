import React, { useMemo, useState } from 'react';

function getValue(row, column) {
  const value = column.getValue ? column.getValue(row) : row[column.key];
  if (value == null) return '';
  return value;
}

function compareValues(a, b) {
  const aNumber = Number(a);
  const bNumber = Number(b);
  const bothNumeric = !Number.isNaN(aNumber) && !Number.isNaN(bNumber) && String(a).trim() !== '' && String(b).trim() !== '';

  if (bothNumeric) return aNumber - bNumber;

  const aDate = Date.parse(a);
  const bDate = Date.parse(b);
  const bothDates = !Number.isNaN(aDate) && !Number.isNaN(bDate);
  if (bothDates) return aDate - bDate;

  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

export default function SortableTable({ columns, rows, emptyMessage = 'No data.', initialSortKey, initialDirection = 'desc' }) {
  const [sort, setSort] = useState({ key: initialSortKey || columns[0]?.key, direction: initialDirection });

  const sortedRows = useMemo(() => {
    const column = columns.find((c) => c.key === sort.key) || columns[0];
    if (!column) return rows;

    return [...rows].sort((left, right) => {
      const result = compareValues(getValue(left, column), getValue(right, column));
      return sort.direction === 'asc' ? result : -result;
    });
  }, [rows, columns, sort]);

  const changeSort = (column) => {
    if (!column.sortable) return;

    setSort((current) => {
      if (current.key === column.key) {
        return { key: column.key, direction: current.direction === 'asc' ? 'desc' : 'asc' };
      }
      return { key: column.key, direction: column.defaultDirection || 'asc' };
    });
  };

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key}>
                <button
                  type="button"
                  className={column.sortable ? 'sort-header sortable' : 'sort-header'}
                  onClick={() => changeSort(column)}
                  disabled={!column.sortable}
                >
                  {column.label}
                  {sort.key === column.key && <span>{sort.direction === 'asc' ? ' ▲' : ' ▼'}</span>}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedRows.length === 0 && <tr><td colSpan={columns.length} className="empty-cell">{emptyMessage}</td></tr>}
          {sortedRows.map((row, rowIndex) => (
            <tr key={row.id || `${rowIndex}-${JSON.stringify(row).slice(0, 80)}`}>
              {columns.map((column) => (
                <td key={column.key}>{column.render ? column.render(row) : getValue(row, column)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
