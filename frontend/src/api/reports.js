import { api } from './client'
import { mapKeys, normalizeReportData, toCamel, toSnake } from './mappers'

const enc = encodeURIComponent

/* ----------------------------------------------------------------- reports */

/** GET /api/reports */
export const listReports = ({ category, q, includeInactive } = {}) =>
  api.get('/api/reports', { query: { category, q, include_inactive: includeInactive ? 'true' : undefined } })

/** GET /api/reports/{id} */
export const getReport = (id) => api.get(`/api/reports/${enc(id)}`)

/** GET /api/reports/{id}/data -> { report, kpis?, widgets: [{widget, spec}], data, meta } */
export async function getReportData(id, params = {}, { signal } = {}) {
  const raw = await api.get(`/api/reports/${enc(id)}/data`, { query: params, signal })
  return normalizeReportData(raw)
}

/** POST /api/reports */
export const createReport = (payload) => api.post('/api/reports', payload)

/** PATCH /api/reports/{id} */
export const updateReport = (id, payload) => api.patch(`/api/reports/${enc(id)}`, payload)

/** DELETE /api/reports/{id} */
export const deleteReport = (id) => api.delete(`/api/reports/${enc(id)}`)

/** POST /api/reports/{id}/reset — restore a system report's defaults. */
export const resetReport = (id) => api.post(`/api/reports/${enc(id)}/reset`)

/* -------------------------------------------------------------- categories */

/** GET /api/categories -> [{ id, label, description, report_count }] */
export const listCategories = () => api.get('/api/categories')

/** GET /api/categories/{id}/summary -> { kpis: [{ label, value, hint, icon, tone? }] } */
export async function getCategorySummary(categoryId) {
  const res = await api.get(`/api/categories/${enc(categoryId)}/summary`)
  return Array.isArray(res) ? { kpis: res } : { kpis: [], ...res }
}

/* --------------------------------------------------------------- schedules */

const unwrapList = (res, key) => (Array.isArray(res) ? res : res?.[key] || res?.items || [])

/** GET /api/schedules -> camelCase schedule rows */
export async function listSchedules() {
  const res = await api.get('/api/schedules')
  return unwrapList(res, 'schedules').map((s) => mapKeys(s, toCamel))
}

/** PUT /api/schedules — replaces the full list. */
export async function saveSchedules(list) {
  const res = await api.put('/api/schedules', list.map((s) => mapKeys(s, toSnake)))
  return unwrapList(res, 'schedules').map((s) => mapKeys(s, toCamel))
}

/* ---------------------------------------------------------------- settings */

/** GET /api/settings -> camelCase UI settings object */
export async function getSettings() {
  const res = await api.get('/api/settings')
  const ui = res?.ui || res?.settings || res || {}
  return mapKeys(ui, toCamel)
}

/** PUT /api/settings — wraps UI prefs under `{ ui }` for the backend bundle. */
export async function saveSettings(settings) {
  const res = await api.put('/api/settings', { ui: mapKeys(settings, toSnake) })
  const ui = res?.ui || res?.settings || settings
  return mapKeys(ui, toCamel)
}

export const health = () => api.get('/api/health')
