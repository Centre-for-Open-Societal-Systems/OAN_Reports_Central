<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppIcon from './AppIcon.vue'
import { getCategory, searchReports } from '../data/reports_catalog'
import { settings } from '../composables/useStores'

const emit = defineEmits(['toggle-sidebar'])
const route = useRoute()
const router = useRouter()

const input = ref(null)
const query = ref('')
const focused = ref(false)
const active = ref(0)

const results = computed(() => searchReports(query.value))
const shown = computed(() => results.value.slice(0, 7))
const showMenu = computed(() => focused.value && query.value.trim().length > 0)

const initials = computed(
  () =>
    settings.value.initials ||
    (settings.value.name || 'DR')
      .split(/\s+/)
      .map((w) => w[0])
      .join('')
      .slice(0, 2)
      .toUpperCase(),
)

// Keep the box in sync when a search is active in the URL.
watch(
  () => route.query.q,
  (q) => {
    if (route.name === 'library-home' || route.name === 'library-category') query.value = q ? String(q) : ''
  },
  { immediate: true },
)

watch(query, () => (active.value = 0))

function openReport(rep) {
  focused.value = false
  input.value?.blur()
  router.push({ name: 'report-detail', params: { reportId: rep.id } })
}

function submit() {
  const q = query.value.trim()
  if (!q) return
  focused.value = false
  input.value?.blur()
  router.push({ path: '/', query: { q } })
}

function onKey(e) {
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    active.value = Math.min(active.value + 1, shown.value.length - 1)
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    active.value = Math.max(active.value - 1, 0)
  } else if (e.key === 'Enter') {
    e.preventDefault()
    // Enter on a highlighted result opens it; ctrl/cmd+Enter shows all results.
    if (shown.value[active.value] && !(e.ctrlKey || e.metaKey)) openReport(shown.value[active.value])
    else submit()
  } else if (e.key === 'Escape') {
    if (query.value) query.value = ''
    else input.value?.blur()
    if (route.query.q) router.replace({ path: route.path, query: {} })
  }
}

function onGlobalKey(e) {
  const t = e.target
  const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)
  if (e.key === '/' && !typing && !e.ctrlKey && !e.metaKey && !e.altKey) {
    e.preventDefault()
    input.value?.focus()
    input.value?.select()
  }
}

onMounted(() => window.addEventListener('keydown', onGlobalKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onGlobalKey))

function blurLater() {
  // Allow clicks on results to register first.
  setTimeout(() => (focused.value = false), 120)
}
</script>

<template>
  <header class="topbar">
    <button class="icon-btn burger" aria-label="Open menu" @click="emit('toggle-sidebar')">
      <AppIcon name="menu" />
    </button>

    <div class="search-wrap">
      <div class="search" :class="{ focus: focused }">
        <AppIcon name="search" :size="17" class="s-icon" />
        <input
          ref="input"
          v-model="query"
          type="text"
          placeholder="Search reports"
          aria-label="Search reports"
          autocomplete="off"
          @focus="focused = true"
          @blur="blurLater"
          @keydown="onKey"
        />
        <kbd v-if="!query">/</kbd>
        <button v-else class="clear" aria-label="Clear search" @mousedown.prevent="query = ''">
          <AppIcon name="x" :size="14" />
        </button>
      </div>

      <div v-if="showMenu" class="menu card" role="listbox">
        <template v-if="shown.length">
          <button
            v-for="(rep, i) in shown"
            :key="rep.id"
            class="opt"
            :class="{ on: i === active }"
            role="option"
            @mousedown.prevent="openReport(rep)"
            @mouseenter="active = i"
          >
            <AppIcon :name="getCategory(rep.category)?.icon || 'library'" :size="16" class="opt-ic" />
            <span class="opt-main">
              <span class="opt-title">{{ rep.title }}</span>
              <span class="opt-sub">{{ [getCategory(rep.category)?.label, rep.tag].filter(Boolean).join(' · ') }}</span>
            </span>
            <AppIcon name="arrow-up-right" :size="14" class="opt-go" />
          </button>
          <button class="all" @mousedown.prevent="submit">
            Show all {{ results.length }} result{{ results.length === 1 ? '' : 's' }} in library
          </button>
        </template>
        <div v-else class="none">No reports match “{{ query }}”.</div>
      </div>
    </div>

    <div class="right">
      <button class="icon-btn bell" aria-label="Notifications">
        <AppIcon name="bell" :size="18" />
        <span class="dot" />
      </button>
      <RouterLink to="/settings" class="user" aria-label="Account settings">
        <span class="avatar">{{ initials }}</span>
        <span class="who">
          <span class="name">{{ settings.name }}</span>
        </span>
        <AppIcon name="chevron-down" :size="15" class="chev" />
      </RouterLink>
    </div>
  </header>
</template>

<style scoped>
.topbar {
  position: sticky;
  top: 0;
  z-index: 30;
  height: var(--topbar-h);
  display: grid;
  grid-template-columns: 1fr minmax(260px, 520px) 1fr;
  align-items: center;
  gap: 16px;
  padding: 0 32px;
  background: rgba(251, 250, 246, 0.82);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid rgba(229, 231, 235, 0.8);
}

.burger {
  display: none;
}

.search-wrap {
  position: relative;
  grid-column: 2;
}

.search {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 40px;
  padding: 0 12px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  box-shadow: var(--shadow-sm);
  transition: border-color 0.15s, box-shadow 0.15s;
}

.search.focus {
  border-color: var(--green-600);
  box-shadow: 0 0 0 3px rgba(27, 122, 78, 0.15);
}

.s-icon {
  color: var(--muted-2);
}

.search input {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  font-size: 14px;
}

.search input::placeholder {
  color: var(--muted-2);
}

kbd {
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: #f9fafb;
  color: var(--muted);
  font: 600 12px var(--font-sans);
}

.clear {
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border: none;
  border-radius: 6px;
  background: var(--border-soft);
  color: var(--muted);
}

.menu {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  right: 0;
  padding: 6px;
  box-shadow: var(--shadow-lg);
  z-index: 50;
}

.opt {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 9px 10px;
  border: none;
  border-radius: 9px;
  background: transparent;
  text-align: left;
}

.opt.on {
  background: var(--green-50);
}

.opt-ic {
  color: var(--green-600);
}

.opt-main {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
}

.opt-title {
  font-weight: 600;
  font-size: 13.5px;
}

.opt-sub {
  font-size: 12px;
  color: var(--muted);
}

.opt-go {
  color: var(--muted-2);
}

.all {
  width: 100%;
  margin-top: 4px;
  padding: 9px 10px;
  border: none;
  border-top: 1px solid var(--border-soft);
  background: transparent;
  color: var(--green-700);
  font-weight: 600;
  font-size: 13px;
  text-align: left;
  border-radius: 0 0 9px 9px;
}

.all:hover {
  background: var(--green-50);
}

.none {
  padding: 16px 12px;
  color: var(--muted);
  font-size: 13px;
}

.right {
  grid-column: 3;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 14px;
}

.bell {
  position: relative;
}

.dot {
  position: absolute;
  top: 7px;
  right: 8px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--orange-500);
  border: 2px solid #fff;
}

.user {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 8px 4px 4px;
  border-radius: 999px;
  transition: background 0.15s;
}

.user:hover {
  background: #eef2ef;
}

.avatar {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: linear-gradient(145deg, #2a9560, #145c3b);
  color: #fff;
  font-weight: 700;
  font-size: 12.5px;
  letter-spacing: 0.02em;
}

.name {
  font-weight: 600;
  font-size: 13.5px;
  white-space: nowrap;
}

.chev {
  color: var(--muted-2);
}

@media (max-width: 900px) {
  .topbar {
    grid-template-columns: auto 1fr auto;
    padding: 0 16px;
    gap: 10px;
  }
  .burger {
    display: inline-grid;
  }
  .search-wrap {
    grid-column: 2;
  }
  .who,
  .chev {
    display: none;
  }
}
</style>
