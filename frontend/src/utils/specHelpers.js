/**
 * Helpers for working with SpecView specs returned by the API (or built from dynamic rows).
 *
 * Spec kinds
 *  - chart:     { kind:'chart', type:'bar'|'line'|'doughnut', indexAxis?, stacked?, labels, datasets, format?, unit?, colors?, table?, extra? }
 *  - kpis:      { kind:'kpis', items:[{label,value,hint?,delta?,tone?}] }
 *  - table:     { kind:'table', columns, rows }
 *  - gauge:     { kind:'gauge', value, max, label }
 *  - bignumber: { kind:'bignumber', value, label, hint?, table? }
 */
import { fmtValue, human } from './format'

export const COLORS = {
  green: '#1B7A4E',
  leaf: '#52B788',
  orange: '#E67E22',
  teal: '#2F9E8F',
  amber: '#F2B84B',
  blue: '#5B8DB8',
  violet: '#8E6BBF',
  red: '#C8553D',
  slate: '#94A3B8',
  lime: '#9BC53D',
}

export const PALETTE = [COLORS.green, COLORS.orange, COLORS.teal, COLORS.amber, COLORS.blue, COLORS.violet, COLORS.leaf, COLORS.red]

/** Footer text for a card, e.g. "5 regions". */
export function specCountLabel(spec) {
  if (!spec) return ''
  switch (spec.kind) {
    case 'chart':
      return `${spec.labels?.length || 0} ${spec.unit || 'data points'}`
    case 'kpis':
      return `${spec.items?.length || 0} metrics`
    case 'table':
      return `${spec.rows?.length || 0} rows`
    case 'gauge':
      return '1 score'
    case 'bignumber':
      return '1 metric'
    default:
      return ''
  }
}

/** Auto-generate a table from a chart spec (or use its explicit table). */
export function specToTable(spec) {
  if (!spec) return null
  if (spec.kind === 'table') return { columns: spec.columns || [], rows: spec.rows || [] }
  if (spec.table) return spec.table
  if (spec.kind !== 'chart' || !spec.datasets?.length) return null
  const fmt = spec.format === 'percent' || spec.format === 'days' || spec.format === 'area' ? spec.format : 'number'
  return {
    columns: [{ key: '_label', label: 'Item' }, ...spec.datasets.map((d, i) => ({ key: `d${i}`, label: d.label, format: fmt }))],
    rows: (spec.labels || []).map((label, idx) => {
      const row = { _label: label }
      spec.datasets.forEach((d, i) => (row[`d${i}`] = d.data[idx]))
      return row
    }),
  }
}

/** Quick headline stats for chart specs, shown above the large chart. */
export function specInsights(spec) {
  if (!spec || spec.kind !== 'chart' || !spec.datasets?.length) return []
  const first = spec.datasets[0]
  const data = (first.data || []).map(Number).filter((n) => Number.isFinite(n))
  if (!data.length) return []
  const fmt = spec.format || 'number'
  const sum = data.reduce((s, v) => s + v, 0)
  const avgMode = fmt === 'percent' || fmt === 'days'
  const topIdx = data.indexOf(Math.max(...data))
  return [
    avgMode
      ? { label: `Average · ${first.label}`, value: fmtValue(sum / data.length, fmt) }
      : { label: `Total · ${first.label}`, value: fmtValue(sum, fmt) },
    { label: 'Highest', value: String(spec.labels?.[topIdx] ?? '—'), hint: fmtValue(data[topIdx], fmt) },
    { label: spec.unit ? human(spec.unit) : 'Data points', value: String(spec.labels?.length || 0) },
  ]
}
