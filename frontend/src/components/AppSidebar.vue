<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import AppIcon from './AppIcon.vue'
import { getCategory } from '../data/reports_catalog'

defineProps({ open: Boolean })
const emit = defineEmits(['close'])

const route = useRoute()
const section = computed(() => route.meta.section)

const registries = getCategory('farmer-registry').dashboardUrl
const a2c = getCategory('access-to-credit').dashboardUrl

const nav = [
  { label: 'Report Library', to: '/', icon: 'library', section: 'library' },
  { label: 'Custom Reports', to: '/custom', icon: 'sliders', section: 'custom' },
  { label: 'Schedule', to: '/schedule', icon: 'calendar', section: 'schedule' },
]
const dashboards = [
  { label: 'Registries', href: registries },
  { label: 'Access to Credit', href: a2c },
]
</script>

<template>
  <div class="scrim" :class="{ show: open }" @click="emit('close')" />
  <aside class="sidebar" :class="{ open }" aria-label="Primary">
    <RouterLink to="/" class="brand" @click="emit('close')">
      <span class="brand-mark"><AppIcon name="sprout" :size="20" :stroke="2.1" /></span>
      <span class="brand-text">
        <span class="brand-name">Report Center</span>
        <span class="brand-sub">OpenAgriNet</span>
      </span>
    </RouterLink>

    <nav class="nav">
      <div class="section-label nav-label">Reports</div>
      <RouterLink
        v-for="item in nav"
        :key="item.to"
        :to="item.to"
        class="nav-item"
        :class="{ active: section === item.section }"
        @click="emit('close')"
      >
        <AppIcon :name="item.icon" :size="18" />
        {{ item.label }}
      </RouterLink>

      <div class="section-label nav-label second">Dashboards</div>
      <a v-for="d in dashboards" :key="d.label" :href="d.href" target="_blank" rel="noopener" class="nav-item">
        <AppIcon name="dashboard" :size="18" />
        {{ d.label }}
        <AppIcon name="external" :size="13" class="ext" />
      </a>
    </nav>

    <div class="foot">
      <RouterLink
        to="/settings"
        class="nav-item"
        :class="{ active: section === 'settings' }"
        @click="emit('close')"
      >
        <AppIcon name="settings" :size="18" />
        Settings
      </RouterLink>
      <p class="version">Report Center v0.1 · Ethiopia</p>
    </div>
  </aside>
</template>

<style scoped>
.sidebar {
  position: fixed;
  inset: 0 auto 0 0;
  z-index: 40;
  width: var(--sidebar-w);
  display: flex;
  flex-direction: column;
  background: var(--sidebar);
  border-right: 1px solid var(--border);
  padding: 18px 14px 14px;
}

.brand {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 4px 8px 20px;
}

.brand-mark {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border-radius: 11px;
  color: #fff;
  background: linear-gradient(145deg, var(--green-500), var(--green-700));
  box-shadow: 0 6px 14px -6px rgba(22, 101, 52, 0.7);
}

.brand-text {
  display: flex;
  flex-direction: column;
  line-height: 1.15;
}

.brand-name {
  font-family: var(--font-display);
  font-size: 18px;
  font-weight: 600;
  letter-spacing: -0.02em;
  color: var(--text);
}

.brand-sub {
  font-size: 11px;
  color: var(--muted);
  letter-spacing: 0.04em;
}

.nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
}

.nav-label {
  padding: 6px 10px 6px;
}

.nav-label.second {
  margin-top: 22px;
}

.nav-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 11px;
  height: 40px;
  padding: 0 10px;
  border-radius: 10px;
  color: var(--text-2);
  font-weight: 500;
  transition: background 0.15s, color 0.15s;
}

.nav-item:hover {
  background: #eceff3;
}

.nav-item.active {
  background: var(--green-50);
  color: var(--green-700);
  font-weight: 600;
}

.nav-item.active::before {
  content: '';
  position: absolute;
  left: -14px;
  top: 9px;
  bottom: 9px;
  width: 3px;
  border-radius: 0 3px 3px 0;
  background: var(--green-600);
}

.ext {
  margin-left: auto;
  color: var(--muted-2);
}

.foot {
  border-top: 1px solid var(--border);
  padding-top: 12px;
}

.version {
  margin: 10px 10px 0;
  font-size: 11px;
  color: var(--muted-2);
}

.scrim {
  display: none;
}

@media (max-width: 900px) {
  .sidebar {
    transform: translateX(-102%);
    transition: transform 0.25s ease;
    box-shadow: var(--shadow-lg);
  }
  .sidebar.open {
    transform: none;
  }
  .scrim {
    display: block;
    position: fixed;
    inset: 0;
    z-index: 39;
    background: rgba(17, 24, 39, 0.35);
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.2s;
  }
  .scrim.show {
    opacity: 1;
    pointer-events: auto;
  }
}
</style>
