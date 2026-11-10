<script setup>
import { computed, reactive, watch } from 'vue'
import AppIcon from '../components/AppIcon.vue'
import { mapSettings } from '../composables/useStores'
import { fmtNumber } from '../utils/format'
import { showToast } from '../composables/useToast'

const props = defineProps({ level: { type: String, default: 'zone' } })

/* Placeholder geographies for the map-settings preview tiles (not report data).
   TODO: load real zone / woreda aggregates from the API.
   Columns: code, name, parent region, farmers, area sown (ha), livestock keepers */
const GEO = {
  zone: [
    ['ET0401', 'Arsi', 'Oromia', 12450, 42800, 8200],
    ['ET0402', 'East Shewa', 'Oromia', 10820, 35640, 7340],
    ['ET0403', 'West Arsi', 'Oromia', 9940, 31280, 5900],
    ['ET0404', 'Borana', 'Oromia', 7400, 18200, 6120],
    ['ET0405', 'North Shewa', 'Oromia', 8650, 27300, 4800],
    ['ET0406', 'Jimma', 'Oromia', 9320, 24100, 4150],
    ['ET0301', 'East Gojjam', 'Amhara', 8870, 29400, 5200],
    ['ET0302', 'South Wollo', 'Amhara', 7540, 22800, 5050],
    ['ET0303', 'West Gojjam', 'Amhara', 6980, 21200, 3900],
    ['ET1401', 'Sidama Central', 'Sidama', 8120, 19600, 3300],
    ['ET1501', 'Gedeo', 'South Ethiopia', 6210, 12900, 2100],
    ['ET0101', 'Central Tigray', 'Tigray', 5360, 14700, 2650],
  ],
  woreda: [
    ['ET040101', 'Lemu Bilbilo', 'Arsi', 3840, 12481, 2410],
    ['ET040203', "Ada'a", 'East Shewa', 4260, 10821, 2860],
    ['ET040301', 'Shashemene', 'West Arsi', 3510, 9740, 1950],
    ['ET040401', 'Yabello', 'Borana', 2300, 4200, 2140],
    ['ET040102', 'Bekoji', 'Arsi', 2980, 8120, 1830],
    ['ET040204', 'Liben Chukala', 'East Shewa', 2710, 7010, 1520],
    ['ET140101', 'Dale', 'Sidama Central', 1850, 5200, 1010],
    ['ET140102', 'Aleta Wendo', 'Sidama Central', 1540, 4300, 940],
    ['ET030101', 'Debre Markos', 'East Gojjam', 2430, 6900, 1380],
    ['ET030201', 'Dessie Zuria', 'South Wollo', 2120, 5800, 1290],
    ['ET150101', 'Dila Zuria', 'Gedeo', 1760, 3400, 720],
    ['ET010101', 'Adwa', 'Central Tigray', 1490, 3900, 810],
  ],
}

const METRICS = {
  farmers: { label: 'Registered farmers', idx: 3, unit: 'farmers' },
  area: { label: 'Area sown (ha)', idx: 4, unit: 'ha' },
  keepers: { label: 'Livestock keepers', idx: 5, unit: 'keepers' },
}

const PALETTES = {
  green: { label: 'Green', from: [232, 245, 238], to: [15, 77, 49] },
  orange: { label: 'Orange', from: [253, 241, 228], to: [168, 76, 8] },
  teal: { label: 'Teal', from: [227, 243, 241], to: [17, 94, 87] },
}

const draft = reactive({ ...mapSettings.value[props.level] })
watch(
  () => props.level,
  (lv) => Object.assign(draft, mapSettings.value[lv]),
)

const rows = computed(() => GEO[props.level].map(([code, name, parent, ...vals]) => ({ code, name, parent, vals })))
const metric = computed(() => METRICS[draft.metric])
const values = computed(() => rows.value.map((r) => r.vals[metric.value.idx - 3]))

const bins = computed(() => {
  const n = draft.classes
  const min = Math.min(...values.value)
  const max = Math.max(...values.value)
  const step = (max - min) / n || 1
  const p = PALETTES[draft.palette]
  return Array.from({ length: n }, (_, i) => {
    const t = n === 1 ? 1 : i / (n - 1)
    const rgb = p.from.map((c, k) => Math.round(c + (p.to[k] - c) * t))
    return { from: min + step * i, to: min + step * (i + 1), color: `rgb(${rgb.join(',')})`, dark: t > 0.45 }
  })
})

const tiles = computed(() =>
  rows.value.map((r, i) => {
    const v = values.value[i]
    const bi = Math.min(bins.value.findIndex((b) => v <= b.to + 1e-9), bins.value.length - 1)
    const bin = bins.value[Math.max(bi, 0)]
    return { ...r, value: v, bin: Math.max(bi, 0), color: bin.color, dark: bin.dark }
  }),
)

const isZone = computed(() => props.level === 'zone')

function save() {
  mapSettings.value[props.level] = { ...draft }
  showToast(`Map settings saved for ${props.level}`)
}

function reset() {
  Object.assign(draft, { metric: 'farmers', palette: 'green', classes: 5, labels: true, codes: false })
}
</script>

<template>
  <div class="page">
    <RouterLink to="/custom" class="back"><AppIcon name="arrow-left" :size="16" :stroke="2.2" /> Back to Custom Reports</RouterLink>

    <header class="page-header">
      <div>
        <h1 class="page-title">Map settings · {{ isZone ? 'Zone' : 'Woreda' }}</h1>
        <p class="page-sub">
          Choose how {{ isZone ? 'zone' : 'woreda' }}-level values are classified and coloured when a custom report is
          shown on a map.
        </p>
      </div>
      <div class="row row-wrap">
        <div class="segmented" role="tablist" aria-label="Geographic level">
          <RouterLink to="/custom/map-zone" :class="{ active: isZone }"><AppIcon name="map" :size="15" /> Zone</RouterLink>
          <RouterLink to="/custom/map-woreda" :class="{ active: !isZone }"><AppIcon name="map-pin" :size="15" /> Woreda</RouterLink>
        </div>
      </div>
    </header>

    <div class="layout">
      <!-- settings -->
      <section class="card form">
        <h2 class="card-title">Classification</h2>

        <div class="field">
          <label for="m-metric">Metric</label>
          <select id="m-metric" v-model="draft.metric" class="select">
            <option v-for="(m, k) in METRICS" :key="k" :value="k">{{ m.label }}</option>
          </select>
        </div>

        <div class="field">
          <span class="field-label">Colour ramp</span>
          <div class="ramps">
            <button
              v-for="(p, k) in PALETTES"
              :key="k"
              type="button"
              class="ramp"
              :class="{ on: draft.palette === k }"
              @click="draft.palette = k"
            >
              <span
                class="swatch"
                :style="{ background: `linear-gradient(90deg, rgb(${p.from}), rgb(${p.to}))` }"
              />
              {{ p.label }}
            </button>
          </div>
        </div>

        <div class="field">
          <label for="m-classes">Classes: <strong>{{ draft.classes }}</strong></label>
          <input id="m-classes" v-model.number="draft.classes" type="range" min="3" max="7" step="1" class="range" />
        </div>

        <label class="check">
          <button type="button" class="switch" :class="{ on: draft.labels }" role="switch" :aria-checked="draft.labels" @click="draft.labels = !draft.labels" />
          Show {{ isZone ? 'zone' : 'woreda' }} names
        </label>
        <label class="check">
          <button type="button" class="switch" :class="{ on: draft.codes }" role="switch" :aria-checked="draft.codes" @click="draft.codes = !draft.codes" />
          Show geo codes
        </label>

        <div class="row actions">
          <button class="btn btn-primary" @click="save"><AppIcon name="check" :size="16" :stroke="2.4" /> Save settings</button>
          <button class="btn" @click="reset">Reset</button>
        </div>
      </section>

      <!-- map -->
      <section class="card map">
        <div class="m-head">
          <div>
            <h2 class="card-title">{{ metric.label }} by {{ isZone ? 'zone' : 'woreda' }}</h2>
            <p class="card-sub">Tile cartogram preview · {{ rows.length }} {{ isZone ? 'zones' : 'woredas' }} (sample data)</p>
          </div>
        </div>

        <div class="tiles">
          <div
            v-for="t in tiles"
            :key="t.code"
            class="tile"
            :class="{ dark: t.dark }"
            :style="{ background: t.color }"
            :title="`${t.name} (${t.parent}): ${fmtNumber(t.value)} ${metric.unit}`"
          >
            <span v-if="draft.labels" class="t-name">{{ t.name }}</span>
            <span class="t-val">{{ fmtNumber(t.value) }}</span>
            <span v-if="draft.codes" class="t-code">{{ t.code }}</span>
          </div>
        </div>

        <div class="legend">
          <span class="section-label">Legend</span>
          <div class="l-items">
            <span v-for="(b, i) in bins" :key="i" class="l-item">
              <i :style="{ background: b.color }" />
              {{ fmtNumber(Math.round(b.from)) }}–{{ fmtNumber(Math.round(b.to)) }}
            </span>
          </div>
        </div>
      </section>
    </div>

    <!-- mapping table -->
    <section class="card table-card">
      <div class="t-head">
        <h2 class="card-title">Geography join</h2>
        <span class="card-sub">Report rows are matched to map features on the geo code.</span>
      </div>
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>Geo code</th>
              <th>{{ isZone ? 'Zone' : 'Woreda' }}</th>
              <th>{{ isZone ? 'Region' : 'Zone' }}</th>
              <th class="num">{{ metric.label }}</th>
              <th>Class</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="t in tiles" :key="t.code">
              <td><code>{{ t.code }}</code></td>
              <td>{{ t.name }}</td>
              <td>{{ t.parent }}</td>
              <td class="num">{{ fmtNumber(t.value) }}</td>
              <td><span class="swatch-dot" :style="{ background: t.color }" /> Class {{ t.bin + 1 }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>

<style scoped>
.back {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 18px;
  color: var(--muted);
  font-weight: 600;
}

.back:hover {
  color: var(--green-700);
}

.layout {
  display: grid;
  grid-template-columns: minmax(300px, 380px) minmax(0, 1fr);
  gap: 20px;
  align-items: start;
}

.form {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 22px;
}

.ramps {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.ramp {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: #fff;
  font-size: 12.5px;
  font-weight: 600;
}

.ramp.on {
  border-color: var(--green-600);
  box-shadow: 0 0 0 3px rgba(27, 122, 78, 0.14);
}

.swatch {
  display: block;
  height: 14px;
  border-radius: 5px;
}

.range {
  accent-color: var(--green-600);
  width: 100%;
}

.check {
  display: flex;
  align-items: center;
  gap: 10px;
  font-weight: 600;
  font-size: 13px;
}

.actions {
  margin-top: 4px;
}

.map {
  padding: 22px;
}

.m-head {
  margin-bottom: 16px;
}

.tiles {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
  gap: 8px;
}

.tile {
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  gap: 2px;
  min-height: 84px;
  padding: 10px 12px;
  border-radius: 10px;
  color: var(--text);
  transition: background 0.25s, transform 0.15s;
}

.tile:hover {
  transform: scale(1.03);
}

.tile.dark {
  color: #fff;
}

.t-name {
  font-size: 12.5px;
  font-weight: 600;
  line-height: 1.2;
}

.t-val {
  font-family: var(--font-display);
  font-size: 19px;
  font-weight: 600;
}

.t-code {
  font-size: 10.5px;
  opacity: 0.75;
  font-family: ui-monospace, Menlo, Consolas, monospace;
}

.legend {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
  margin-top: 18px;
  padding-top: 14px;
  border-top: 1px solid var(--border-soft);
}

.l-items {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 16px;
}

.l-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--muted);
}

.l-item i {
  width: 14px;
  height: 14px;
  border-radius: 4px;
  border: 1px solid rgba(0, 0, 0, 0.06);
}

.table-card {
  margin-top: 20px;
  overflow: hidden;
}

.t-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  padding: 18px 22px 12px;
}

.swatch-dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  margin-right: 6px;
  border-radius: 3px;
  border: 1px solid rgba(0, 0, 0, 0.08);
}

code {
  font-family: ui-monospace, Menlo, Consolas, monospace;
  font-size: 12px;
  background: var(--border-soft);
  padding: 1px 6px;
  border-radius: 5px;
}

@media (max-width: 1000px) {
  .layout {
    grid-template-columns: 1fr;
  }
}
</style>
