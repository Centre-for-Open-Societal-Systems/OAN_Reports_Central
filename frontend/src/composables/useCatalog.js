/**
 * Report catalog cache. Everything here comes from the backend API — nothing is bundled.
 *
 * `loadCatalog()` is called once from App.vue on mount; views read the reactive state below.
 */
import { reactive, ref } from 'vue'
import { getCategorySummary, getReportData, listCategories, listReports } from '../api/reports'

/** Reactive array of catalog reports (mutated in place so `REPORTS` imports stay live). */
export const reports = reactive([])
export const apiCategories = ref([])

export const catalogState = reactive({
  loading: false,
  loaded: false,
  error: '',
})

let inflight = null

export function loadCatalog({ force = false } = {}) {
  if (inflight) return inflight
  if (catalogState.loaded && !force) return Promise.resolve()
  catalogState.loading = true
  catalogState.error = ''
  inflight = Promise.all([listReports(), listCategories().catch(() => [])])
    .then(([items, cats]) => {
      reports.splice(0, reports.length, ...(Array.isArray(items) ? items : items?.items || []))
      apiCategories.value = Array.isArray(cats) ? cats : cats?.items || []
      catalogState.loaded = true
    })
    .catch((e) => {
      catalogState.error = e.message || 'Could not load the report catalog.'
    })
    .finally(() => {
      catalogState.loading = false
      inflight = null
    })
  return inflight
}

/** Refresh after a create / update / delete / reset. */
export function reloadCatalog() {
  return loadCatalog({ force: true })
}

/* ------------------------------------------------------- category summaries */

/** id -> { status: 'loading' | 'ready' | 'error', kpis: [], error } */
export const categorySummaries = reactive({})

export function loadCategorySummary(id, { force = false } = {}) {
  const cur = categorySummaries[id]
  if (cur && !force && (cur.status === 'loading' || cur.status === 'ready')) return Promise.resolve()
  categorySummaries[id] = { status: 'loading', kpis: cur?.kpis || [], error: '' }
  return getCategorySummary(id)
    .then((res) => {
      categorySummaries[id] = { status: 'ready', kpis: res.kpis || [], error: '' }
    })
    .catch((e) => {
      categorySummaries[id] = { status: 'error', kpis: [], error: e.message || 'Could not load category summary.' }
    })
}

/* ---------------------------------------------------------- preview specs */

const previews = reactive({}) // id -> { status, spec }
const pending = new Map()

/** Lazily fetch a report's first widget spec for card thumbnails. Cached per report id. */
export function loadPreview(id) {
  if (previews[id]?.status === 'ready' || previews[id]?.status === 'error') return Promise.resolve()
  if (pending.has(id)) return pending.get(id)
  previews[id] = { status: 'loading', spec: null }
  const p = getReportData(id)
    .then((res) => {
      previews[id] = { status: 'ready', spec: res.widgets.find((w) => w.spec)?.spec || null }
    })
    .catch(() => {
      previews[id] = { status: 'error', spec: null }
    })
    .finally(() => pending.delete(id))
  pending.set(id, p)
  return p
}

export const getPreview = (id) => previews[id] || { status: 'idle', spec: null }

export function clearPreview(id) {
  if (id) delete previews[id]
  else Object.keys(previews).forEach((k) => delete previews[k])
}
