<script setup>
defineProps({
  chips: { type: Array, required: true }, // [{ id, label, count? }]
  modelValue: { type: String, default: 'all' },
})
const emit = defineEmits(['update:modelValue'])
</script>

<template>
  <div class="chips" role="tablist" aria-label="Filter reports">
    <button
      v-for="c in chips"
      :key="c.id"
      class="chip"
      :class="{ on: modelValue === c.id }"
      role="tab"
      :aria-selected="modelValue === c.id"
      @click="emit('update:modelValue', c.id)"
    >
      {{ c.label }}
      <span v-if="c.count != null" class="n">{{ c.count }}</span>
    </button>
  </div>
</template>

<style scoped>
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 32px;
  padding: 0 14px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text-2);
  font-weight: 500;
  font-size: 13px;
  transition: all 0.15s;
}

.chip:hover {
  border-color: #b9dcc9;
  background: #f6fbf8;
}

.chip.on {
  background: var(--green-600);
  border-color: var(--green-600);
  color: #fff;
  font-weight: 600;
}

.n {
  font-size: 11.5px;
  font-weight: 700;
  opacity: 0.7;
}
</style>
