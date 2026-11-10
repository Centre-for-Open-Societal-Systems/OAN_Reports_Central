import { human, fmtValue, uid } from './format'
import { resolveUrl } from '../api/client'

/** Safe JSON.parse — returns { ok, data, error }. */
export function parseJsonText(text) {
  if (!text || !String(text).trim()) return { ok: false, error: 'Paste JSON to continue.', data: null }
  try {
    return { ok: true, data: JSON.parse(text), error: null }
  } catch (e) {
    return { ok: false, data: null, error: e.message || 'Invalid JSON' }
  }
}

function isPlainObject(v) {
  return v != null && typeof v === 'object' && !Array.isArray(v)
}

function pathJoin(base, key) {
  if (!base) return String(key)
  return /^\d+$/.test(String(key)) ? `${base}[${key}]` : `${base}.${key}`
}

/** Resolve a dotted/bracket path against a value. Empty path returns root. */
export function getByPath(root, path) {
  if (!path) return root
  const parts = String(path)
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .filter(Boolean)
  let cur = root
  for (const p of parts) {
    if (cur == null) return undefined
    cur = cur[p]
  }
  return cur
}

/**
 * Find array-of-object candidates in a JSON tree.
 * Returns [{ path, length, fields }].
 */
export function findArrayPaths(root, { maxDepth = 4 } = {}) {
  const out = []
  function walk(node, path, depth) {
    if (depth > maxDepth || node == null) return
    if (Array.isArray(node)) {
      const objs = node.filter(isPlainObject)
      if (objs.length) {
        const fields = discoverFields(objs[0])
        out.push({ path: path || '$', length: node.length, fields, sample: objs[0] })
      }
      return
    }
    if (isPlainObject(node)) {
      for (const [k, v] of Object.entries(node)) walk(v, pathJoin(path === '$' ? '' : path, k), depth + 1)
    }
  }
  if (Array.isArray(root)) walk(root, '$', 0)
  else walk(root, '', 0)
  // Prefer shorter paths / larger arrays
  return out.sort((a, b) => a.path.length - b.path.length || b.length - a.length)
}

/** Leaf field keys on an object (one level + nested one level as dotted). */
export function discoverFields(obj) {
  if (!isPlainObject(obj)) return []
  const fields = []
  for (const [k, v] of Object.entries(obj)) {
    if (v == null || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
      fields.push({ key: k, type: v == null ? 'null' : typeof v, sample: v })
    } else if (isPlainObject(v)) {
      for (const [sk, sv] of Object.entries(v)) {
        if (sv == null || typeof sv === 'string' || typeof sv === 'number' || typeof sv === 'boolean') {
          fields.push({ key: `${k}.${sk}`, type: sv == null ? 'null' : typeof sv, sample: sv })
        }
      }
    }
  }
  return fields
}

export function numericFields(fields) {
  return fields.filter((f) => f.type === 'number' || (typeof f.sample === 'string' && f.sample !== '' && !Number.isNaN(Number(f.sample))))
}

export function labelFields(fields) {
  return fields.filter((f) => f.type === 'string' || f.type === 'number')
}

function readField(row, key) {
  if (!key) return undefined
  if (key.includes('.')) return getByPath(row, key)
  return row?.[key]
}

function asNumber(v) {
  if (v == null || v === '') return 0
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/** Normalize source JSON into an array of row objects using dataPath. */
export function extractRows(root, dataPath) {
  if (root == null) return []
  if (!dataPath || dataPath === '$') {
    if (Array.isArray(root)) return root.filter(isPlainObject)
    if (isPlainObject(root)) {
      // Prefer nested `.data` array when present (common API envelope)
      if (Array.isArray(root.data) && root.data.every(isPlainObject)) return root.data
      return [root]
    }
    return []
  }
  const node = getByPath(root, dataPath === '$' ? '' : dataPath)
  if (Array.isArray(node)) return node.filter(isPlainObject)
  if (isPlainObject(node)) return [node]
  return []
}

const SERIES_COLORS = ['#1b7a4e', '#e67e22', '#1d6fa5', '#7c3aed', '#be123c', '#0f766e', '#a16207']

/**
 * Build a SpecView-compatible spec from rows + widget config.
 * widget: { type, chartType, title, labelField, valueFields[], kpiFields[], columnFields[], valueField, sort, limit, stacked }
 */
export function buildSpecFromRows(rows, widget = {}) {
  const type = widget.type || 'chart'
  if (!rows?.length) {
    return { kind: 'bignumber', value: '—', label: 'No data', hint: 'Load a data source and map fields.' }
  }

  if (type === 'kpis') {
    const row = rows[0]
    const keys = widget.kpiFields?.length ? widget.kpiFields : numericFields(discoverFields(row)).slice(0, 4).map((f) => f.key)
    return {
      kind: 'kpis',
      items: keys.map((key) => ({
        label: human(key),
        value: fmtValue(readField(row, key), 'number'),
        hint: key,
      })),
    }
  }

  if (type === 'bignumber') {
    const row = rows[0]
    const key = widget.valueField || numericFields(discoverFields(row))[0]?.key
    return {
      kind: 'bignumber',
      value: fmtValue(readField(row, key), 'compact'),
      label: widget.title || human(key) || 'Value',
      hint: key,
    }
  }

  if (type === 'table') {
    const fields = discoverFields(rows[0])
    const cols = widget.columnFields?.length ? widget.columnFields : fields.slice(0, 6).map((f) => f.key)
    return {
      kind: 'table',
      columns: cols.map((key) => ({
        key,
        label: human(key),
        format: numericFields(fields).some((f) => f.key === key) ? 'number' : undefined,
      })),
      rows: rows.map((r) => {
        const out = {}
        cols.forEach((k) => (out[k] = readField(r, k)))
        return out
      }),
    }
  }

  // chart
  const labelField = widget.labelField || labelFields(discoverFields(rows[0])).find((f) => f.type === 'string')?.key
  const valueFields =
    widget.valueFields?.length > 0
      ? widget.valueFields
      : numericFields(discoverFields(rows[0]))
          .filter((f) => f.key !== labelField)
          .slice(0, 2)
          .map((f) => f.key)

  let idx = rows.map((_, i) => i)
  if (valueFields[0]) {
    const firstKey = valueFields[0]
    if (widget.sort === 'desc') idx.sort((a, b) => asNumber(readField(rows[b], firstKey)) - asNumber(readField(rows[a], firstKey)))
    if (widget.sort === 'asc') idx.sort((a, b) => asNumber(readField(rows[a], firstKey)) - asNumber(readField(rows[b], firstKey)))
  }
  if (widget.limit && widget.limit > 0) idx = idx.slice(0, widget.limit)

  const labels = idx.map((i) => String(readField(rows[i], labelField) ?? `#${i + 1}`))
  const datasets = valueFields.map((key, di) => ({
    label: human(key),
    color: SERIES_COLORS[di % SERIES_COLORS.length],
    data: idx.map((i) => asNumber(readField(rows[i], key))),
  }))

  const chartType = widget.chartType || 'bar'
  const typeName = chartType === 'hbar' ? 'bar' : chartType
  return {
    kind: 'chart',
    type: typeName,
    indexAxis: chartType === 'hbar' ? 'y' : 'x',
    stacked: !!widget.stacked && typeName === 'bar',
    format: 'number',
    unit: 'items',
    labels,
    datasets: typeName === 'doughnut' ? datasets.slice(0, 1) : datasets,
  }
}

/** Create a blank widget definition. */
export function createWidget(partial = {}) {
  return {
    id: uid('w'),
    type: 'chart',
    chartType: 'bar',
    title: '',
    labelField: '',
    valueFields: [],
    kpiFields: [],
    columnFields: [],
    valueField: '',
    sort: 'none',
    limit: 0,
    stacked: false,
    ...partial,
  }
}

/** Fetch JSON from an API endpoint (relative or absolute). */
export async function fetchJsonEndpoint(url, { method = 'GET', headers } = {}) {
  const res = await fetch(resolveUrl(url), {
    method,
    headers: {
      Accept: 'application/json',
      ...(headers || {}),
    },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText || 'request failed'}`)
  const text = await res.text()
  const parsed = parseJsonText(text)
  if (!parsed.ok) throw new Error(parsed.error)
  return { text, data: parsed.data }
}

/** Suggest a sensible default mapping from discovered array paths. */
export function suggestMapping(paths) {
  const best = paths[0]
  if (!best) return { dataPath: '', labelField: '', valueFields: [], kpiFields: [], columnFields: [] }
  const nums = numericFields(best.fields)
  const labels = labelFields(best.fields).filter((f) => f.type === 'string')
  const labelField = labels[0]?.key || best.fields[0]?.key || ''
  const valueFields = nums.filter((f) => f.key !== labelField).slice(0, 2).map((f) => f.key)
  return {
    dataPath: best.path === '$' ? '$' : best.path,
    labelField,
    valueFields,
    kpiFields: nums.slice(0, 4).map((f) => f.key),
    columnFields: best.fields.slice(0, 6).map((f) => f.key),
  }
}

/* ------------------------------------------------------- custom report specs */

/** Resolve rows for a custom report that uses API/JSON data (parsed client-side). */
export function getCustomReportRows(def) {
  if (!def || def.sourceType === 'library' || !def.sourceType) return null
  const parsed = def.parsedData != null ? { ok: true, data: def.parsedData } : parseJsonText(def.sampleJson || '')
  if (!parsed.ok) return null
  return extractRows(parsed.data, def.dataPath || '$')
}

const NO_BASE_SPEC = { kind: 'bignumber', value: '—', label: 'No data', hint: 'Pick a source report that has a chart.' }

/** Re-shape an existing chart spec (e.g. from a system report) using a widget's chart settings. */
export function buildLibraryChartSpec(base, def) {
  if (!base || base.kind !== 'chart' || !base.datasets?.length) return NO_BASE_SPEC
  let idx = base.labels.map((_, i) => i)
  const first = base.datasets[0].data
  if (def.sort === 'desc') idx.sort((x, y) => first[y] - first[x])
  if (def.sort === 'asc') idx.sort((x, y) => first[x] - first[y])
  if (def.limit && def.limit > 0) idx = idx.slice(0, def.limit)
  const labels = idx.map((i) => base.labels[i])
  const datasets = base.datasets.map((d) => ({ label: d.label, color: d.color, data: idx.map((i) => d.data[i]) }))
  const type = def.chartType === 'hbar' ? 'bar' : def.chartType || base.type
  return {
    kind: 'chart',
    type,
    indexAxis: def.chartType === 'hbar' ? 'y' : 'x',
    stacked: !!def.stacked && type === 'bar',
    format: base.format,
    unit: base.unit,
    labels,
    datasets: type === 'doughnut' ? [datasets[0]] : datasets,
    colors: base.colors ? idx.map((i) => base.colors[i]) : undefined,
  }
}

/**
 * Build every widget spec for a custom report definition from dynamic rows.
 * For library-backed definitions pass `{ baseSpec }` (a chart spec fetched from the API).
 */
export function buildCustomWidgetSpecs(def, { baseSpec } = {}) {
  if (!def) return []
  const widgets = def.widgets?.length
    ? def.widgets
    : [
        createWidget({
          type: 'chart',
          chartType: def.chartType || 'bar',
          title: def.name,
          labelField: def.labelField,
          valueFields: def.valueFields || [],
          kpiFields: def.kpiFields || [],
          columnFields: def.columnFields || [],
          valueField: def.valueField,
          sort: def.sort || 'none',
          limit: def.limit || 0,
          stacked: !!def.stacked,
        }),
      ]

  if (def.sourceType === 'api' || def.sourceType === 'json') {
    const rows = getCustomReportRows(def) || []
    return widgets.map((w) => ({
      widget: w,
      spec: buildSpecFromRows(rows, {
        ...w,
        labelField: w.labelField || def.labelField,
        valueFields: w.valueFields?.length ? w.valueFields : def.valueFields,
        kpiFields: w.kpiFields?.length ? w.kpiFields : def.kpiFields,
        columnFields: w.columnFields?.length ? w.columnFields : def.columnFields,
        valueField: w.valueField || def.valueField,
      }),
    }))
  }

  return widgets.map((w) => {
    if (w.type === 'chart' || !w.type) {
      return { widget: w, spec: buildLibraryChartSpec(baseSpec, { ...def, ...w, chartType: w.chartType || def.chartType }) }
    }
    return {
      widget: w,
      spec: { kind: 'bignumber', value: '—', label: 'Library source', hint: 'Switch to API or JSON for KPI/table widgets.' },
    }
  })
}

/** Primary chart/widget spec for a custom report definition (list preview). */
export function buildCustomSpec(def, opts) {
  return buildCustomWidgetSpecs(def, opts)[0]?.spec || null
}