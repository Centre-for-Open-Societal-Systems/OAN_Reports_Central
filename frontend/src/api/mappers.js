/**
 * Translate between the backend's snake_case report shape and the camelCase
 * form/widget model used by the builder and dynamic spec helpers.
 */
import { createWidget } from '../utils/dynamicData'

const SOURCE_TYPES = ['library', 'api', 'json']

export const toSnake = (key) => key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)
export const toCamel = (key) => key.replace(/_([a-z])/g, (_, c) => c.toUpperCase())

/** Shallow key conversion — used for settings / schedules payloads. */
export function mapKeys(obj, fn) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj
  return Object.fromEntries(Object.entries(obj).map(([k, v]) => [fn(k), v]))
}

const pick = (obj, snake, fallback) => {
  const camel = toCamel(snake)
  if (obj?.[snake] !== undefined && obj[snake] !== null) return obj[snake]
  if (obj?.[camel] !== undefined && obj[camel] !== null) return obj[camel]
  return fallback
}

/* ----------------------------------------------------------------- widgets */

export function widgetFromApi(w = {}) {
  return {
    ...createWidget({
      id: w.id || undefined,
      type: w.type || 'chart',
      chartType: pick(w, 'chart_type', 'bar'),
      title: w.title || '',
      labelField: pick(w, 'label_field', ''),
      valueFields: [...pick(w, 'value_fields', [])],
      kpiFields: [...pick(w, 'kpi_fields', [])],
      columnFields: [...pick(w, 'column_fields', [])],
      valueField: pick(w, 'value_field', ''),
      sort: w.sort || 'none',
      limit: Number(w.limit) || 0,
      stacked: !!w.stacked,
    }),
    // Keep any backend-only keys so a PATCH round-trips them untouched.
    _raw: w,
  }
}

export function widgetToApi(w) {
  const { _raw, ...rest } = w
  return {
    ...(_raw || {}),
    id: rest.id,
    type: rest.type,
    chart_type: rest.chartType,
    title: rest.title,
    label_field: rest.labelField,
    value_fields: rest.valueFields,
    kpi_fields: rest.kpiFields,
    column_fields: rest.columnFields,
    value_field: rest.valueField,
    sort: rest.sort,
    limit: rest.limit,
    stacked: rest.stacked,
  }
}

/* ----------------------------------------------------------------- reports */

export function reportSourceKind(r) {
  const t = pick(r, 'source_type', '')
  if (SOURCE_TYPES.includes(t)) return t
  return pick(r, 'api_endpoint', '') ? 'api' : 'library'
}

/** API report -> builder form model. */
export function reportToForm(r) {
  const sourceType = reportSourceKind(r)
  return {
    id: r.id,
    name: r.title || r.name || '',
    description: r.description || '',
    category: r.category || '',
    tag: r.tag || '',
    frequency: r.frequency || '',
    isSystem: !!pick(r, 'is_system', false),
    isActive: pick(r, 'is_active', true) !== false,
    owner: r.owner || '',
    updatedAt: pick(r, 'updated_at', ''),
    sourceType,
    rawSourceType: pick(r, 'source_type', ''),
    baseReportId: pick(r, 'base_report_id', '') || (sourceType === 'library' ? r.id : ''),
    apiEndpoint: pick(r, 'api_endpoint', ''),
    apiMethod: pick(r, 'api_method', 'GET'),
    sampleJson: pick(r, 'sample_json', ''),
    parsedData: null,
    dataPath: pick(r, 'data_path', ''),
    labelField: pick(r, 'label_field', ''),
    valueFields: [...pick(r, 'value_fields', [])],
    kpiFields: [...pick(r, 'kpi_fields', [])],
    columnFields: [...pick(r, 'column_fields', [])],
    valueField: pick(r, 'value_field', ''),
    chartType: pick(r, 'chart_type', 'bar'),
    sort: r.sort || 'none',
    limit: Number(r.limit) || 0,
    stacked: !!r.stacked,
    widgets: (r.widgets || []).map(widgetFromApi),
  }
}

/** Builder form model -> POST/PATCH payload. */
export function formToPayload(form) {
  // If the user did not change the source kind, send the backend's own value back untouched.
  const keepRaw = form.rawSourceType && reportSourceKind({ source_type: form.rawSourceType, api_endpoint: form.apiEndpoint }) === form.sourceType
  const payload = {
    title: form.name.trim(),
    description: form.description || '',
    category: form.category,
    source_type: keepRaw ? form.rawSourceType : form.sourceType,
    chart_type: form.chartType,
    sort: form.sort,
    limit: form.limit,
    stacked: !!form.stacked,
    widgets: form.widgets.map(widgetToApi),
  }
  if (form.tag) payload.tag = form.tag
  if (form.frequency) payload.frequency = form.frequency

  Object.assign(payload, {
    data_path: form.dataPath,
    field_mapping: {
      label_field: form.labelField,
      value_fields: form.valueFields,
      kpi_fields: form.kpiFields,
      column_fields: form.columnFields,
      value_field: form.valueField,
      ...(form.sourceType === 'json' && form.sampleJson ? { sample_json: form.sampleJson } : {}),
    },
  })
  if (form.sourceType === 'library') {
    payload.base_report_id = form.baseReportId || null
    payload.source_type = 'upstream'
  } else if (form.sourceType === 'api') {
    payload.api_endpoint = form.apiEndpoint.trim()
    payload.api_method = form.apiMethod || 'GET'
    payload.source_type = form.rawSourceType === 'upstream' ? 'upstream' : 'api'
  } else {
    payload.source_type = 'json'
    payload.api_endpoint = form.apiEndpoint || ''
  }
  return payload
}

/* ------------------------------------------------------------ report data */

export function normalizeReportData(raw) {
  const widgets = (raw?.widgets || []).map((w) => ({
    widget: {
      id: w.id,
      title: w.title || '',
      type: w.type,
      chartType: pick(w, 'chart_type', undefined),
    },
    spec: w.spec ?? null,
  }))
  return {
    report: raw?.report || null,
    kpis: raw?.category_kpis || raw?.kpis || null,
    widgets,
    data: raw,
    meta: { upstream: raw?.upstream || { ok: true }, asOf: raw?.as_of || null },
  }
}
