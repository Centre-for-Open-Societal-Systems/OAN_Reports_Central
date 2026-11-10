<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import AppIcon from '../components/AppIcon.vue'
import ReportCard from '../components/ReportCard.vue'
import StatePanel from '../components/StatePanel.vue'
import SpecView from '../components/charts/SpecView.vue'
import SpecTable from '../components/charts/SpecTable.vue'
import { getCategory, getReport, reportsByCategory } from '../data/reports_catalog'
import { getReportData } from '../api/reports'
import { specInsights, specToTable } from '../utils/specHelpers'
import { fmtValue } from '../utils/format'
import { showToast } from '../composables/useToast'

const route = useRoute()
const reportId = computed(() => route.params.reportId)

/* ----- filters (sent to the API as query params) ----- */
const range = ref('90d')
const region = ref('all')
const compare = ref('none')
const params = computed(() => ({
  range: range.value,
  region: region.value === 'all' ? undefined : region.value,
  compare: compare.value === 'none' ? undefined : compare.value,
}))

/* ----- data ----- */
const state = ref('loading') // loading | ready | error
const error = ref('')
const result = ref(null)
let controller = null

async function load() {
  controller?.abort()
  controller = new AbortController()
  state.value = 'loading'
  error.value = ''
  try {
    result.value = await getReportData(reportId.value, params.value, { signal: controller.signal })
    state.value = 'ready'
  } catch (e) {
    if (e?.name === 'AbortError') return
    result.value = null
    error.value = e.message || 'Could not load report data.'
    state.value = 'error'
  }
}

onMounted(load)
watch(params, load)
onBeforeUnmount(() => controller?.abort())

const notFound = computed(() => state.value === 'error' && /404|not found/i.test(error.value))

const report = computed(() => result.value?.report || getReport(reportId.value) || null)
const category = computed(() => (report.value ? getCategory(report.value.category) : null))
const widgets = computed(() => (result.value?.widgets || []).filter((w) => w.spec))
const primary = computed(() => widgets.value[0] || null)
const extras = computed(() => widgets.value.slice(1))
const spec = computed(() => primary.value?.spec || null)
const insights = computed(() => specInsights(spec.value))
const table = computed(() => specToTable(spec.value))
const upstream = computed(() => result.value?.meta?.upstream || { ok: true })
const asOf = computed(() => result.value?.meta?.asOf)
const related = computed(() =>
  report.value ? reportsByCategory(report.value.category).filter((r) => r.id !== report.value.id).slice(0, 4) : [],
)

const mainHeight = computed(() => (spec.value?.kind === 'chart' ? 420 : spec.value?.kind === 'gauge' ? 300 : undefined))
const extraHeight = (s) => (s.kind === 'chart' ? 300 : s.kind === 'gauge' ? 240 : undefined)

function exportCsv() {
  if (!table.value) return
  const { columns, rows } = table.value
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const lines = [columns.map((c) => esc(c.label)).join(',')]
  for (const row of rows) lines.push(columns.map((c) => esc(row[c.key])).join(','))
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${reportId.value}.csv`
  a.click()
  URL.revokeObjectURL(url)
  showToast('CSV exported')
}
</script>

<template>
  <div class="page">
    <RouterLink
      :to="category ? { name: 'library-category', params: { category: category.id } } : { name: 'library-home' }"
      class="back"
    >
      <AppIcon name="arrow-left" :size="16" :stroke="2.2" /> Back to {{ category ? category.label : 'library' }}
    </RouterLink>

    <!-- initial load / hard failure (no report meta to show) -->
    <StatePanel v-if="!report && state === 'loading'" kind="loading" title="Loading report…" />
    <StatePanel
      v-else-if="!report && state === 'error'"
      kind="error"
      :title="notFound ? 'Report not found' : 'Could not load report'"
      :message="error"
      @retry="load"
    >
      <RouterLink :to="{ name: 'library-home' }" class="btn">Back to library</RouterLink>
    </StatePanel>

    <template v-else-if="report">
      <header class="page-header head">
        <div>
          <div class="row crumbs">
            <span v-if="report.tag" class="tag">{{ report.tag }}</span>
            <span v-if="report.is_system" class="badge badge-blue">System report</span>
            <span v-if="category" class="meta"><AppIcon :name="category.icon || 'library'" :size="14" /> {{ category.label }}</span>
            <span v-if="report.frequency" class="meta">
              <AppIcon name="clock" :size="14" /> Refreshed {{ String(report.frequency).toLowerCase() }}
            </span>
          </div>
          <h1 class="page-title">{{ report.title }}</h1>
          <p class="page-sub">{{ report.description }}</p>
        </div>
        <div class="row row-wrap">
          <button class="btn" :disabled="!table" @click="exportCsv"><AppIcon name="download" :size="16" /> Export CSV</button>
          <RouterLink :to="{ path: '/schedule', query: { report: report.id } }" class="btn">
            <AppIcon name="calendar" :size="16" /> Schedule
          </RouterLink>
          <RouterLink :to="{ path: '/custom/new', query: { id: report.id } }" class="btn btn-primary">
            <AppIcon name="sliders" :size="16" /> Customise
          </RouterLink>
        </div>
      </header>

      <!-- filters -->
      <section class="filters card">
        <span class="f-title"><AppIcon name="filter" :size="15" /> Filters</span>
        <div class="field">
          <label for="f-range">Period</label>
          <select id="f-range" v-model="range" class="select">
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
            <option value="12m">Last 12 months</option>
            <option value="ytd">Year to date</option>
          </select>
        </div>
        <div class="field">
          <label for="f-region">Region</label>
          <select id="f-region" v-model="region" class="select">
            <option value="all">All regions</option>
            <option>Oromia</option>
            <option>Amhara</option>
            <option>Sidama</option>
            <option>South Ethiopia</option>
            <option>Tigray</option>
          </select>
        </div>
        <div class="field">
          <label for="f-compare">Compare to</label>
          <select id="f-compare" v-model="compare" class="select">
            <option value="none">No comparison</option>
            <option value="prev">Previous period</option>
            <option value="year">Same period last year</option>
          </select>
        </div>
        <p class="f-note">
          <AppIcon name="info" :size="14" /> Sent to the API as <code>range</code>, <code>region</code>, <code>compare</code>; unsupported filters are ignored by the backend.
        </p>
      </section>

      <div v-if="state === 'ready' && !upstream.ok" class="warn-banner" role="alert">
        <AppIcon name="info" :size="16" />
        <span>
          The upstream data source reported a problem{{ upstream.error ? `: ${upstream.error}` : '.' }} Figures below may be missing or stale.
        </span>
      </div>

      <StatePanel v-if="state === 'loading'" kind="loading" title="Loading report data…" />
      <StatePanel v-else-if="state === 'error'" kind="error" title="Could not load report data" :message="error" @retry="load" />
      <StatePanel
        v-else-if="!widgets.length"
        kind="empty"
        title="No data for this report yet"
        message="The API returned no widgets. Check the report's data source or add a widget in the builder."
      >
        <RouterLink :to="{ path: '/custom/new', query: { id: report.id } }" class="btn">Open in builder</RouterLink>
      </StatePanel>

      <template v-else>
        <!-- headline stats -->
        <section v-if="insights.length" class="insights">
          <div v-for="s in insights" :key="s.label" class="ins card">
            <span class="ins-l">{{ s.label }}</span>
            <span class="ins-v">{{ s.value }}</span>
            <span v-if="s.hint" class="ins-h">{{ s.hint }}</span>
          </div>
        </section>

        <!-- primary visual -->
        <section class="card main-panel">
          <div class="panel-head">
            <h2 class="card-title">{{ primary.widget.title || report.title }}</h2>
            <span v-if="asOf" class="card-sub">As of {{ fmtValue(asOf, 'datetime') }}</span>
          </div>
          <SpecView :spec="spec" :height="mainHeight" />
        </section>

        <!-- extra widgets + any panels nested in the primary spec -->
        <section v-if="extras.length || spec?.extra?.length" class="extras" :class="{ single: extras.length + (spec?.extra?.length || 0) === 1 }">
          <div v-for="w in extras" :key="w.widget.id || w.widget.title" class="card panel">
            <div class="panel-head"><h2 class="card-title">{{ w.widget.title }}</h2></div>
            <SpecView :spec="w.spec" :height="extraHeight(w.spec)" />
          </div>
          <div v-for="ex in spec?.extra || []" :key="ex.title" class="card panel">
            <div class="panel-head"><h2 class="card-title">{{ ex.title }}</h2></div>
            <SpecView :spec="ex.spec" :height="extraHeight(ex.spec)" />
          </div>
        </section>

        <!-- data table -->
        <section v-if="table && spec.kind !== 'table' && table.rows.length" class="card table-card">
          <div class="panel-head pad">
            <h2 class="card-title">Data</h2>
            <span class="card-sub">{{ table.rows.length }} rows</span>
          </div>
          <SpecTable :columns="table.columns" :rows="table.rows" />
        </section>
      </template>

      <!-- related -->
      <section v-if="related.length" class="related">
        <h2 class="section-label">More in {{ category?.label }}</h2>
        <div class="rel-grid">
          <ReportCard v-for="r in related" :key="r.id" :report="r" />
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.f-note code {
  font-family: ui-monospace, Menlo, Consolas, monospace;
  font-size: 11.5px;
  background: var(--border-soft);
  padding: 0 5px;
  border-radius: 4px;
}

.back {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 18px;
  color: var(--muted);
  font-weight: 600;
  transition: color 0.15s, gap 0.15s;
}

.back:hover {
  color: var(--green-700);
  gap: 11px;
}

.crumbs {
  flex-wrap: wrap;
  margin-bottom: 12px;
  gap: 14px;
}

.meta {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--muted);
  font-size: 12.5px;
}

.filters {
  display: flex;
  align-items: flex-end;
  gap: 16px;
  flex-wrap: wrap;
  padding: 14px 18px;
  margin-bottom: 18px;
}

.filters .field {
  width: 190px;
}

.f-title {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 38px;
  font-weight: 700;
  color: var(--text-2);
}

.f-note {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
  align-self: center;
  font-size: 12px;
  color: var(--muted);
  max-width: 340px;
}

.warn-banner {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  margin-bottom: 18px;
  border-radius: 12px;
  background: var(--warn-50);
  color: var(--warn);
  font-weight: 600;
  font-size: 13.5px;
}

.state-gap {
  margin-top: 0;
}

.insights {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
  margin-bottom: 18px;
}

.ins {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 14px 18px;
}

.ins-l {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--muted);
}

.ins-v {
  font-family: var(--font-display);
  font-size: 24px;
  font-weight: 600;
  line-height: 1.2;
}

.ins-h {
  font-size: 12.5px;
  color: var(--green-700);
  font-weight: 600;
}

.main-panel,
.panel {
  padding: 20px 22px 22px;
}

.panel-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.panel-head.pad {
  padding: 18px 22px 12px;
  margin: 0;
}

.extras {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px;
  margin-top: 18px;
}

.extras.single {
  grid-template-columns: 1fr;
}

.table-card {
  margin-top: 18px;
  overflow: hidden;
}

.related {
  margin-top: 32px;
}

.rel-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 18px;
  margin-top: 12px;
}

@media (max-width: 1280px) {
  .rel-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 900px) {
  .insights,
  .extras {
    grid-template-columns: 1fr;
  }
  .f-note {
    margin-left: 0;
  }
}

@media (max-width: 640px) {
  .rel-grid {
    grid-template-columns: 1fr;
  }
  .filters .field {
    width: 100%;
  }
}
</style>
