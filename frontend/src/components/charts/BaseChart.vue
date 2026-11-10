<script setup>
import { computed } from 'vue'
import { Chart } from 'vue-chartjs'
import {
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  DoughnutController,
  Filler,
  Legend,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
} from 'chart.js'
import { PALETTE } from '../../utils/specHelpers'
import { fmtTick, fmtValue } from '../../utils/format'

ChartJS.register(
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  DoughnutController,
  Filler,
  Legend,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
)

ChartJS.defaults.font.family = "'DM Sans', ui-sans-serif, system-ui, sans-serif"
ChartJS.defaults.color = '#6b7280'

const props = defineProps({
  type: { type: String, default: 'bar' }, // bar | line | doughnut
  labels: { type: Array, required: true },
  datasets: { type: Array, required: true },
  indexAxis: { type: String, default: 'x' },
  stacked: Boolean,
  format: { type: String, default: 'number' },
  colors: { type: Array, default: null },
  centerLabel: { type: Object, default: null },
  axisMax: { type: Number, default: undefined },
  mini: Boolean,
})

// Draws a value + caption in the middle of doughnut charts.
const centerText = {
  id: 'centerText',
  afterDraw(chart) {
    const o = chart.options.plugins.centerText
    if (!o || !o.value) return
    const { ctx, chartArea } = chart
    const x = (chartArea.left + chartArea.right) / 2
    const y = (chartArea.top + chartArea.bottom) / 2
    ctx.save()
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = '#111827'
    ctx.font = `600 ${o.valueSize}px Fraunces, Georgia, serif`
    ctx.fillText(o.value, x, y - (o.text ? o.valueSize * 0.28 : 0))
    if (o.text) {
      ctx.fillStyle = '#6b7280'
      ctx.font = `500 ${o.textSize}px 'DM Sans', sans-serif`
      ctx.fillText(o.text, x, y + o.valueSize * 0.72)
    }
    ctx.restore()
  },
}

const alpha = (hex, a) => {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`
}

const isDoughnut = computed(() => props.type === 'doughnut')

const data = computed(() => {
  const mini = props.mini
  const single = props.datasets.length === 1
  return {
    labels: props.labels,
    datasets: props.datasets.map((d, i) => {
      const color = d.color || PALETTE[i % PALETTE.length]
      const kind = d.type || props.type

      if (kind === 'doughnut') {
        return {
          label: d.label,
          data: d.data,
          backgroundColor: props.colors || props.labels.map((_, k) => PALETTE[k % PALETTE.length]),
          borderColor: '#fff',
          borderWidth: mini ? 1.5 : 3,
          hoverOffset: mini ? 0 : 6,
        }
      }

      if (kind === 'line') {
        return {
          type: d.type,
          label: d.label,
          data: d.data,
          borderColor: color,
          backgroundColor: alpha(color, d.type ? 0 : 0.12),
          borderWidth: mini ? 2 : 2.5,
          tension: 0.35,
          fill: !d.type && single,
          pointRadius: mini ? 0 : 4,
          pointHoverRadius: 6,
          pointBackgroundColor: '#fff',
          pointBorderColor: color,
          pointBorderWidth: 2,
          order: d.type ? 0 : 1,
        }
      }

      const useColors = single && props.colors
      return {
        type: d.type,
        label: d.label,
        data: d.data,
        backgroundColor: useColors ? props.colors : color,
        hoverBackgroundColor: useColors ? props.colors : color,
        borderRadius: props.stacked ? 0 : mini ? 3 : 7,
        borderSkipped: false,
        maxBarThickness: mini ? 22 : 46,
        categoryPercentage: 0.78,
        barPercentage: 0.9,
        order: 2,
      }
    }),
  }
})

const options = computed(() => {
  const mini = props.mini
  const horizontal = props.indexAxis === 'y'
  const multi = props.datasets.length > 1

  const tooltip = {
    enabled: !mini,
    backgroundColor: '#111827',
    padding: 10,
    cornerRadius: 8,
    titleFont: { weight: '600' },
    boxPadding: 4,
    callbacks: {
      label(ctx) {
        const value = isDoughnut.value ? ctx.raw : horizontal ? ctx.parsed.x : ctx.parsed.y
        let text = `${isDoughnut.value ? ctx.label : ctx.dataset.label}: ${fmtValue(value, props.format)}`
        if (isDoughnut.value) {
          const total = ctx.dataset.data.reduce((s, v) => s + v, 0)
          text += ` (${((value / total) * 100).toFixed(1)}%)`
        }
        return text
      },
    },
  }

  const base = {
    responsive: true,
    maintainAspectRatio: false,
    animation: mini ? false : { duration: 600 },
    events: mini ? [] : ['mousemove', 'mouseout', 'click', 'touchstart', 'touchmove'],
    layout: { padding: mini ? 2 : 4 },
    plugins: {
      legend: {
        display: isDoughnut.value ? true : !mini && multi,
        position: isDoughnut.value ? (mini ? 'right' : 'right') : 'bottom',
        labels: {
          usePointStyle: true,
          pointStyle: 'circle',
          boxWidth: mini ? 7 : 9,
          boxHeight: mini ? 7 : 9,
          padding: mini ? 8 : 16,
          font: { size: mini ? 10 : 12, weight: '500' },
        },
      },
      tooltip,
      centerText: isDoughnut.value && props.centerLabel
        ? {
            value: props.centerLabel.value,
            text: props.centerLabel.text,
            valueSize: mini ? 14 : 24,
            textSize: mini ? 9 : 12,
          }
        : null,
    },
  }

  if (isDoughnut.value) {
    return { ...base, cutout: mini ? '66%' : '70%' }
  }

  const valueAxis = {
    beginAtZero: true,
    max: props.axisMax,
    stacked: props.stacked,
    display: !mini,
    border: { display: false },
    grid: { color: '#eef0f3', drawTicks: false },
    ticks: { padding: 8, callback: (v) => fmtTick(v, props.format), maxTicksLimit: 6 },
  }
  const catAxis = {
    stacked: props.stacked,
    display: !mini,
    border: { display: false },
    grid: { display: false },
    ticks: { padding: 6, autoSkip: false, maxRotation: 0 },
  }

  return {
    ...base,
    indexAxis: props.indexAxis,
    scales: horizontal ? { x: valueAxis, y: catAxis } : { x: catAxis, y: valueAxis },
    interaction: { mode: 'index', intersect: false },
  }
})
</script>

<template>
  <Chart :type="type" :data="data" :options="options" :plugins="[centerText]" />
</template>
