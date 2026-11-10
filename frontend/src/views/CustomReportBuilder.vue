<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppIcon from '../components/AppIcon.vue'
import SpecView from '../components/charts/SpecView.vue'
import StatePanel from '../components/StatePanel.vue'
import { CATEGORIES, getReport as getCatalogReport, reportsByCategory } from '../data/reports_catalog'
import { getReport as fetchReport, getReportData } from '../api/reports'
import { reportToForm } from '../api/mappers'
import { removeReport, restoreReport, saveReportForm, settings } from '../composables/useStores'
import { showToast } from '../composables/useToast'
import {
  parseJsonText,
  findArrayPaths,
  discoverFields,
  numericFields,
  labelFields,
  extractRows,
  createWidget,
  fetchJsonEndpoint,
  suggestMapping,
  buildCustomWidgetSpecs,
} from '../utils/dynamicData'

const route = useRoute()
const router = useRouter()

const blankForm = () => ({
  id: null,
  name: '',
  description: '',
  category: CATEGORIES.some((c) => c.id === settings.value.defaultCategory) ? settings.value.defaultCategory : CATEGORIES[0].id,
  tag: '',
  frequency: '',
  isSystem: false,
  isActive: true,
  owner: '',
  updatedAt: '',
  sourceType: 'api', // library | api | json
  rawSourceType: '',
  chartKeys: [],
  upstreamService: '',
  isCustomized: false,
  originalEndpoint: '',
  baseReportId: '',
  apiEndpoint: '',
  apiMethod: 'GET',
  sampleJson: '',
  parsedData: null,
  dataPath: '',
  labelField: '',
  valueFields: [],
  kpiFields: [],
  columnFields: [],
  valueField: '',
  chartType: 'bar',
  sort: 'none',
  limit: 0,
  stacked: false,
  widgets: [],
})

const form = reactive(blankForm())

const pageState = ref('ready') // ready | loading | error
const pageError = ref('')
const saving = ref(false)
const touched = ref(false)
const jsonError = ref('')
const fetchState = ref({ loading: false, error: '', ok: false })
const activeWidgetId = ref(null)

/* ----- server-side data used for previews ----- */
const baseState = ref({ loading: false, error: '', data: null })
const serverWidgets = ref([]) // last-saved render of the report being edited

const baseSpec = computed(() => baseState.value.data?.widgets.find((w) => w.spec?.kind === 'chart')?.spec || null)

const sources = computed(() => {
  const list = reportsByCategory(form.category)
  const current = form.baseReportId && !list.some((r) => r.id === form.baseReportId) ? getCatalogReport(form.baseReportId) : null
  return current ? [current, ...list] : list
})

const multiSeries = computed(() => {
  if (form.sourceType === 'library') return baseSpec.value?.datasets?.length > 1
  return (activeWidget.value?.valueFields?.length || form.valueFields?.length || 0) > 1
})
const canStack = computed(() => multiSeries.value && (activeWidget.value?.chartType === 'bar' || activeWidget.value?.chartType === 'hbar' || form.chartType === 'bar' || form.chartType === 'hbar'))

const parsedRoot = computed(() => {
  if (form.parsedData != null) return form.parsedData
  const p = parseJsonText(form.sampleJson)
  return p.ok ? p.data : null
})

const arrayPaths = computed(() => (parsedRoot.value != null ? findArrayPaths(parsedRoot.value) : []))
const activeFields = computed(() => {
  if (!parsedRoot.value) return []
  const rows = extractRows(parsedRoot.value, form.dataPath || '$')
  return rows[0] ? discoverFields(rows[0]) : []
})
const numberFieldOptions = computed(() => numericFields(activeFields.value))
const labelFieldOptions = computed(() => labelFields(activeFields.value))
const rowCount = computed(() => (parsedRoot.value ? extractRows(parsedRoot.value, form.dataPath || '$').length : 0))

// Live preview is computed client-side from the loaded rows; when none are reachable from the
// browser (e.g. an upstream blocked by CORS) fall back to what the server last rendered.
const hasLocalRows = computed(() => (form.sourceType === 'library' ? !!baseSpec.value : parsedRoot.value != null))
const usingServerPreview = computed(() => !hasLocalRows.value && serverWidgets.value.length > 0)
const widgetSpecs = computed(() =>
  usingServerPreview.value ? serverWidgets.value : buildCustomWidgetSpecs(form, { baseSpec: baseSpec.value }),
)
const activeWidget = computed(() => form.widgets.find((w) => w.id === activeWidgetId.value) || form.widgets[0] || null)

const chartTypes = [
  { id: 'bar', label: 'Columns', icon: 'bar-chart' },
  { id: 'hbar', label: 'Bars', icon: 'list' },
  { id: 'line', label: 'Line', icon: 'line-chart' },
  { id: 'doughnut', label: 'Doughnut', icon: 'pie-chart' },
]

const widgetPalette = [
  { type: 'chart', chartType: 'bar', label: 'Column chart', icon: 'bar-chart' },
  { type: 'chart', chartType: 'hbar', label: 'Bar chart', icon: 'list' },
  { type: 'chart', chartType: 'line', label: 'Line chart', icon: 'line-chart' },
  { type: 'chart', chartType: 'doughnut', label: 'Doughnut', icon: 'pie-chart' },
  { type: 'kpis', label: 'KPI cards', icon: 'dashboard' },
  { type: 'table', label: 'Data table', icon: 'list' },
  { type: 'bignumber', label: 'Big number', icon: 'hash' },
]

function ensureWidgets() {
  if (!form.widgets.length) {
    form.widgets.push(
      createWidget({
        type: 'chart',
        chartType: form.chartType || 'bar',
        title: form.name || 'Main chart',
        labelField: form.labelField,
        valueFields: [...(form.valueFields || [])],
        kpiFields: [...(form.kpiFields || [])],
        columnFields: [...(form.columnFields || [])],
        valueField: form.valueField,
        sort: form.sort,
        limit: form.limit,
        stacked: form.stacked,
      }),
    )
  }
  if (!form.widgets.some((w) => w.id === activeWidgetId.value)) activeWidgetId.value = form.widgets[0].id
}

function applySuggestedMapping() {
  const suggestion = suggestMapping(arrayPaths.value)
  form.dataPath = suggestion.dataPath
  form.labelField = suggestion.labelField
  form.valueFields = suggestion.valueFields
  form.kpiFields = suggestion.kpiFields
  form.columnFields = suggestion.columnFields
  form.valueField = suggestion.valueFields[0] || ''
  syncWidgetsFromMapping()
}

/** Edit mode: keep the saved mapping, only fill top-level gaps (from the first chart widget, then a suggestion). */
function fillMissingMapping() {
  const s = suggestMapping(arrayPaths.value)
  const w = form.widgets.find((x) => x.type === 'chart') || form.widgets[0]
  if (!form.dataPath) form.dataPath = s.dataPath
  if (!form.labelField) form.labelField = w?.labelField || s.labelField
  if (!form.valueFields.length) form.valueFields = w?.valueFields?.length ? [...w.valueFields] : s.valueFields
  if (!form.valueField) form.valueField = w?.valueField || form.valueFields[0] || ''
  if (!form.kpiFields.length) form.kpiFields = form.widgets.find((x) => x.type === 'kpis')?.kpiFields?.slice() || s.kpiFields
  if (!form.columnFields.length) form.columnFields = form.widgets.find((x) => x.type === 'table')?.columnFields?.slice() || s.columnFields
  syncWidgetsFromMapping()
}

/** Relative chart-proxy URLs need the upstream service to pick the right backend. */
function withService(url) {
  if (!form.upstreamService || /[?&]service=/.test(url) || !/^\/api\/v1\/charts\//.test(url)) return url
  return `${url}${url.includes('?') ? '&' : '?'}service=${encodeURIComponent(form.upstreamService)}`
}

function syncWidgetsFromMapping() {
  for (const w of form.widgets) {
    if (!w.labelField) w.labelField = form.labelField
    if (!w.valueFields?.length) w.valueFields = [...form.valueFields]
    if (!w.kpiFields?.length) w.kpiFields = [...form.kpiFields]
    if (!w.columnFields?.length) w.columnFields = [...form.columnFields]
    if (!w.valueField) w.valueField = form.valueField
  }
}

function ingestJson(text, { silent } = {}) {
  const parsed = parseJsonText(text)
  if (!parsed.ok) {
    jsonError.value = parsed.error
    form.parsedData = null
    if (!silent) showToast(parsed.error, 'info')
    return false
  }
  jsonError.value = ''
  form.sampleJson = typeof text === 'string' ? text : JSON.stringify(parsed.data, null, 2)
  form.parsedData = parsed.data
  const paths = findArrayPaths(parsed.data)
  if (!form.dataPath || !paths.some((p) => p.path === form.dataPath || (form.dataPath === 'data' && p.path === 'data'))) {
    applySuggestedMapping()
  } else {
    // refresh field defaults if empty
    const rows = extractRows(parsed.data, form.dataPath)
    if (rows[0] && !form.labelField) applySuggestedMapping()
    else syncWidgetsFromMapping()
  }
  ensureWidgets()
  if (!silent) showToast('Sample data loaded — map fields and add widgets')
  return true
}

/** Fetch the endpoint from the browser. `keepMapping` preserves a saved field mapping (edit mode). */
async function loadFromApi({ silent = false, keepMapping = false } = {}) {
  if (!form.apiEndpoint.trim()) {
    fetchState.value = { loading: false, error: 'Enter an API endpoint.', ok: false }
    return
  }
  fetchState.value = { loading: true, error: '', ok: false }
  try {
    const { data } = await fetchJsonEndpoint(withService(form.apiEndpoint.trim()), { method: form.apiMethod || 'GET' })
    form.parsedData = data
    form.sampleJson = JSON.stringify(data, null, 2)
    jsonError.value = ''
    if (keepMapping) fillMissingMapping()
    else applySuggestedMapping()
    ensureWidgets()
    fetchState.value = { loading: false, error: '', ok: true }
    if (!silent) showToast('API response loaded')
  } catch (e) {
    fetchState.value = { loading: false, error: e.message || 'Fetch failed', ok: false }
    if (!silent) showToast(e.message || 'Fetch failed', 'info')
  }
}

/** Load a system/custom report's data so a "Library dataset" source can reshape its chart. */
async function loadBase(id) {
  if (!id) {
    baseState.value = { loading: false, error: '', data: null }
    return
  }
  baseState.value = { loading: true, error: '', data: null }
  try {
    const data = await getReportData(id)
    if (form.baseReportId === id) baseState.value = { loading: false, error: '', data }
  } catch (e) {
    if (form.baseReportId === id) baseState.value = { loading: false, error: e.message || 'Could not load source report.', data: null }
  }
}

function addWidget(paletteItem) {
  ensureWidgets()
  const w = createWidget({
    type: paletteItem.type,
    chartType: paletteItem.chartType || 'bar',
    title: paletteItem.label,
    labelField: form.labelField,
    valueFields: [...form.valueFields],
    kpiFields: [...form.kpiFields],
    columnFields: [...form.columnFields],
    valueField: form.valueField || form.valueFields[0] || '',
    sort: form.sort,
    limit: form.limit,
  })
  form.widgets.push(w)
  activeWidgetId.value = w.id
}

function removeWidget(id) {
  form.widgets = form.widgets.filter((w) => w.id !== id)
  if (activeWidgetId.value === id) activeWidgetId.value = form.widgets[0]?.id || null
  if (!form.widgets.length) ensureWidgets()
}

function toggleField(listName, key) {
  const target = activeWidget.value || form
  const list = [...(target[listName] || [])]
  const i = list.indexOf(key)
  if (i >= 0) list.splice(i, 1)
  else list.push(key)
  target[listName] = list
  if (target === form) syncWidgetsFromMapping()
}

/* ----- load an existing report (?id=) or start from a base (?base=) ----- */

async function load() {
  const { id, base } = route.query
  Object.assign(form, blankForm())
  baseState.value = { loading: false, error: '', data: null }
  serverWidgets.value = []
  jsonError.value = ''
  fetchState.value = { loading: false, error: '', ok: false }

  if (id) {
    pageState.value = 'loading'
    pageError.value = ''
    try {
      const report = await fetchReport(String(id))
      Object.assign(form, reportToForm(report))
    } catch (e) {
      pageError.value = e.message || 'Could not load report.'
      pageState.value = 'error'
      return
    }
    pageState.value = 'ready'
    // What the server renders for the saved definition — used when the browser can't reach the source.
    getReportData(form.id)
      .then((res) => (serverWidgets.value = res.widgets.filter((w) => w.spec)))
      .catch(() => {})
  } else if (base) {
    const rep = getCatalogReport(String(base))
    if (rep) {
      form.sourceType = 'library'
      form.category = rep.category
      form.baseReportId = rep.id
      form.name = `${rep.title} (custom)`
    }
  }

  if (form.sourceType === 'library') loadBase(form.baseReportId)
  else if (form.sourceType === 'json' && form.sampleJson) ingestJson(form.sampleJson, { silent: true })
  else if (form.sourceType === 'api' && form.apiEndpoint) loadFromApi({ silent: true, keepMapping: !!form.id })
  ensureWidgets()
}
onMounted(load)
watch(() => [route.query.id, route.query.base], load)

watch(
  () => form.category,
  () => {
    if (form.sourceType === 'library' && !sources.value.some((s) => s.id === form.baseReportId)) {
      form.baseReportId = sources.value[0]?.id || ''
    }
  },
)

watch(
  () => form.baseReportId,
  (id) => {
    if (form.sourceType === 'library') loadBase(id)
  },
)

watch(
  () => form.sourceType,
  (t) => {
    if (t === 'library') {
      if (!form.baseReportId) form.baseReportId = sources.value[0]?.id || ''
      else loadBase(form.baseReportId)
    }
    ensureWidgets()
  },
)

watch(canStack, (v) => {
  if (!v) {
    form.stacked = false
    form.widgets.forEach((w) => (w.stacked = false))
  }
})

/* ----- actions ----- */

async function save() {
  touched.value = true
  if (!form.name.trim() || saving.value) return
  if (form.sourceType === 'api' && !form.apiEndpoint.trim()) {
    showToast('Enter an API endpoint', 'info')
    return
  }
  if (form.sourceType === 'library' && !form.baseReportId) {
    showToast('Pick a library dataset', 'info')
    return
  }
  if (form.sourceType === 'json') {
    const parsed = form.parsedData != null ? { ok: true } : parseJsonText(form.sampleJson)
    if (!parsed.ok) {
      jsonError.value = parsed.error || 'Invalid JSON'
      showToast('Fix the sample JSON before saving', 'info')
      return
    }
  }
  if (!form.widgets.length) {
    showToast('Add at least one widget', 'info')
    return
  }
  // Keep top-level chart fields in sync with first chart widget for list previews / older readers
  const primary = form.widgets.find((w) => w.type === 'chart') || form.widgets[0]
  if (primary) {
    form.chartType = primary.chartType || form.chartType
    form.sort = primary.sort
    form.limit = primary.limit
    form.stacked = primary.stacked
    form.labelField = primary.labelField || form.labelField
    form.valueFields = primary.valueFields?.length ? primary.valueFields : form.valueFields
  }
  const wasEdit = !!form.id
  saving.value = true
  try {
    await saveReportForm({ ...form, name: form.name.trim() })
    showToast(wasEdit ? (form.isSystem ? 'System report updated' : 'Report updated') : 'Custom report saved')
    router.push('/custom')
  } catch (e) {
    showToast(e.message || 'Could not save report', 'info')
  } finally {
    saving.value = false
  }
}

async function resetToDefaults() {
  if (!form.id || !form.isSystem) return
  if (!confirm(`Reset “${form.name}” to its original system definition? Your edits will be lost.`)) return
  saving.value = true
  try {
    await restoreReport(form.id)
    showToast('Report reset to defaults')
    await load()
  } catch (e) {
    showToast(e.message || 'Could not reset report', 'info')
  } finally {
    saving.value = false
  }
}

async function deleteThis() {
  if (!form.id || form.isSystem) return
  if (!confirm(`Delete “${form.name}”?`)) return
  saving.value = true
  try {
    await removeReport(form.id)
    showToast('Report deleted')
    router.push('/custom')
  } catch (e) {
    showToast(e.message || 'Could not delete report', 'info')
  } finally {
    saving.value = false
  }
}
</script>


<template>
  <div class="page">
    <RouterLink to="/custom" class="back"><AppIcon name="arrow-left" :size="16" :stroke="2.2" /> Back to Custom Reports</RouterLink>

    <StatePanel v-if="pageState === 'loading'" kind="loading" title="Loading report…" />
    <StatePanel v-else-if="pageState === 'error'" kind="error" title="Could not load report" :message="pageError" @retry="load">
      <RouterLink to="/custom" class="btn">Back to Custom Reports</RouterLink>
    </StatePanel>

    <template v-else>
    <header class="page-header">
      <div>
        <h1 class="page-title">
          {{ form.id ? (form.isSystem ? 'Customise system report' : 'Edit custom report') : 'New custom report' }}
          <span v-if="form.isSystem" class="badge badge-blue sys-badge">System</span>
        </h1>
        <p class="page-sub">
          <template v-if="form.isSystem">
            Changes are saved to this system report. Use “Reset to defaults” to restore the original definition.
          </template>
          <template v-else>Connect an API or paste JSON, map attributes, then compose charts and widgets — no deploy needed.</template>
        </p>
      </div>
      <div class="row row-wrap">
        <button v-if="form.id && form.isSystem" class="btn" :disabled="saving" @click="resetToDefaults">Reset to defaults</button>
        <button
          v-if="form.id"
          class="btn btn-danger-ghost"
          :disabled="saving || form.isSystem"
          :title="form.isSystem ? 'System reports cannot be deleted' : 'Delete report'"
          @click="deleteThis"
        >
          <AppIcon name="trash" :size="15" /> Delete
        </button>
        <RouterLink to="/custom" class="btn">Cancel</RouterLink>
        <button class="btn btn-primary" :disabled="saving" @click="save">
          <AppIcon name="check" :size="16" :stroke="2.4" /> {{ saving ? 'Saving…' : 'Save report' }}
        </button>
      </div>
    </header>

    <div class="layout">
      <form class="card form" @submit.prevent="save">
        <!-- 1 Details -->
        <section class="block">
          <h2 class="card-title">1 · Details</h2>
          <div class="field">
            <label for="cr-name">Report name</label>
            <input
              id="cr-name"
              v-model="form.name"
              class="input"
              :class="{ bad: touched && !form.name.trim() }"
              placeholder="e.g. Grievances by category from live API"
              @blur="touched = true"
            />
            <span v-if="touched && !form.name.trim()" class="err">Give your report a name.</span>
          </div>
          <div class="field">
            <label for="cr-desc">Description <span class="opt">(optional)</span></label>
            <textarea id="cr-desc" v-model="form.description" class="textarea" rows="2" placeholder="What is this report for?" />
          </div>
          <div class="field">
            <label for="cr-cat">Category</label>
            <select id="cr-cat" v-model="form.category" class="select">
              <option v-for="c in CATEGORIES" :key="c.id" :value="c.id">{{ c.label }}</option>
            </select>
          </div>
        </section>

        <!-- 2 Data source -->
        <section class="block">
          <h2 class="card-title">2 · Data source</h2>
          <div class="source-tabs" role="tablist">
            <button type="button" class="stab" :class="{ on: form.sourceType === 'api' }" @click="form.sourceType = 'api'">
              <AppIcon name="external" :size="15" /> API endpoint
            </button>
            <button type="button" class="stab" :class="{ on: form.sourceType === 'json' }" @click="form.sourceType = 'json'">
              <AppIcon name="library" :size="15" /> Sample JSON
            </button>
            <button type="button" class="stab" :class="{ on: form.sourceType === 'library' }" @click="form.sourceType = 'library'">
              <AppIcon name="grid" :size="15" /> Library dataset
            </button>
          </div>

          <template v-if="form.sourceType === 'api'">
            <div class="two">
              <div class="field grow">
                <label for="cr-api">Endpoint URL</label>
                <input
                  id="cr-api"
                  v-model="form.apiEndpoint"
                  class="input"
                  placeholder="/api/… or https://…"
                />
              </div>
              <div class="field">
                <label for="cr-method">Method</label>
                <select id="cr-method" v-model="form.apiMethod" class="select">
                  <option>GET</option>
                </select>
              </div>
            </div>
            <p class="hint">
              Relative URLs go through the configured API base (Vite proxies <code>/api</code> to the backend on port 8000).
              Absolute URLs need CORS enabled on the remote service.
            </p>
            <div class="row row-wrap">
              <button type="button" class="btn btn-primary" :disabled="fetchState.loading" @click="loadFromApi()">
                <AppIcon name="search" :size="15" />
                {{ fetchState.loading ? 'Fetching…' : 'Fetch & inspect' }}
              </button>
              <span v-if="fetchState.ok" class="ok-pill"><AppIcon name="check" :size="13" /> Loaded</span>
              <span v-if="fetchState.error" class="err">{{ fetchState.error }}</span>
            </div>
          </template>

          <template v-else-if="form.sourceType === 'json'">
            <div class="field">
              <label for="cr-json">Paste sample JSON response</label>
              <textarea
                id="cr-json"
                v-model="form.sampleJson"
                class="textarea code"
                rows="10"
                spellcheck="false"
                placeholder='{ "data": [ { "label": "…", "value": 1 } ] }'
              />
              <span v-if="jsonError" class="err">{{ jsonError }}</span>
              <span class="hint">
                The pasted JSON is stored with the report and used to map fields here. Whether the backend can render
                a JSON-source report depends on its data-source support — API endpoints always work.
              </span>
            </div>
            <div class="row row-wrap">
              <button type="button" class="btn btn-primary" @click="ingestJson(form.sampleJson)">
                <AppIcon name="check" :size="15" /> Parse & map fields
              </button>
            </div>
          </template>

          <template v-else>
            <div class="field">
              <label for="cr-base">Library dataset</label>
              <select id="cr-base" v-model="form.baseReportId" class="select">
                <option v-for="s in sources" :key="s.id" :value="s.id">{{ s.title }}</option>
              </select>
            </div>
            <p v-if="!sources.length" class="hint">No reports in this category yet.</p>
            <p v-else-if="baseState.loading" class="hint">Loading dataset…</p>
            <p v-else-if="baseState.error" class="err">{{ baseState.error }}</p>
            <p v-else-if="!baseSpec" class="hint">This report has no chart data to reuse. Pick another dataset.</p>
            <p v-else class="hint">
              Series: {{ baseSpec.datasets?.map((d) => d.label).join(', ') || '—' }} · {{ baseSpec.labels?.length || 0 }} data points
            </p>
          </template>
        </section>

        <!-- 3 Field mapping (API / JSON) -->
        <section v-if="form.sourceType !== 'library'" class="block">
          <h2 class="card-title">3 · Map attributes</h2>
          <p class="hint">{{ rowCount }} row{{ rowCount === 1 ? '' : 's' }} · {{ activeFields.length }} fields detected</p>

          <div class="field">
            <label for="cr-path">Records path</label>
            <select id="cr-path" v-model="form.dataPath" class="select" @change="syncWidgetsFromMapping">
              <option v-for="p in arrayPaths" :key="p.path" :value="p.path">
                {{ p.path }} ({{ p.length }} rows)
              </option>
              <option v-if="!arrayPaths.length" value="$">Root</option>
            </select>
          </div>

          <div class="field">
            <span class="field-label">Available fields</span>
            <div class="chips">
              <button
                v-for="f in activeFields"
                :key="f.key"
                type="button"
                class="chip"
                :class="{ num: f.type === 'number' }"
                :title="String(f.sample)"
                @click="toggleField('valueFields', f.key)"
              >
                <strong>{{ f.key }}</strong>
                <small>{{ f.type }}</small>
              </button>
            </div>
          </div>

          <div class="two">
            <div class="field">
              <label for="cr-label">Default label field</label>
              <select id="cr-label" v-model="form.labelField" class="select" @change="syncWidgetsFromMapping">
                <option v-for="f in labelFieldOptions" :key="f.key" :value="f.key">{{ f.key }}</option>
              </select>
            </div>
            <div class="field">
              <label for="cr-val">Default value field</label>
              <select id="cr-val" v-model="form.valueField" class="select" @change="syncWidgetsFromMapping">
                <option v-for="f in numberFieldOptions" :key="f.key" :value="f.key">{{ f.key }}</option>
              </select>
            </div>
          </div>

          <div class="field">
            <span class="field-label">Default series (charts)</span>
            <div class="checks">
              <label v-for="f in numberFieldOptions" :key="f.key" class="checkline">
                <input type="checkbox" :checked="form.valueFields.includes(f.key)" @change="toggleField('valueFields', f.key)" />
                {{ f.key }}
              </label>
            </div>
          </div>
        </section>

        <!-- 4 Widgets -->
        <section class="block">
          <h2 class="card-title">{{ form.sourceType === 'library' ? '3' : '4' }} · Widgets & graphs</h2>
          <p class="hint">Add one or more visuals for this dataset. Select a widget to configure it.</p>

          <div class="palette">
            <button v-for="p in widgetPalette" :key="p.label" type="button" class="pal" @click="addWidget(p)">
              <AppIcon :name="p.icon" :size="16" />
              {{ p.label }}
            </button>
          </div>

          <div v-if="form.widgets.length" class="widget-list">
            <button
              v-for="(w, i) in form.widgets"
              :key="w.id"
              type="button"
              class="witem"
              :class="{ on: w.id === activeWidgetId }"
              @click="activeWidgetId = w.id"
            >
              <span class="widx">{{ i + 1 }}</span>
              <span class="wmeta">
                <strong>{{ w.title || w.type }}</strong>
                <small>{{ w.type }}{{ w.chartType ? ` · ${w.chartType}` : '' }}</small>
              </span>
              <button type="button" class="icon-btn sm del" aria-label="Remove widget" @click.stop="removeWidget(w.id)">
                <AppIcon name="trash" :size="14" />
              </button>
            </button>
          </div>

          <template v-if="activeWidget">
            <div class="field">
              <label :for="`w-title-${activeWidget.id}`">Widget title</label>
              <input :id="`w-title-${activeWidget.id}`" v-model="activeWidget.title" class="input" placeholder="Optional title" />
            </div>

            <template v-if="activeWidget.type === 'chart'">
              <div class="field">
                <span class="field-label">Chart type</span>
                <div class="types">
                  <button
                    v-for="t in chartTypes"
                    :key="t.id"
                    type="button"
                    class="type"
                    :class="{ on: activeWidget.chartType === t.id }"
                    @click="activeWidget.chartType = t.id"
                  >
                    <AppIcon :name="t.icon" :size="18" />
                    {{ t.label }}
                  </button>
                </div>
              </div>
              <div v-if="form.sourceType !== 'library'" class="two">
                <div class="field">
                  <label>Label field</label>
                  <select v-model="activeWidget.labelField" class="select">
                    <option v-for="f in labelFieldOptions" :key="f.key" :value="f.key">{{ f.key }}</option>
                  </select>
                </div>
                <div class="field">
                  <label>Sort</label>
                  <select v-model="activeWidget.sort" class="select">
                    <option value="none">Source order</option>
                    <option value="desc">Highest first</option>
                    <option value="asc">Lowest first</option>
                  </select>
                </div>
              </div>
              <div v-if="form.sourceType !== 'library'" class="field">
                <span class="field-label">Value series</span>
                <div class="checks">
                  <label v-for="f in numberFieldOptions" :key="f.key" class="checkline">
                    <input
                      type="checkbox"
                      :checked="activeWidget.valueFields.includes(f.key)"
                      @change="toggleField('valueFields', f.key)"
                    />
                    {{ f.key }}
                  </label>
                </div>
              </div>
              <div class="two">
                <div class="field">
                  <label>Show</label>
                  <select v-model.number="activeWidget.limit" class="select">
                    <option :value="0">All data points</option>
                    <option :value="3">Top 3</option>
                    <option :value="5">Top 5</option>
                    <option :value="10">Top 10</option>
                  </select>
                </div>
                <label class="check stack-check" :class="{ off: !canStack }">
                  <button
                    type="button"
                    class="switch"
                    :class="{ on: activeWidget.stacked }"
                    :disabled="!canStack"
                    role="switch"
                    :aria-checked="activeWidget.stacked"
                    @click="activeWidget.stacked = !activeWidget.stacked"
                  />
                  Stack series
                </label>
              </div>
            </template>

            <template v-else-if="activeWidget.type === 'kpis' && form.sourceType !== 'library'">
              <div class="field">
                <span class="field-label">KPI fields</span>
                <div class="checks">
                  <label v-for="f in numberFieldOptions" :key="f.key" class="checkline">
                    <input type="checkbox" :checked="activeWidget.kpiFields.includes(f.key)" @change="toggleField('kpiFields', f.key)" />
                    {{ f.key }}
                  </label>
                </div>
              </div>
            </template>

            <template v-else-if="activeWidget.type === 'table' && form.sourceType !== 'library'">
              <div class="field">
                <span class="field-label">Columns</span>
                <div class="checks">
                  <label v-for="f in activeFields" :key="f.key" class="checkline">
                    <input
                      type="checkbox"
                      :checked="activeWidget.columnFields.includes(f.key)"
                      @change="toggleField('columnFields', f.key)"
                    />
                    {{ f.key }}
                  </label>
                </div>
              </div>
            </template>

            <template v-else-if="activeWidget.type === 'bignumber' && form.sourceType !== 'library'">
              <div class="field">
                <label>Value field</label>
                <select v-model="activeWidget.valueField" class="select">
                  <option v-for="f in numberFieldOptions" :key="f.key" :value="f.key">{{ f.key }}</option>
                </select>
              </div>
            </template>

            <p v-if="form.sourceType === 'library' && activeWidget.type !== 'chart'" class="hint">
              KPI, table and big-number widgets need an API or pasted JSON source.
            </p>
          </template>
        </section>

        <section class="block last">
          <h2 class="card-title">Geography</h2>
          <p class="hint">Plot location-based datasets on a map by configuring zone or woreda boundaries.</p>
          <div class="row row-wrap">
            <RouterLink to="/custom/map-zone" class="btn btn-sm"><AppIcon name="map" :size="14" /> Map by zone</RouterLink>
            <RouterLink to="/custom/map-woreda" class="btn btn-sm"><AppIcon name="map-pin" :size="14" /> Map by woreda</RouterLink>
          </div>
        </section>
      </form>

      <!-- Live preview -->
      <aside class="preview-col">
        <div class="card preview">
          <div class="p-head">
            <span class="section-label">Live preview</span>
            <h2 class="p-title">{{ form.name || 'Untitled report' }}</h2>
            <p v-if="form.description" class="card-sub">{{ form.description }}</p>
            <p class="hint">
              {{ form.sourceType === 'library' ? 'Library dataset' : form.sourceType === 'api' ? form.apiEndpoint : 'Sample JSON' }}
              · {{ form.widgets.length }} widget{{ form.widgets.length === 1 ? '' : 's' }}
            </p>
            <p v-if="usingServerPreview" class="hint">
              Showing the last saved render from the server — the data source can't be read from the browser, so edits aren't previewed live.
            </p>
          </div>
          <div class="p-body">
            <div v-for="item in widgetSpecs" :key="item.widget.id" class="p-widget">
              <div v-if="item.widget.title" class="pw-title">{{ item.widget.title }}</div>
              <div class="pw-viz">
                <SpecView :spec="item.spec" :height="item.widget.type === 'kpis' ? 180 : 280" />
              </div>
            </div>
          </div>
        </div>
      </aside>
    </div>
    </template>
  </div>
</template>

<style scoped>
.sys-badge {
  vertical-align: middle;
  margin-left: 8px;
}

.hint code {
  font-family: ui-monospace, Menlo, Consolas, monospace;
  font-size: 12px;
  background: var(--border-soft);
  padding: 1px 6px;
  border-radius: 5px;
}

.back {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 18px;
  color: var(--muted);
  font-weight: 600;
}

.back:hover {
  color: var(--green-700);
}

.layout {
  display: grid;
  grid-template-columns: minmax(360px, 520px) minmax(0, 1fr);
  gap: 22px;
  align-items: start;
}

.form {
  padding: 4px 22px;
}

.block {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 20px 0;
  border-bottom: 1px solid var(--border-soft);
}

.block.last {
  border-bottom: none;
}

.two {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.two .grow {
  grid-column: 1 / 2;
}

.opt {
  color: var(--muted-2);
  font-weight: 500;
}

.input.bad {
  border-color: var(--danger);
}

.err {
  color: var(--danger);
  font-size: 12px;
}

.ok-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--green-700);
  font-weight: 600;
  font-size: 13px;
}

.source-tabs {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.stab {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px 8px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: #fff;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--muted);
}

.stab.on {
  border-color: var(--green-600);
  background: var(--green-50);
  color: var(--green-700);
  box-shadow: 0 0 0 3px rgba(27, 122, 78, 0.12);
}

.textarea.code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  line-height: 1.45;
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.chip {
  display: inline-flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: #fff;
  text-align: left;
}

.chip.num {
  border-color: #cfe6d9;
  background: var(--green-50);
}

.chip strong {
  font-size: 12.5px;
}

.chip small {
  color: var(--muted);
  font-size: 11px;
}

.checks {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px 12px;
}

.checkline {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 500;
}

.palette {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.pal {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border: 1px dashed #c5d5cb;
  border-radius: 12px;
  background: #f8fbf9;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--green-700);
}

.pal:hover {
  border-style: solid;
  border-color: var(--green-600);
  background: var(--green-50);
}

.widget-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.witem {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: #fff;
  text-align: left;
}

.witem.on {
  border-color: var(--green-600);
  background: var(--green-50);
  box-shadow: 0 0 0 3px rgba(27, 122, 78, 0.1);
}

.widx {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border-radius: 8px;
  background: var(--text);
  color: #fff;
  font-size: 12px;
  font-weight: 700;
}

.wmeta {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
}

.wmeta small {
  color: var(--muted);
}

.icon-btn.sm {
  width: 30px;
  height: 30px;
  border-radius: 8px;
}

.icon-btn.del:hover {
  background: var(--danger-50);
  color: var(--danger);
}

.types {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}

.type {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 12px 6px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: #fff;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--muted);
}

.type.on {
  border-color: var(--green-600);
  background: var(--green-50);
  color: var(--green-700);
  box-shadow: 0 0 0 3px rgba(27, 122, 78, 0.12);
}

.check {
  display: flex;
  align-items: center;
  gap: 10px;
  font-weight: 600;
  font-size: 13px;
}

.check.off {
  opacity: 0.55;
}

.stack-check {
  align-self: end;
  padding-bottom: 8px;
}

.preview-col {
  min-width: 0;
}

.preview {
  position: sticky;
  top: calc(var(--topbar-h) + 18px);
  padding: 22px;
}

.p-head {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 16px;
}

.p-title {
  font-family: var(--font-display);
  font-size: 22px;
  font-weight: 600;
}

.p-body {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.p-widget {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px;
  border: 1px solid var(--border-soft);
  border-radius: 14px;
  background: #fff;
}

.pw-title {
  font-weight: 700;
  font-size: 14px;
}

.pw-viz {
  min-height: 160px;
}

@media (max-width: 1100px) {
  .layout {
    grid-template-columns: 1fr;
  }
  .preview {
    position: static;
  }
  .source-tabs {
    grid-template-columns: 1fr;
  }
}
</style>
