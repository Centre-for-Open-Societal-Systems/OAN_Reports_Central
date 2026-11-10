<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import AppIcon from '../components/AppIcon.vue'
import SpecView from '../components/charts/SpecView.vue'
import StatePanel from '../components/StatePanel.vue'
import { listReports } from '../api/reports'
import { reportSourceKind } from '../api/mappers'
import { removeReport, restoreReport } from '../composables/useStores'
import { getPreview, loadPreview } from '../composables/useCatalog'
import { getCategory } from '../data/reports_catalog'
import { fmtValue } from '../utils/format'
import { showToast } from '../composables/useToast'

const router = useRouter()
const filter = ref('')
const scope = ref('custom') // custom | system | all

const SOURCE_LABELS = { library: 'Library', api: 'API', json: 'JSON' }

/* ----- data (every report, including inactive ones) ----- */
const all = ref([])
const state = ref('loading') // loading | ready | error
const error = ref('')
const busyId = ref('')

async function load() {
  state.value = 'loading'
  error.value = ''
  try {
    const res = await listReports({ includeInactive: true })
    all.value = Array.isArray(res) ? res : res?.items || []
    state.value = 'ready'
  } catch (e) {
    error.value = e.message || 'Could not load reports.'
    state.value = 'error'
  }
}
onMounted(load)

const titleOf = (id) => all.value.find((r) => r.id === id)?.title

function sourceText(c) {
  const kind = reportSourceKind(c)
  if (kind === 'api') return c.api_endpoint || 'API'
  if (kind === 'json') return 'Pasted JSON'
  const base = c.base_report_id && c.base_report_id !== c.id ? titleOf(c.base_report_id) : null
  return base || 'Library'
}

const counts = computed(() => ({
  custom: all.value.filter((c) => !c.is_system).length,
  system: all.value.filter((c) => c.is_system).length,
  all: all.value.length,
}))

const items = computed(() => {
  const q = filter.value.trim().toLowerCase()
  return all.value
    .filter((c) => scope.value === 'all' || (scope.value === 'system' ? c.is_system : !c.is_system))
    .filter(
      (c) =>
        !q ||
        c.title?.toLowerCase().includes(q) ||
        c.description?.toLowerCase().includes(q) ||
        c.api_endpoint?.toLowerCase().includes(q),
    )
    .map((c) => {
      const inline = c.preview_spec || c.widgets?.find((w) => w?.spec)?.spec || null
      const preview = getPreview(c.id)
      return {
        ...c,
        spec: inline || preview.spec,
        previewState: inline ? 'ready' : preview.status,
        cat: getCategory(c.category),
        sourceKind: SOURCE_LABELS[reportSourceKind(c)],
        sourceText: sourceText(c),
        widgetCount: c.widgets?.length || 1,
      }
    })
})

// Fetch thumbnails for whatever is currently listed (cached per report).
watch(
  items,
  (list) => list.forEach((c) => c.previewState === 'idle' && loadPreview(c.id)),
  { immediate: true },
)

const open = (id) => router.push({ path: '/custom/new', query: { id } })

async function remove(c) {
  if (c.is_system) return
  if (!confirm(`Delete “${c.title}”?`)) return
  busyId.value = c.id
  try {
    await removeReport(c.id)
    all.value = all.value.filter((x) => x.id !== c.id)
    showToast('Report deleted')
  } catch (e) {
    showToast(e.message || 'Could not delete report', 'info')
  } finally {
    busyId.value = ''
  }
}

async function reset(c) {
  if (!c.is_system) return
  if (!confirm(`Reset “${c.title}” to its original system definition? Your edits will be lost.`)) return
  busyId.value = c.id
  try {
    await restoreReport(c.id)
    await load()
    showToast('Report reset to defaults')
  } catch (e) {
    showToast(e.message || 'Could not reset report', 'info')
  } finally {
    busyId.value = ''
  }
}
</script>

<template>
  <div class="page">
    <header class="page-header">
      <div>
        <h1 class="page-title">Custom Reports</h1>
        <p class="page-sub">Build reports from an API, pasted JSON, or library data — or customise any system report. Changes are saved to the backend.</p>
      </div>
      <RouterLink to="/custom/new" class="btn btn-primary">
        <AppIcon name="plus" :size="16" :stroke="2.4" /> New Custom Report
      </RouterLink>
    </header>

    <section class="map-links">
      <RouterLink to="/custom/map-zone" class="map-card card">
        <span class="mi"><AppIcon name="map" :size="20" /></span>
        <span class="mt">
          <strong>Map settings · Zone</strong>
          <small>Configure choropleth maps by zone</small>
        </span>
        <AppIcon name="chevron-right" :size="18" class="mc" />
      </RouterLink>
      <RouterLink to="/custom/map-woreda" class="map-card card">
        <span class="mi"><AppIcon name="map-pin" :size="20" /></span>
        <span class="mt">
          <strong>Map settings · Woreda</strong>
          <small>Configure choropleth maps by woreda</small>
        </span>
        <AppIcon name="chevron-right" :size="18" class="mc" />
      </RouterLink>
    </section>

    <div class="bar">
      <div class="row row-wrap">
        <div class="field find">
          <input v-model="filter" class="input" type="search" placeholder="Filter reports" aria-label="Filter reports" />
        </div>
        <div class="segmented" role="group" aria-label="Report scope">
          <button :class="{ active: scope === 'custom' }" @click="scope = 'custom'">Custom ({{ counts.custom }})</button>
          <button :class="{ active: scope === 'system' }" @click="scope = 'system'">System ({{ counts.system }})</button>
          <button :class="{ active: scope === 'all' }" @click="scope = 'all'">All ({{ counts.all }})</button>
        </div>
      </div>
      <span v-if="state === 'ready'" class="count">{{ items.length }} report{{ items.length === 1 ? '' : 's' }}</span>
    </div>

    <StatePanel v-if="state === 'loading'" kind="loading" title="Loading reports…" />
    <StatePanel v-else-if="state === 'error'" kind="error" title="Could not load reports" :message="error" @retry="load" />

    <section v-else-if="items.length" class="grid">
      <article v-for="c in items" :key="c.id" class="card item" :class="{ busy: busyId === c.id }" @click="open(c.id)">
        <div class="i-head">
          <div class="i-titles">
            <div class="row row-wrap">
              <span v-if="c.cat" class="tag">{{ c.cat.label }}</span>
              <span v-if="c.is_system" class="badge badge-blue">System</span>
              <span v-if="c.is_active === false" class="badge badge-orange">Hidden</span>
            </div>
            <h3 class="i-title">{{ c.title }}</h3>
            <p class="i-desc">{{ c.description || 'No description' }}</p>
          </div>
        </div>
        <div class="i-prev">
          <SpecView v-if="c.spec" :spec="c.spec" mini />
          <div v-else class="no-prev">{{ c.previewState === 'error' ? 'Preview unavailable' : 'Loading preview…' }}</div>
        </div>
        <div class="i-foot">
          <span class="info">
            <AppIcon :name="c.chart_type === 'line' ? 'line-chart' : c.chart_type === 'doughnut' ? 'pie-chart' : 'bar-chart'" :size="14" />
            {{ c.sourceKind }} · {{ c.widgetCount }} widget{{ c.widgetCount === 1 ? '' : 's' }} · {{ c.sourceText }}
          </span>
          <span class="actions" @click.stop>
            <button class="icon-btn sm" :aria-label="c.is_system ? 'Customise' : 'Edit'" :title="c.is_system ? 'Customise' : 'Edit'" @click="open(c.id)">
              <AppIcon name="pencil" :size="14" />
            </button>
            <button
              v-if="c.is_system"
              class="icon-btn sm"
              aria-label="Reset to defaults"
              title="Reset to system defaults"
              :disabled="busyId === c.id"
              @click="reset(c)"
            >
              <AppIcon name="play" :size="14" />
            </button>
            <button
              class="icon-btn sm del"
              aria-label="Delete"
              :title="c.is_system ? 'System reports cannot be deleted' : 'Delete'"
              :disabled="c.is_system || busyId === c.id"
              @click="remove(c)"
            >
              <AppIcon name="trash" :size="14" />
            </button>
          </span>
        </div>
        <div v-if="c.owner || c.updated_at" class="i-meta">
          {{ [c.owner, c.updated_at ? `updated ${fmtValue(c.updated_at, 'date')}` : ''].filter(Boolean).join(' · ') }}
        </div>
      </article>
    </section>

    <div v-else class="card empty">
      <AppIcon name="sliders" :size="28" />
      <h3>{{ filter ? 'No matching reports' : scope === 'system' ? 'No system reports' : 'No custom reports yet' }}</h3>
      <p v-if="!filter">Connect an API or paste JSON, map attributes, and add charts or KPI widgets.</p>
      <RouterLink to="/custom/new" class="btn btn-primary">+ New Custom Report</RouterLink>
    </div>
  </div>
</template>

<style scoped>
.map-links {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  margin-bottom: 24px;
}

.map-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 18px;
  transition: border-color 0.15s, transform 0.15s;
}

.map-card:hover {
  border-color: #b9dcc9;
  transform: translateY(-2px);
}

.mi {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: 11px;
  background: var(--green-50);
  color: var(--green-700);
}

.mt {
  display: flex;
  flex-direction: column;
}

.mt small {
  color: var(--muted);
  font-size: 12.5px;
}

.mc {
  margin-left: auto;
  color: var(--muted-2);
}

.bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}

.no-prev {
  height: 100%;
  display: grid;
  place-items: center;
  border-radius: 10px;
  background: var(--border-soft);
  color: var(--muted);
  font-size: 12.5px;
}

.item.busy {
  opacity: 0.6;
  pointer-events: none;
}

.icon-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.find {
  width: min(360px, 100%);
}

.count {
  color: var(--muted);
}

.load-err {
  margin-bottom: 16px;
  padding: 10px 14px;
  border-radius: 10px;
  background: var(--warn-50);
  color: var(--warn);
}

.grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 18px;
}

.item {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  cursor: pointer;
  transition: transform 0.18s, box-shadow 0.18s, border-color 0.18s;
}

.item:hover {
  transform: translateY(-3px);
  border-color: #cfe6d9;
  box-shadow: 0 14px 30px -14px rgba(22, 101, 52, 0.35);
}

.tag-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.tag.sys {
  background: #eef2ff;
  color: #3730a3;
}

.tag.edit {
  background: var(--orange-50);
  color: var(--orange-500);
}

.i-titles {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
}

.i-title {
  font-family: var(--font-display);
  font-size: 18px;
  font-weight: 600;
}

.i-desc {
  color: var(--muted);
  font-size: 13px;
}

.i-prev {
  height: 160px;
}

.prev-empty {
  display: grid;
  place-items: center;
  height: 100%;
  color: var(--muted);
  font-size: 13px;
  background: var(--sidebar);
  border-radius: 12px;
}

.i-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding-top: 12px;
  border-top: 1px solid var(--border-soft);
  font-size: 12.5px;
  color: var(--muted);
}

.info {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.actions {
  display: flex;
  gap: 6px;
}

.icon-btn.sm {
  width: 30px;
  height: 30px;
  border-radius: 8px;
}

.icon-btn.del:hover {
  background: var(--danger-50);
  color: var(--danger);
  border-color: #f5c9b6;
}

.i-meta {
  font-size: 12px;
  color: var(--muted-2);
}

@media (max-width: 1280px) {
  .grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 760px) {
  .grid,
  .map-links {
    grid-template-columns: 1fr;
  }
}
</style>
