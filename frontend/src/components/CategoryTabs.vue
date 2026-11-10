<script setup>
import AppIcon from './AppIcon.vue'
import { CATEGORIES, categoryCount } from '../data/reports_catalog'

defineProps({ active: { type: String, default: null } })
</script>

<template>
  <nav class="tabs" aria-label="Report categories">
    <RouterLink
      v-for="c in CATEGORIES"
      :key="c.id"
      :to="{ name: 'library-category', params: { category: c.id } }"
      class="tab"
      :class="{ on: active === c.id }"
      :aria-current="active === c.id ? 'page' : undefined"
    >
      <AppIcon :name="c.icon" :size="17" />
      <span class="lbl">{{ c.label }}</span>
      <span class="count">{{ categoryCount(c.id) }}</span>
    </RouterLink>
  </nav>
</template>

<style scoped>
.tabs {
  display: flex;
  gap: 4px;
  border-bottom: 1px solid var(--border);
  overflow-x: auto;
  scrollbar-width: none;
}

.tabs::-webkit-scrollbar {
  display: none;
}

.tab {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 9px;
  padding: 12px 16px 14px;
  color: var(--muted);
  font-weight: 600;
  font-size: 14px;
  white-space: nowrap;
  transition: color 0.15s;
}

.tab::after {
  content: '';
  position: absolute;
  left: 12px;
  right: 12px;
  bottom: -1px;
  height: 3px;
  border-radius: 3px 3px 0 0;
  background: var(--orange-500);
  transform: scaleX(0);
  transition: transform 0.22s ease;
}

.tab:hover {
  color: var(--text);
}

.tab.on {
  color: var(--text);
}

.tab.on::after {
  transform: scaleX(1);
}

.tab.on svg {
  color: var(--green-600);
}

.count {
  min-width: 24px;
  padding: 1px 8px;
  border-radius: 999px;
  background: var(--border-soft);
  color: var(--muted);
  font-size: 12px;
  font-weight: 700;
  text-align: center;
}

.tab.on .count {
  background: var(--green-50);
  color: var(--green-700);
}
</style>
