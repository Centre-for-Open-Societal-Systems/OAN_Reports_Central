<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import AppIcon from '../components/AppIcon.vue'
import StatePanel from '../components/StatePanel.vue'
import { REPORTS, CATEGORIES, getCategory, getReport } from '../data/reports_catalog'
import { addSchedule, loadSchedules, removeSchedule, schedules, toggleSchedule } from '../composables/useStores'
import { showToast } from '../composables/useToast'

const route = useRoute()

const DAYS = {
  Daily: ['Every day', 'Weekdays only'],
  Weekly: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
  Monthly: ['1st', '15th', 'Last day'],
}

const showForm = ref(false)
const form = reactive({
  reportId: '',
  frequency: 'Weekly',
  day: 'Monday',
  time: '08:00',
  format: 'PDF',
  recipients: '',
})
const tried = ref(false)

watch(
  () => form.frequency,
  (f) => (form.day = DAYS[f][0]),
)

// Arriving from a report detail page pre-fills the form.
const preset = route.query.report
if (preset) {
  form.reportId = preset
  showForm.value = true
}

const emailsOk = computed(() => form.recipients.split(/[,;\s]+/).filter(Boolean).every((e) => /^\S+@\S+\.\S+$/.test(e)) && form.recipients.trim().length > 0)

const busy = ref(false)

// Run an API-backed schedule mutation, surfacing failures as a toast.
async function run(action, successMessage) {
  busy.value = true
  try {
    await action()
    if (successMessage) showToast(successMessage)
    return true
  } catch (e) {
    showToast(e.message || 'Could not update schedules', 'info')
    return false
  } finally {
    busy.value = false
  }
}

async function submit() {
  tried.value = true
  if (!emailsOk.value || !form.reportId) return
  const ok = await run(
    () => addSchedule({ ...form, recipients: form.recipients.split(/[,;\s]+/).filter(Boolean).join(', ') }),
    'Schedule created',
  )
  if (!ok) return
  showForm.value = false
  tried.value = false
  form.recipients = ''
}

onMounted(() => loadSchedules())

const rows = computed(() =>
  schedules.items.map((s) => ({ ...s, report: getReport(s.reportId), cat: getCategory(getReport(s.reportId)?.category) })),
)
const activeCount = computed(() => schedules.items.filter((s) => s.active).length)

const remove = (s) => run(() => removeSchedule(s.id), 'Schedule removed')
const toggle = (s) => run(() => toggleSchedule(s.id))

const grouped = computed(() => {
  const groups = CATEGORIES.map((c) => ({ ...c, reports: REPORTS.filter((r) => r.category === c.id) }))
  const known = new Set(CATEGORIES.map((c) => c.id))
  const other = REPORTS.filter((r) => !known.has(r.category))
  if (other.length) groups.push({ id: 'other', label: 'Other', reports: other })
  return groups.filter((g) => g.reports.length)
})

// Default the report picker to the first available report once the catalog arrives.
watch(
  () => REPORTS.length,
  () => {
    if (!form.reportId && REPORTS.length) form.reportId = REPORTS[0].id
  },
  { immediate: true },
)
</script>

<template>
  <div class="page">
    <header class="page-header">
      <div>
        <h1 class="page-title">Schedule</h1>
        <p class="page-sub">Email any report on a recurring schedule. {{ activeCount }} of {{ schedules.items.length }} schedules are active.</p>
      </div>
      <button class="btn btn-primary" @click="showForm = !showForm">
        <AppIcon :name="showForm ? 'x' : 'plus'" :size="16" :stroke="2.4" /> {{ showForm ? 'Close' : 'New schedule' }}
      </button>
    </header>

    <Transition name="slide">
      <form v-if="showForm" class="card new" @submit.prevent="submit">
        <h2 class="card-title">New scheduled delivery</h2>
        <div class="grid">
          <div class="field span2">
            <label for="s-report">Report</label>
            <select id="s-report" v-model="form.reportId" class="select">
              <optgroup v-for="g in grouped" :key="g.id" :label="g.label">
                <option v-for="r in g.reports" :key="r.id" :value="r.id">{{ r.title }}</option>
              </optgroup>
            </select>
          </div>
          <div class="field">
            <label for="s-freq">Frequency</label>
            <select id="s-freq" v-model="form.frequency" class="select">
              <option v-for="(_, f) in DAYS" :key="f">{{ f }}</option>
            </select>
          </div>
          <div class="field">
            <label for="s-day">{{ form.frequency === 'Monthly' ? 'Day of month' : 'Day' }}</label>
            <select id="s-day" v-model="form.day" class="select">
              <option v-for="d in DAYS[form.frequency]" :key="d">{{ d }}</option>
            </select>
          </div>
          <div class="field">
            <label for="s-time">Time (EAT)</label>
            <input id="s-time" v-model="form.time" type="time" class="input" />
          </div>
          <div class="field">
            <label for="s-format">Format</label>
            <select id="s-format" v-model="form.format" class="select">
              <option>PDF</option>
              <option>XLSX</option>
              <option>CSV</option>
            </select>
          </div>
          <div class="field span4">
            <label for="s-rec">Recipients</label>
            <input
              id="s-rec"
              v-model="form.recipients"
              class="input"
              :class="{ bad: tried && !emailsOk }"
              placeholder="name@organisation.org, other@organisation.org"
            />
            <span v-if="tried && !emailsOk" class="err">Enter one or more valid email addresses, separated by commas.</span>
          </div>
        </div>
        <div class="row">
          <button class="btn btn-primary" type="submit" :disabled="busy || !form.reportId"><AppIcon name="calendar" :size="16" /> Create schedule</button>
          <button class="btn" type="button" @click="showForm = false">Cancel</button>
        </div>
      </form>
    </Transition>

    <StatePanel v-if="schedules.loading && !schedules.loaded" kind="loading" title="Loading schedules…" />
    <StatePanel
      v-else-if="schedules.error && !schedules.loaded"
      kind="error"
      title="Could not load schedules"
      :message="schedules.error"
      @retry="loadSchedules({ force: true })"
    />

    <section v-else-if="rows.length" class="card list">
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>Report</th>
              <th>Runs</th>
              <th>Format</th>
              <th>Recipients</th>
              <th>Active</th>
              <th />
            </tr>
          </thead>
          <tbody>
            <tr v-for="s in rows" :key="s.id" :class="{ off: !s.active }">
              <td>
                <RouterLink :to="{ name: 'report-detail', params: { reportId: s.reportId } }" class="rtitle">{{ s.report?.title || s.reportId }}</RouterLink>
                <div class="rcat">{{ s.cat?.label }}</div>
              </td>
              <td>
                <span class="runs"><AppIcon name="clock" :size="14" /> {{ s.frequency }} · {{ s.day }} at {{ s.time }}</span>
              </td>
              <td><span class="badge">{{ s.format }}</span></td>
              <td class="recips"><AppIcon name="mail" :size="14" /> {{ s.recipients }}</td>
              <td>
                <button class="switch" :class="{ on: s.active }" role="switch" :aria-checked="s.active" :aria-label="`Toggle ${s.report?.title}`" @click="toggle(s)" />
              </td>
              <td class="act">
                <button class="icon-btn del" :aria-label="`Delete schedule for ${s.report?.title}`" @click="remove(s)"><AppIcon name="trash" :size="15" /></button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <div v-else class="card empty">
      <AppIcon name="calendar" :size="28" />
      <h3>Nothing scheduled</h3>
      <p>Schedule a report to land in your inbox automatically.</p>
      <button class="btn btn-primary" @click="showForm = true">New schedule</button>
    </div>
  </div>
</template>

<style scoped>
.new {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 20px 22px;
  margin-bottom: 22px;
}

.grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
}

.span2 {
  grid-column: span 2;
}

.span4 {
  grid-column: span 4;
}

.input.bad {
  border-color: var(--danger);
}

.err {
  color: var(--danger);
  font-size: 12px;
}

.list {
  overflow: hidden;
}

.rtitle {
  font-weight: 600;
  color: var(--text);
}

.rtitle:hover {
  color: var(--green-700);
}

.rcat {
  font-size: 12px;
  color: var(--muted);
}

.runs,
.recips {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: var(--text-2);
}

.recips {
  max-width: 320px;
}

tr.off td:not(:nth-last-child(-n + 2)) {
  opacity: 0.55;
}

.act {
  text-align: right;
}

.del:hover {
  background: var(--danger-50);
  color: var(--danger);
  border-color: #f5c9b6;
}

.slide-enter-active,
.slide-leave-active {
  transition: opacity 0.2s, transform 0.2s;
}

.slide-enter-from,
.slide-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

@media (max-width: 900px) {
  .grid {
    grid-template-columns: 1fr 1fr;
  }
  .span4 {
    grid-column: span 2;
  }
}
</style>
