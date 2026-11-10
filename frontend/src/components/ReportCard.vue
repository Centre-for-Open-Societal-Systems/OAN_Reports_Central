<script setup>
import { computed, onMounted } from 'vue'
import AppIcon from './AppIcon.vue'
import SpecView from './charts/SpecView.vue'
import { specCountLabel } from '../utils/specHelpers'
import { getCategory } from '../data/reports_catalog'
import { getPreview, loadPreview } from '../composables/useCatalog'

const props = defineProps({
  report: { type: Object, required: true },
  view: { type: String, default: 'grid' }, // grid | list
  showCategory: Boolean,
})

// Prefer a spec embedded in the catalog payload; otherwise lazily fetch /data once per report.
const inlineSpec = computed(() => props.report.preview_spec || props.report.widgets?.find((w) => w?.spec)?.spec || null)
const preview = computed(() => getPreview(props.report.id))
const spec = computed(() => inlineSpec.value || preview.value.spec)
const loadingPreview = computed(() => !inlineSpec.value && ['idle', 'loading'].includes(preview.value.status))
const count = computed(() => specCountLabel(spec.value))
const category = computed(() => getCategory(props.report.category))

onMounted(() => {
  if (!inlineSpec.value) loadPreview(props.report.id)
})
</script>

<template>
  <RouterLink :to="{ name: 'report-detail', params: { reportId: report.id } }" class="rcard" :class="view">
    <div class="head">
      <div class="titles">
        <span v-if="report.tag" class="tag">{{ report.tag }}</span>
        <h3 class="title">{{ report.title }}</h3>
        <p v-if="view === 'list'" class="desc">{{ report.description }}</p>
        <span v-if="showCategory && category" class="cat">{{ category.label }}</span>
      </div>
      <span class="go" aria-hidden="true"><AppIcon name="arrow-up-right" :size="16" :stroke="2.2" /></span>
    </div>

    <div v-if="view === 'grid'" class="preview">
      <SpecView v-if="spec" :spec="spec" mini />
      <div v-else class="no-prev">{{ loadingPreview ? 'Loading preview…' : 'No preview available' }}</div>
    </div>

    <div class="foot">
      <span class="f-item"><AppIcon name="clock" :size="13" /> {{ report.frequency || 'On demand' }}</span>
      <span class="f-item">{{ count }}</span>
    </div>
  </RouterLink>
</template>

<style scoped>
.rcard {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 16px 16px 14px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow);
  transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease;
  min-width: 0;
  animation: card-in 0.35s ease backwards;
}

@keyframes card-in {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

.rcard:hover {
  transform: translateY(-3px);
  border-color: #cfe6d9;
  box-shadow: 0 14px 30px -14px rgba(22, 101, 52, 0.35);
}

.head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.titles {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  min-width: 0;
}

.title {
  font-family: var(--font-display);
  font-size: 17px;
  font-weight: 600;
  line-height: 1.25;
  letter-spacing: -0.01em;
}

.cat {
  font-size: 12px;
  color: var(--muted);
}

.go {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  border-radius: 10px;
  border: 1px solid var(--border);
  color: var(--text-2);
  background: #fff;
  transition: all 0.18s;
}

.rcard:hover .go {
  background: var(--green-600);
  border-color: var(--green-600);
  color: #fff;
  transform: rotate(45deg);
}

.preview {
  height: 150px;
  padding: 2px 0;
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

.foot {
  margin-top: auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 12px;
  border-top: 1px solid var(--border-soft);
  font-size: 12.5px;
  color: var(--muted);
}

.f-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

/* ----- list layout ----- */
.rcard.list {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  grid-template-areas:
    'head foot'
    'head foot';
  align-items: center;
  gap: 18px;
  padding: 14px 18px;
}

.rcard.list .head {
  grid-area: head;
  align-items: center;
}

.rcard.list .titles {
  gap: 6px;
}

.rcard.list .desc {
  color: var(--muted);
  font-size: 13px;
  max-width: 80ch;
}

.rcard.list .foot {
  grid-area: foot;
  margin: 0;
  padding: 0;
  border: none;
  gap: 22px;
}

.rcard.list .go {
  display: none;
}

.rcard.list:hover {
  transform: translateX(3px);
}

@media (max-width: 700px) {
  .rcard.list {
    grid-template-columns: 1fr;
    grid-template-areas: 'head' 'foot';
  }
}
</style>
