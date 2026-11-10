<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppIcon from '../components/AppIcon.vue'
import CategoryTabs from '../components/CategoryTabs.vue'
import FilterChips from '../components/FilterChips.vue'
import KpiCard from '../components/KpiCard.vue'
import ReportCard from '../components/ReportCard.vue'
import StatePanel from '../components/StatePanel.vue'
import {
  DEFAULT_CATEGORY,
  REPORTS,
  getCategory,
  getCategoryKpis,
  getCategorySummaryState,
  isKnownCategory,
  reportsByCategory,
  searchReports,
  tagsForCategory,
} from '../data/reports_catalog'
import { catalogState, loadCatalog, loadCategorySummary } from '../composables/useCatalog'
import { persistedRef } from '../utils/storage'
import { settings } from '../composables/useStores'

const route = useRoute()
const router = useRouter()

const categoryId = computed(() => {
  if (route.params.category) return route.params.category
  const pref = settings.value.defaultCategory
  return isKnownCategory(pref) ? pref : DEFAULT_CATEGORY
})
const category = computed(() => getCategory(categoryId.value))
const query = computed(() => String(route.query.q || '').trim())
const searching = computed(() => query.value.length > 0)

const view = persistedRef('oan.library.view', 'grid')
const activeTag = ref('all')
watch(categoryId, () => (activeTag.value = 'all'))

const categoryReports = computed(() => reportsByCategory(categoryId.value))
const chips = computed(() => [
  { id: 'all', label: 'All', count: categoryReports.value.length },
  ...tagsForCategory(categoryId.value).map((t) => ({
    id: t,
    label: t,
    count: categoryReports.value.filter((r) => r.tag === t).length,
  })),
])

const reports = computed(() => {
  if (searching.value) return searchReports(query.value)
  return activeTag.value === 'all' ? categoryReports.value : categoryReports.value.filter((r) => r.tag === activeTag.value)
})

/* ----- catalog + category KPI state (all from the API) ----- */
const catalogLoading = computed(() => catalogState.loading && !catalogState.loaded)
const catalogEmpty = computed(() => catalogState.loaded && !REPORTS.length)

watch(categoryId, (id) => loadCategorySummary(id), { immediate: true })
const summary = computed(() => getCategorySummaryState(categoryId.value))
const kpis = computed(() => getCategoryKpis(categoryId.value))

const retryCatalog = () => loadCatalog({ force: true })
const retrySummary = () => loadCategorySummary(categoryId.value, { force: true })

function clearSearch() {
  router.replace({ path: route.path, query: {} })
}
</script>

<template>
  <div class="page">
    <header class="page-header">
      <div>
        <h1 class="page-title">Report Library</h1>
        <p class="page-sub">
          <template v-if="REPORTS.length">
            {{ REPORTS.length }} report{{ REPORTS.length === 1 ? '' : 's' }} across credit, registries and grievances.
            Pick a category, filter, and open any report for the full view.
          </template>
          <template v-else>Pick a category, filter, and open any report for the full view.</template>
        </p>
      </div>
      <RouterLink to="/custom/new" class="btn btn-primary">
        <AppIcon name="plus" :size="16" :stroke="2.4" /> New Custom Report
      </RouterLink>
    </header>

    <CategoryTabs :active="searching ? null : categoryId" />

    <!-- ===================== catalog loading / error / empty ===================== -->
    <StatePanel v-if="catalogLoading" class="top-gap" kind="loading" title="Loading reports…" message="Fetching the report catalog from the API." />
    <StatePanel
      v-else-if="catalogState.error && !catalogState.loaded"
      class="top-gap"
      kind="error"
      title="Could not load reports"
      :message="catalogState.error"
      @retry="retryCatalog"
    />
    <StatePanel
      v-else-if="catalogEmpty"
      class="top-gap"
      kind="empty"
      title="No reports available yet"
      message="The reporting API returned an empty catalog. Once reports are seeded on the backend they will appear here."
    >
      <button class="btn" @click="retryCatalog">Refresh</button>
    </StatePanel>

    <template v-else>
      <!-- ===================== search results banner ===================== -->
      <section v-if="searching" class="search-banner card">
        <div class="row">
          <AppIcon name="search" :size="18" class="sb-ic" />
          <div>
            <strong>{{ reports.length }} result{{ reports.length === 1 ? '' : 's' }}</strong>
            for “{{ query }}” across all categories
          </div>
        </div>
        <button class="btn btn-sm" @click="clearSearch"><AppIcon name="x" :size="14" /> Clear search</button>
      </section>

      <!-- ===================== category overview ===================== -->
      <template v-else>
        <section class="kpi-row">
          <template v-if="summary.status === 'loading' && !kpis.length">
            <div v-for="n in 4" :key="n" class="kpi-skel" aria-hidden="true" />
          </template>
          <KpiCard v-for="k in kpis" :key="k.label" v-bind="k" />
          <p v-if="summary.status === 'error'" class="kpi-note">
            Category summary unavailable: {{ summary.error }}
            <button class="link" @click="retrySummary">Retry</button>
          </p>
          <p v-else-if="summary.status === 'ready' && !kpis.length" class="kpi-note">No summary metrics reported for this category yet.</p>
        </section>

        <div class="toolbar-row">
          <p class="cat-desc">{{ category?.description }}</p>
          <div v-if="category?.dashboardUrl" class="row row-wrap">
            <a :href="category.dashboardUrl" target="_blank" rel="noopener" class="btn btn-soft">
              Open Dashboard <AppIcon name="external" :size="15" />
            </a>
          </div>
        </div>
      </template>

      <!-- ===================== filters + view toggle ===================== -->
      <div class="filter-row">
        <FilterChips v-if="!searching" v-model="activeTag" :chips="chips" />
        <span v-else class="muted-note">Showing matches from every category</span>
        <div class="segmented" role="group" aria-label="Layout">
          <button :class="{ active: view === 'grid' }" aria-label="Grid view" @click="view = 'grid'">
            <AppIcon name="grid" :size="16" /> Grid
          </button>
          <button :class="{ active: view === 'list' }" aria-label="List view" @click="view = 'list'">
            <AppIcon name="list" :size="16" /> List
          </button>
        </div>
      </div>

      <!-- ===================== reports ===================== -->
      <section v-if="reports.length" class="reports" :class="view">
        <ReportCard v-for="rep in reports" :key="rep.id" :report="rep" :view="view" :show-category="searching" />
      </section>

      <div v-else class="empty card">
        <AppIcon name="search" :size="28" />
        <template v-if="searching">
          <h3>No reports found</h3>
          <p>Try a different search term or clear the filters.</p>
          <button class="btn" @click="clearSearch">Back to library</button>
        </template>
        <template v-else>
          <h3>No reports in {{ category?.label || 'this category' }} yet</h3>
          <p>Create a custom report or seed this category on the backend.</p>
          <RouterLink to="/custom/new" class="btn btn-primary">+ New Custom Report</RouterLink>
        </template>
      </div>
    </template>
  </div>
</template>

<style scoped>
.kpi-row {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
  margin-top: 24px;
}

.toolbar-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  margin: 20px 0 6px;
}

.cat-desc {
  color: var(--muted);
  max-width: 60ch;
}

.filter-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  margin: 18px 0 20px;
}

.muted-note {
  color: var(--muted);
}

.search-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 18px;
  margin-top: 24px;
}

.sb-ic {
  color: var(--green-600);
}

.reports.grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 18px;
}

.kpi-skel {
  height: 108px;
  border-radius: var(--radius-lg);
  background: linear-gradient(90deg, var(--border-soft), #f4f7f5, var(--border-soft));
  background-size: 200% 100%;
  animation: shimmer 1.3s linear infinite;
}

@keyframes shimmer {
  to {
    background-position: -200% 0;
  }
}

.kpi-note {
  grid-column: 1 / -1;
  color: var(--muted);
  font-size: 13px;
}

.reports.list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

@media (max-width: 1280px) {
  .reports.grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 1100px) {
  .kpi-row {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .reports.grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 640px) {
  .kpi-row,
  .reports.grid {
    grid-template-columns: 1fr;
  }
}
.top-gap {
  margin-top: 24px;
}
</style>
