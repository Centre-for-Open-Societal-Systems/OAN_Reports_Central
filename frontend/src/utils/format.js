const nf = new Intl.NumberFormat('en-US')
const nf1 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 })
const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 })

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function human(s) {
  if (s == null) return ''
  return String(s)
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

/** '2026-06' -> 'Jun 2026' */
export function monthLabel(period) {
  const [y, m] = String(period).split('-')
  return `${MONTHS[Number(m) - 1] || m} ${y}`
}

export function fmtNumber(v) {
  if (v == null || Number.isNaN(Number(v))) return '—'
  return nf.format(Math.round(Number(v) * 100) / 100)
}

export function fmtCompact(v) {
  if (v == null || Number.isNaN(Number(v))) return '—'
  return compact.format(Number(v))
}

export function fmtValue(v, format = 'number') {
  if (v == null || v === '') return '—'
  switch (format) {
    case 'compact':
      return fmtCompact(v)
    case 'currency': {
      const n = Number(v)
      return `ETB ${Math.abs(n) >= 1e6 ? compact.format(n) : nf.format(n)}`
    }
    case 'percent':
      return `${nf1.format(Number(v))}%`
    case 'days':
      return `${nf1.format(Number(v))} d`
    case 'area':
      return `${nf.format(Math.round(Number(v)))} ha`
    case 'date':
      return new Date(v).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    case 'datetime':
      return new Date(v).toLocaleString('en-GB', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })
    case 'text':
      return String(v)
    default:
      return fmtNumber(v)
  }
}

/** Short axis-tick formatter. */
export function fmtTick(v, format = 'number') {
  switch (format) {
    case 'percent':
      return `${v}%`
    case 'days':
      return `${v}d`
    case 'currency':
      return compact.format(v)
    default:
      return Math.abs(v) >= 10000 ? compact.format(v) : nf.format(v)
  }
}

export function pct(part, total, digits = 1) {
  if (!total) return '0%'
  return `${((part / total) * 100).toFixed(digits).replace(/\.0$/, '')}%`
}

export function uid(prefix = 'id') {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-3)}`
}
