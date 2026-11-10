import { reactive } from 'vue'
import { persistedRef } from '../utils/storage'
import { uid } from '../utils/format'
import {
  createReport,
  deleteReport,
  getSettings,
  listSchedules,
  resetReport,
  saveSchedules,
  saveSettings,
  updateReport,
} from '../api/reports'
import { formToPayload } from '../api/mappers'
import { clearPreview, reloadCatalog } from './useCatalog'
import { getReport as getCatalogReport } from '../data/reports_catalog'

/* ----------------------------------------------------------------- reports
 * Custom AND edited system reports live on the server. These helpers wrap the API
 * and refresh the catalog cache; nothing about report definitions is kept in localStorage.
 */

/** Create (no id) or PATCH (id) a report from the builder form model. Returns the saved report. */
export async function saveReportForm(form) {
  const baseReport = form.sourceType === 'library' ? getCatalogReport(form.baseReportId) : undefined
  const payload = formToPayload(form, { baseReport })
  const saved = form.id ? await updateReport(form.id, payload) : await createReport(payload)
  clearPreview(form.id || saved?.id)
  await reloadCatalog()
  return saved
}

export async function removeReport(id) {
  await deleteReport(id)
  clearPreview(id)
  await reloadCatalog()
}

/** Restore a system report to its shipped defaults. Returns the restored report. */
export async function restoreReport(id) {
  const restored = await resetReport(id)
  clearPreview(id)
  await reloadCatalog()
  return restored
}

/* ---------------------------------------------------------------- schedule */

export const schedules = reactive({ items: [], loading: false, loaded: false, error: '' })

export async function loadSchedules({ force = false } = {}) {
  if (schedules.loading || (schedules.loaded && !force)) return
  schedules.loading = true
  schedules.error = ''
  try {
    schedules.items = await listSchedules()
    schedules.loaded = true
  } catch (e) {
    schedules.error = e.message || 'Could not load schedules.'
  } finally {
    schedules.loading = false
  }
}

async function commitSchedules(next) {
  const saved = await saveSchedules(next)
  schedules.items = saved.length || !next.length ? saved : next
}

export const addSchedule = (item) => commitSchedules([{ ...item, id: uid('sc'), active: true }, ...schedules.items])
export const removeSchedule = (id) => commitSchedules(schedules.items.filter((x) => x.id !== id))
export const toggleSchedule = (id) =>
  commitSchedules(schedules.items.map((x) => (x.id === id ? { ...x, active: !x.active } : x)))

/* ---------------------------------------------------------------- settings
 * Server is the source of truth; the last-known copy is cached in localStorage so the
 * top bar / default category don't flash before the API answers.
 */

export const defaultSettings = () => ({
  name: 'Report Center user',
  initials: 'RC',
  email: '',
  role: '',
  language: 'en',
  defaultCategory: 'grievance',
  areaUnit: 'ha',
  currency: 'ETB',
  dateFormat: 'DD MMM YYYY',
  notifyDigest: true,
  notifySla: true,
  notifyDataShare: false,
})

export const settings = persistedRef('oan.settings.cache.v1', defaultSettings())
settings.value = { ...defaultSettings(), ...settings.value }

export const settingsState = reactive({ loading: false, loaded: false, error: '' })

export async function loadSettings() {
  settingsState.loading = true
  settingsState.error = ''
  try {
    settings.value = { ...defaultSettings(), ...(await getSettings()) }
    settingsState.loaded = true
  } catch (e) {
    settingsState.error = e.message || 'Could not load settings.'
  } finally {
    settingsState.loading = false
  }
}

export async function persistSettings(next) {
  const saved = await saveSettings(next)
  settings.value = { ...defaultSettings(), ...next, ...saved }
}

/* -------------------------------------------------------- map configuration
 * UI preference only (browser-local).
 */

export const mapSettings = persistedRef('oan.map-settings.v1', {
  zone: { metric: 'farmers', palette: 'green', classes: 5, labels: true, codes: false },
  woreda: { metric: 'farmers', palette: 'green', classes: 5, labels: true, codes: false },
})
