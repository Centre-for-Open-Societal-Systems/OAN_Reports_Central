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
    chartKeys: [...pick(r, 'chart_keys', [])],
    upstreamService: pick(r, 'upstream_service', ''),
    isCustomized: !!pick(r, 'is_customized', false),
    originalEndpoint: pick(r, 'api_endpoint', ''),
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

/** Last path segment of an endpoint, e.g. `/api/v1/charts/grvByCategory?x=1` -> `grvByCategory`. */
export function chartKeyFromEndpoint(endpoint = '') {
  const path = String(endpoint).split('?')[0].replace(/\/+$/, '')
  return path.split('/').pop() || ''
}

/**
 * Builder form model -> POST/PATCH payload.
 * `baseReport` (catalog entry) is required for "Library dataset" sources: the new report reuses its
 * upstream chart definition and the widgets inherit its field mapping.
 */
export function formToPayload(form, { baseReport } = {}) {
  const kind = form.sourceType
  const keepRaw = form.rawSourceType && reportSourceKind({ source_type: form.rawSourceType, api_endpoint: form.apiEndpoint }) === kind
  const payload = {
    title: form.name.trim(),
    description: form.description || '',
    category: form.category,
    source_type: keepRaw ? form.rawSourceType : kind,
    widgets: form.widgets.map(widgetToApi),
  }
  if (form.tag) payload.tag = form.tag
  if (form.frequency) payload.frequency = form.frequency

  if (kind === 'library') {
    // Reuse the base report's upstream chart; keep its original source kind so the backend can render it.
    payload.source_type = baseReport?.source_type || 'upstream'
    payload.base_report_id = form.baseReportId || null
    if (baseReport) {
      payload.chart_keys = baseReport.chart_keys || []
      payload.upstream_service = baseReport.upstream_service || ''
      payload.api_endpoint = baseReport.api_endpoint || ''
      payload.api_method = baseReport.api_method || 'GET'
      payload.data_path = baseReport.data_path || 'data'
      payload.field_mapping = baseReport.field_mapping || {}
      const baseChart = (baseReport.widgets || []).find((w) => w.type === 'chart' || !w.type)
      if (baseChart) {
        payload.widgets = payload.widgets.map((w) =>
          w.type === 'chart' || !w.type
            ? {
                ...w,
                label_field: w.label_field || baseChart.label_field || '',
                value_fields: w.value_fields?.length ? w.value_fields : baseChart.value_fields || [],
              }
            : w,
        )
      }
    }
    return payload
  }

  Object.assign(payload, {
    data_path: form.dataPath || 'data',
    api_method: form.apiMethod || 'GET',
    api_endpoint: form.apiEndpoint.trim(),
    upstream_service: form.upstreamService || '',
    label_field: form.labelField,
    value_fields: form.valueFields,
    kpi_fields: form.kpiFields,
    column_fields: form.columnFields,
    value_field: form.valueField,
  })
  if (kind === 'json') payload.sample_json = form.sampleJson

  // The backend renders a report by fetching its `chart_keys`; derive one from the endpoint when it changes.
  const endpointChanged = form.apiEndpoint.trim() !== (form.originalEndpoint || '')
  const derived = chartKeyFromEndpoint(form.apiEndpoint)
  if (form.chartKeys?.length && !endpointChanged) payload.chart_keys = form.chartKeys
  else if (derived) payload.chart_keys = [derived]
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
    meta: { upstream: normalizeUpstream(raw?.upstream), asOf: raw?.as_of || null },
  }
}

/** Accepts `{ ok, error }` or the backend's `{ upstream_ok, errors[] }`. */
export function normalizeUpstream(u) {
  if (!u) return { ok: true }
  const ok = u.ok ?? u.upstream_ok ?? true
  const error = u.error || (Array.isArray(u.errors) && u.errors.length ? u.errors.join('; ') : '')
  return { ...u, ok: !!ok, error }
}