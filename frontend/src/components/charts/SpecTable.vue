<script setup>
import { computed } from 'vue'
import { fmtValue } from '../../utils/format'

const props = defineProps({
  columns: { type: Array, required: true },
  rows: { type: Array, required: true },
  mini: Boolean,
})

const cols = computed(() => (props.mini ? props.columns.slice(0, 3) : props.columns))
const visible = computed(() => (props.mini ? props.rows.slice(0, 4) : props.rows))

const isNum = (c) => ['number', 'percent', 'currency', 'area', 'days'].includes(c.format)

function badgeClass(v) {
  const s = String(v).toLowerCase()
  if (['onboarded', 'live', 'resolved', 'active', 'approved'].includes(s)) return 'badge-green'
  if (['onboarding', 'pilot', 'in progress', 'assigned', 'pending'].includes(s)) return 'badge-orange'
  if (['escalated', 'failed', 'declined'].includes(s)) return 'badge-red'
  return ''
}
</script>

<template>
  <div class="table-wrap" :class="{ mini }">
    <table class="table">
      <thead>
        <tr>
          <th v-for="c in cols" :key="c.key" :class="{ num: isNum(c) }">{{ c.label }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(row, i) in visible" :key="i">
          <td v-for="c in cols" :key="c.key" :class="{ num: isNum(c) }">
            <span v-if="c.format === 'badge'" class="badge" :class="badgeClass(row[c.key])">{{ row[c.key] }}</span>
            <template v-else>{{ c.format ? fmtValue(row[c.key], c.format) : row[c.key] }}</template>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.mini {
  overflow: hidden;
}

.mini .table {
  font-size: 11.5px;
}

.mini .table th {
  padding: 5px 8px;
  font-size: 10px;
}

.mini .table td {
  padding: 5px 8px;
  white-space: nowrap;
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
