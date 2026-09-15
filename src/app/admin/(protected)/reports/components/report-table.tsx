'use client';

import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export interface Column {
  header: string;
  accessorKey?: string;
  className?: string;
  render?: (value: unknown, row: Record<string, unknown>) => React.ReactNode;
}

interface Pagination {
  page: number;
  pageSize: number;
  totalRecords: number;
  totalPages: number;
}

interface ReportTableProps {
  columns: Column[];
  rows: Record<string, unknown>[];
  pagination?: Pagination;
  onPageChange?: (page: number) => void;
  emptyMessage?: string;
  loading?: boolean;
}

function SkeletonRow({ columns }: { columns: number }) {
  return (
    <tr className="border-b border-resort-sand">
      {Array.from({ length: columns }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-4 bg-resort-sand/60 rounded animate-pulse" />
        </td>
      ))}
    </tr>
  );
}

function getCellValue(row: Record<string, unknown>, accessorKey?: string): unknown {
  if (!accessorKey) return '';
  const keys = accessorKey.split('.');
  let val: unknown = row;
  for (const key of keys) {
    if (val && typeof val === 'object') val = (val as Record<string, unknown>)[key];
    else return '';
  }
  return val ?? '';
}

export function ReportTable({
  columns,
  rows,
  pagination,
  onPageChange,
  emptyMessage = 'No records found.',
  loading = false,
}: ReportTableProps) {
  const totalPages = pagination?.totalPages ?? 0;
  const currentPage = pagination?.page ?? 1;

  const getVisiblePages = () => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);

    const pages: (number | '...')[] = [];
    pages.push(1);

    if (currentPage > 3) pages.push('...');

    const start = Math.max(2, currentPage - 1);
    const end = Math.min(totalPages - 1, currentPage + 1);
    for (let i = start; i <= end; i++) pages.push(i);

    if (currentPage < totalPages - 2) pages.push('...');

    pages.push(totalPages);
    return pages;
  };

  return (
    <div className="border border-resort-sand rounded-lg bg-white shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-resort-sand bg-resort-ivory/50">
              {columns.map((col, i) => (
                <th
                  key={i}
                  className={cn(
                    'px-4 py-3 text-left font-semibold uppercase tracking-wider text-resort-muted',
                    col.className
                  )}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <SkeletonRow key={i} columns={columns.length} />
              ))
            ) : rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-12 text-center text-resort-muted"
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              rows.map((row, rowIdx) => (
                <tr
                  key={rowIdx}
                  className="border-b border-resort-sand last:border-0 hover:bg-resort-ivory/30 transition-colors"
                >
                  {columns.map((col, colIdx) => {
                    const value = getCellValue(row, col.accessorKey);
                    return (
                      <td
                        key={colIdx}
                        className={cn('px-4 py-3 text-resort-charcoal-text', col.className)}
                      >
                        {col.render ? col.render(value, row) : String(value ?? '')}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {pagination && pagination.totalRecords > 0 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-resort-sand bg-resort-ivory/30">
          <span className="text-[11px] text-resort-muted">
            Showing {(pagination.page - 1) * pagination.pageSize + 1}–
            {Math.min(pagination.page * pagination.pageSize, pagination.totalRecords)} of{' '}
            {pagination.totalRecords.toLocaleString()} records
          </span>

          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onPageChange?.(1)}
              disabled={currentPage === 1}
              className="h-7 w-7 p-0"
            >
              <ChevronsLeft className="w-3.5 h-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onPageChange?.(currentPage - 1)}
              disabled={currentPage === 1}
              className="h-7 w-7 p-0"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </Button>

            {getVisiblePages().map((page, i) =>
              page === '...' ? (
                <span key={`dots-${i}`} className="px-1 text-xs text-resort-muted">
                  ...
                </span>
              ) : (
                <Button
                  key={page}
                  variant={page === currentPage ? 'primary' : 'ghost'}
                  size="sm"
                  onClick={() => onPageChange?.(page as number)}
                  className={cn(
                    'h-7 w-7 p-0 text-xs',
                    page === currentPage && 'bg-resort-forest text-white'
                  )}
                >
                  {page}
                </Button>
              )
            )}

            <Button
              variant="ghost"
              size="sm"
              onClick={() => onPageChange?.(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="h-7 w-7 p-0"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onPageChange?.(totalPages)}
              disabled={currentPage === totalPages}
              className="h-7 w-7 p-0"
            >
              <ChevronsRight className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
