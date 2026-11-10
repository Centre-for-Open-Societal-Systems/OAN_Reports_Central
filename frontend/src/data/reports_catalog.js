/**
 * Category metadata (labels / icons / links) is static UI chrome.
 * Reports, counts and KPIs are loaded from the API via `useCatalog.js`.
 */
import { apiCategories, categorySummaries, reports } from '../composables/useCatalog'

const REGISTRIES_URL = import.meta.env.VITE_REGISTRIES_DASHBOARD_URL || 'https://openagrinet.global/'
const A2C_URL = import.meta.env.VITE_A2C_DASHBOARD_URL || 'https://openagrinet.global/'

export const DEFAULT_CATEGORY = 'grievance'

export const CATEGORIES = [
  {
    id: 'access-to-credit',
    label: 'Access to Credit',
    icon: 'landmark',
    dashboardUrl: A2C_URL,
    description: 'Credit providers, consent, loan applications and data-sharing health for the A2C programme.',
  },
  {
    id: 'farmer-registry',
    label: 'Farmer Registry',
    icon: 'users',
    dashboardUrl: REGISTRIES_URL,
    description: 'Who is registered, where they farm and how complete the registry is.',
  },
  {
    id: 'livestock',
    label: 'Livestock',
    icon: 'paw',
    dashboardUrl: REGISTRIES_URL,
    description: 'Holdings, herd composition, health and vaccination coverage.',
  },
  {
    id: 'crop-sown',
    label: 'Crop Sown',
    icon: 'wheat',
    dashboardUrl: REGISTRIES_URL,
    description: 'Area sown by crop, season and location.',
  },
  {
    id: 'grievance',
    label: 'Grievance',
    icon: 'message-alert',
    dashboardUrl: A2C_URL,
    description: 'Volume, timeliness and performance of farmer grievance handling.',
  },
]

/** Live report list (reactive array, populated by `loadCatalog()`). */
export const REPORTS = reports

/* ------------------------------------------------------------------ lookups */

export const getCategory = (id) => {
  const known = CATEGORIES.find((c) => c.id === id)
  if (known) return known
  const remote = apiCategories.value.find((c) => c.id === id)
  return remote ? { icon: 'library', dashboardUrl: A2C_URL, ...remote } : undefined
}

export const isKnownCategory = (id) => CATEGORIES.some((c) => c.id === id)

export const getReport = (id) => REPORTS.find((x) => x.id === id)
export const reportsByCategory = (id) => REPORTS.filter((x) => x.category === id)

export function categoryCount(id) {
  const n = reportsByCategory(id).length
  if (n || REPORTS.length) return n
  return apiCategories.value.find((c) => c.id === id)?.report_count ?? 0
}

export function tagsForCategory(id) {
  const seen = []
  for (const rep of reportsByCategory(id)) if (rep.tag && !seen.includes(rep.tag)) seen.push(rep.tag)
  return seen
}

export function searchReports(query) {
  const q = String(query || '').trim().toLowerCase()
  if (!q) return []
  return REPORTS.filter((rep) => {
    const cat = getCategory(rep.category)
    return [rep.title, rep.tag, cat?.label, rep.description].some((s) => s?.toLowerCase().includes(q))
  })
}

/** KPIs for a category's library header (from GET /api/categories/{id}/summary). */
export const getCategoryKpis = (id) => categorySummaries[id]?.kpis || []
export const getCategorySummaryState = (id) => categorySummaries[id] || { status: 'idle', kpis: [], error: '' }
