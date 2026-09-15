/**
 * Reports & Analytics — CSV Export Service
 *
 * Generates server-side CSV export for report data.
 * Respects active filters and RBAC.
 * Preserves Decimal financial values as strings.
 * Includes report period and generation timestamp.
 */

export interface CsvExportOptions {
  reportName: string;
  periodLabel: string;
  startDate: string;
  endDate: string;
  generatedAt: Date;
}

export interface CsvColumn<T> {
  header: string;
  accessor: (row: T) => string | number;
}

/**
 * Converts an array of objects to CSV string with BOM for Excel compatibility.
 */
export function generateCsv<T>(
  columns: CsvColumn<T>[],
  rows: T[],
  options: CsvExportOptions
): string {
  const BOM = '\uFEFF';
  const headerRow = columns.map((c) => `"${c.header}"`).join(',');

  const dataRows = rows.map((row) =>
    columns
      .map((col) => {
        const val = col.accessor(row);
        if (val === null || val === undefined) return '""';
        const strVal = String(val);
        // Escape quotes and wrap in quotes
        return `"${strVal.replace(/"/g, '""')}"`;
      })
      .join(',')
  );

  const metadata = [
    `# Report: ${options.reportName}`,
    `# Period: ${options.periodLabel} (${options.startDate} to ${options.endDate})`,
    `# Generated: ${options.generatedAt.toISOString()}`,
    `# Property: Infinity Resort & Restaurant`,
    '',
  ].join('\n');

  return BOM + metadata + headerRow + '\n' + dataRows.join('\n');
}

/**
 * Returns appropriate file content type for CSV exports.
 */
export function getCsvContentType(): string {
  return 'text/csv; charset=utf-8';
}

/**
 * Returns appropriate filename for report export.
 */
export function getExportFilename(reportName: string, startDate: string, endDate: string): string {
  const sanitized = reportName.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
  return `${sanitized}_${startDate}_to_${endDate}.csv`;
}
