<script setup>
import { computed } from 'vue'
import AppIcon from './AppIcon.vue'

const props = defineProps({
  label: { type: String, required: true },
  value: { type: [String, Number], required: true },
  delta: { type: Number, default: null },
  deltaUnit: { type: String, default: '' },
  invert: Boolean, // true when a decrease is the good direction
  hint: { type: String, default: '' },
  icon: { type: String, default: '' },
  tone: { type: String, default: '' }, // good | warn | danger
  compact: Boolean,
})

const deltaGood = computed(() => (props.delta == null ? null : props.invert ? props.delta < 0 : props.delta > 0))
</script>

<template>
  <div class="kpi" :class="[tone, { compact }]">
    <div class="top">
      <span class="label">{{ label }}</span>
      <span v-if="icon" class="ico"><AppIcon :name="icon" :size="16" /></span>
    </div>
    <div class="value">{{ value }}</div>
    <div class="meta">
      <span v-if="delta != null" class="delta" :class="deltaGood ? 'up' : 'down'">
        <AppIcon :name="delta >= 0 ? 'trending-up' : 'trending-down'" :size="13" :stroke="2.3" />
        {{ delta > 0 ? '+' : '' }}{{ delta }}{{ deltaUnit }}
      </span>
      <span v-if="hint" class="hint">{{ hint }}</span>
    </div>
  </div>
</template>

<style scoped>
.kpi {
  --accent: var(--green-600);
  --accent-bg: var(--green-50);
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 16px 18px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow);
  min-width: 0;
  transition: transform 0.15s, box-shadow 0.15s;
}

.kpi:hover {
  transform: translateY(-1px);
  box-shadow: var(--shadow-lg);
}

.kpi.warn {
  --accent: var(--warn);
  --accent-bg: var(--warn-50);
}

.kpi.danger {
  --accent: var(--danger);
  --accent-bg: var(--danger-50);
}

.top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.label {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--muted);
}

.ico {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: 9px;
  background: var(--accent-bg);
  color: var(--accent);
}

.value {
  font-family: var(--font-display);
  font-size: 30px;
  font-weight: 600;
  letter-spacing: -0.02em;
  line-height: 1.1;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.kpi.compact .value {
  font-size: 26px;
}

.kpi.warn .value,
.kpi.danger .value {
  color: var(--accent);
}

.meta {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 20px;
  flex-wrap: wrap;
}

.hint {
  font-size: 12.5px;
  color: var(--muted);
}

.delta {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 1px 7px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
}

.delta.up {
  color: var(--green-700);
  background: var(--green-50);
}

.delta.down {
  color: var(--danger);
  background: var(--danger-50);
}
</style>
