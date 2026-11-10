<script setup>
import { reactive, ref, watch } from 'vue'
import AppIcon from '../components/AppIcon.vue'
import { CATEGORIES } from '../data/reports_catalog'
import { defaultSettings, loadSettings, persistSettings, settings, settingsState } from '../composables/useStores'
import { API_BASE_URL } from '../api/client'
import { showToast } from '../composables/useToast'

const draft = reactive({ ...settings.value })

const saving = ref(false)

// Pick up server values when they arrive after the page has opened.
watch(settings, (v) => Object.assign(draft, v))

async function commit(message) {
  saving.value = true
  try {
    await persistSettings({ ...draft })
    showToast(message)
  } catch (e) {
    showToast(e.message || 'Could not save settings', 'info')
  } finally {
    saving.value = false
  }
}

const save = () => commit('Settings saved')

function reset() {
  Object.assign(draft, defaultSettings())
  return commit('Settings reset to defaults')
}

const notifications = [
  { key: 'notifyDigest', title: 'Weekly digest', text: 'A summary of key report changes every Monday morning.' },
  { key: 'notifySla', title: 'SLA breach alerts', text: 'Notify me when grievances are at risk of breaching their SLA.' },
  { key: 'notifyDataShare', title: 'Data-sharing exceptions', text: 'Alert me when providers report data-sharing faults.' },
]
</script>

<template>
  <div class="page">
    <header class="page-header">
      <div>
        <h1 class="page-title">Settings</h1>
        <p class="page-sub">Your profile, display preferences and notifications. Saved to the reporting backend.</p>
      </div>
      <div class="row">
        <button class="btn" :disabled="saving" @click="reset">Reset to defaults</button>
        <button class="btn btn-primary" :disabled="saving" @click="save">
          <AppIcon name="check" :size="16" :stroke="2.4" /> {{ saving ? 'Saving…' : 'Save changes' }}
        </button>
      </div>
    </header>

    <p v-if="settingsState.error" class="load-err" role="alert">
      Could not load saved settings ({{ settingsState.error }}). Showing defaults.
      <button class="link" @click="loadSettings">Retry</button>
    </p>

    <div class="stack">
      <section class="card sec">
        <div class="side">
          <h2 class="card-title">Profile</h2>
          <p class="card-sub">Shown in the top bar and on scheduled report emails.</p>
        </div>
        <div class="body two">
          <div class="field">
            <label for="st-name">Display name</label>
            <input id="st-name" v-model="draft.name" class="input" />
          </div>
          <div class="field">
            <label for="st-initials">Avatar initials</label>
            <input id="st-initials" v-model="draft.initials" class="input" maxlength="2" />
          </div>
          <div class="field">
            <label for="st-email">Email</label>
            <input id="st-email" v-model="draft.email" type="email" class="input" />
          </div>
          <div class="field full">
            <label for="st-role">Role</label>
            <input id="st-role" v-model="draft.role" class="input" />
          </div>
        </div>
      </section>

      <section class="card sec">
        <div class="side">
          <h2 class="card-title">Preferences</h2>
          <p class="card-sub">Defaults used across the Report Center.</p>
        </div>
        <div class="body two">
          <div class="field">
            <label for="st-lang">Language</label>
            <select id="st-lang" v-model="draft.language" class="select">
              <option value="en">English</option>
              <option value="am">አማርኛ (Amharic)</option>
              <option value="om">Afaan Oromoo</option>
            </select>
          </div>
          <div class="field">
            <label for="st-cat">Default library category</label>
            <select id="st-cat" v-model="draft.defaultCategory" class="select">
              <option v-for="c in CATEGORIES" :key="c.id" :value="c.id">{{ c.label }}</option>
            </select>
          </div>
          <div class="field">
            <label for="st-area">Area unit</label>
            <select id="st-area" v-model="draft.areaUnit" class="select">
              <option value="ha">Hectares</option>
              <option value="timad">Timad</option>
            </select>
          </div>
          <div class="field">
            <label for="st-cur">Currency</label>
            <select id="st-cur" v-model="draft.currency" class="select">
              <option>ETB</option>
              <option>USD</option>
            </select>
          </div>
          <div class="field full">
            <label for="st-date">Date format</label>
            <select id="st-date" v-model="draft.dateFormat" class="select">
              <option>DD MMM YYYY</option>
              <option>YYYY-MM-DD</option>
              <option>MM/DD/YYYY</option>
            </select>
          </div>
        </div>
      </section>

      <section class="card sec">
        <div class="side">
          <h2 class="card-title">Notifications</h2>
          <p class="card-sub">Choose which alerts reach your inbox.</p>
        </div>
        <div class="body">
          <div v-for="n in notifications" :key="n.key" class="toggle-row">
            <div>
              <strong>{{ n.title }}</strong>
              <p class="card-sub">{{ n.text }}</p>
            </div>
            <button
              class="switch"
              :class="{ on: draft[n.key] }"
              role="switch"
              :aria-checked="draft[n.key]"
              :aria-label="n.title"
              @click="draft[n.key] = !draft[n.key]"
            />
          </div>
        </div>
      </section>

      <section class="card sec">
        <div class="side">
          <h2 class="card-title">Data source</h2>
          <p class="card-sub">Every report is rendered from live data served by the reporting API.</p>
        </div>
        <div class="body">
          <div class="field">
            <label for="st-api">API base URL</label>
            <input id="st-api" :value="API_BASE_URL || '(same origin — /api)'" class="input" readonly />
            <span class="hint">
              Set <code>VITE_API_BASE_URL</code> in <code>.env</code> to change it. In dev, <code>/api</code> is proxied to
              <code>http://127.0.0.1:8000</code> by Vite.
            </span>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.load-err {
  margin-bottom: 16px;
  padding: 10px 14px;
  border-radius: 10px;
  background: var(--warn-50);
  color: var(--warn);
  font-size: 13.5px;
}

.stack {
  display: flex;
  flex-direction: column;
  gap: 18px;
  max-width: 980px;
}

.sec {
  display: grid;
  grid-template-columns: 240px minmax(0, 1fr);
  gap: 28px;
  padding: 22px 24px;
}

.side {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.body {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.body.two {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.full {
  grid-column: 1 / -1;
}

.toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--border-soft);
}

.toggle-row:last-child {
  border-bottom: none;
  padding-bottom: 0;
}

code {
  font-family: ui-monospace, Menlo, Consolas, monospace;
  font-size: 12px;
  background: var(--border-soft);
  padding: 1px 6px;
  border-radius: 5px;
}

@media (max-width: 800px) {
  .sec {
    grid-template-columns: 1fr;
    gap: 16px;
  }
  .body.two {
    grid-template-columns: 1fr;
  }
}
</style>
