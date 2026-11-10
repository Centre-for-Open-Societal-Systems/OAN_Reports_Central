<script setup>
import { computed } from 'vue'
import { Chart } from 'vue-chartjs'
import { ArcElement, Chart as ChartJS, DoughnutController, Tooltip } from 'chart.js'

ChartJS.register(ArcElement, DoughnutController, Tooltip)

const props = defineProps({
  value: { type: Number, required: true },
  max: { type: Number, default: 100 },
  label: { type: String, default: '' },
  caption: { type: String, default: '' },
  mini: Boolean,
})

const tone = computed(() => {
  const p = props.value / props.max
  return p >= 0.75 ? '#1B7A4E' : p >= 0.5 ? '#F2B84B' : '#C8553D'
})

const data = computed(() => ({
  labels: ['Score', 'Remaining'],
  datasets: [
    {
      data: [props.value, Math.max(props.max - props.value, 0)],
      backgroundColor: [tone.value, '#EEF0F3'],
      borderWidth: 0,
      borderRadius: 8,
    },
  ],
}))

const options = {
  responsive: true,
  maintainAspectRatio: false,
  rotation: -90,
  circumference: 180,
  cutout: '76%',
  animation: { duration: 700 },
  events: [],
  plugins: { legend: { display: false }, tooltip: { enabled: false } },
}
</script>

<template>
  <div class="gauge" :class="{ mini }">
    <div class="arc">
      <Chart type="doughnut" :data="data" :options="options" />
      <div class="center">
        <span class="val" :style="{ color: tone }">{{ Math.round(value) }}</span>
        <span class="of">/ {{ max }}</span>
      </div>
    </div>
    <p v-if="label && !mini" class="lbl">{{ label }}</p>
    <p v-if="caption && !mini" class="cap">{{ caption }}</p>
  </div>
</template>

<style scoped>
.gauge {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.arc {
  position: relative;
  width: min(100%, 380px);
  /* Half-doughnut sits on the bottom edge of this box. */
  aspect-ratio: 2 / 1.1;
}

.arc :deep(canvas) {
  position: absolute;
  inset: 0;
}

.center {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 12%;
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 4px;
}

.val {
  font-family: var(--font-display);
  font-size: 54px;
  font-weight: 600;
  line-height: 1;
}

.of {
  color: var(--muted);
  font-weight: 600;
}

.lbl {
  font-weight: 700;
}

.cap {
  color: var(--muted);
  font-size: 12.5px;
  text-align: center;
  max-width: 36ch;
}

.mini .val {
  font-size: 30px;
}

.mini .of {
  font-size: 11px;
}

.mini .arc {
  height: 100%;
  width: auto;
  max-width: 100%;
}
</style>
