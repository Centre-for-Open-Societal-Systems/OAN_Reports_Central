<script setup>
import BaseChart from './BaseChart.vue'
import GaugeChart from './GaugeChart.vue'
import SpecTable from './SpecTable.vue'
import KpiCard from '../KpiCard.vue'

defineProps({
  spec: { type: Object, default: null },
  mini: Boolean,
  height: { type: [Number, String], default: 380 },
})
</script>

<template>
  <div v-if="spec" class="spec" :class="{ mini }" :style="mini ? null : { '--h': typeof height === 'number' ? `${height}px` : height }">
    <!-- chart -->
    <div v-if="spec.kind === 'chart'" class="canvas">
      <BaseChart
        :type="spec.type"
        :labels="spec.labels"
        :datasets="spec.datasets"
        :index-axis="spec.indexAxis || 'x'"
        :stacked="!!spec.stacked"
        :format="spec.format || 'number'"
        :colors="spec.colors || null"
        :center-label="spec.centerLabel || null"
        :axis-max="spec.axisMax"
        :mini="mini"
      />
    </div>

    <!-- KPI tiles -->
    <div v-else-if="spec.kind === 'kpis'" class="kpis">
      <template v-if="mini">
        <div v-for="item in spec.items.slice(0, 4)" :key="item.label" class="mini-kpi" :class="item.tone">
          <span class="mk-val">{{ item.value }}</span>
          <span class="mk-lbl">{{ item.label }}</span>
        </div>
      </template>
      <template v-else>
        <KpiCard v-for="item in spec.items" :key="item.label" v-bind="item" compact />
      </template>
    </div>

    <!-- table -->
    <SpecTable v-else-if="spec.kind === 'table'" :columns="spec.columns" :rows="spec.rows" :mini="mini" />

    <!-- gauge -->
    <div v-else-if="spec.kind === 'gauge'" class="canvas gauge-box">
      <GaugeChart :value="spec.value" :max="spec.max" :label="spec.label" :caption="spec.caption" :mini="mini" />
    </div>

    <!-- big number -->
    <div v-else-if="spec.kind === 'bignumber'" class="big">
      <span class="big-val">{{ spec.value }}</span>
      <span class="big-lbl">{{ spec.label }}</span>
      <span v-if="!mini && spec.hint" class="big-hint">{{ spec.hint }}</span>
    </div>
  </div>
</template>

<style scoped>
.spec {
  height: 100%;
}

.canvas {
  position: relative;
  height: var(--h, 100%);
  min-height: 0;
}

.mini .canvas {
  height: 100%;
}

.kpis {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  gap: 14px;
}

.mini .kpis {
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  height: 100%;
}

.mini-kpi {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 2px;
  padding: 8px 12px;
  border-radius: 10px;
  background: #f6faf7;
  border: 1px solid #e6f0ea;
  min-width: 0;
}

.mk-val {
  font-family: var(--font-display);
  font-size: 19px;
  font-weight: 600;
  line-height: 1.1;
  color: var(--green-700);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.mini-kpi.warn .mk-val {
  color: var(--warn);
}

.mini-kpi.danger .mk-val {
  color: var(--danger);
}

.mk-lbl {
  font-size: 11px;
  color: var(--muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.big {
  height: 100%;
  min-height: 200px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  text-align: center;
}

.big-val {
  font-family: var(--font-display);
  font-size: 84px;
  font-weight: 600;
  line-height: 1;
  color: var(--green-700);
}

.big-lbl {
  font-weight: 700;
  font-size: 15px;
}

.big-hint {
  color: var(--muted);
  font-size: 13px;
}

.mini .big {
  min-height: 0;
}

.mini .big-val {
  font-size: 54px;
}

.mini .big-lbl {
  font-size: 12px;
  color: var(--muted);
  font-weight: 500;
}
</style>
