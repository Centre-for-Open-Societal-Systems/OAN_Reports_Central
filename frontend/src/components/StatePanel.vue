<script setup>
import AppIcon from './AppIcon.vue'

defineProps({
  kind: { type: String, default: 'empty' }, // loading | error | empty
  title: { type: String, default: '' },
  message: { type: String, default: '' },
  compact: Boolean,
})
defineEmits(['retry'])
</script>

<template>
  <div class="empty card state" :class="[kind, { compact }]" :role="kind === 'error' ? 'alert' : 'status'">
    <span v-if="kind === 'loading'" class="spinner" aria-hidden="true" />
    <AppIcon v-else :name="kind === 'error' ? 'info' : 'database'" :size="28" />
    <h3>{{ title || (kind === 'loading' ? 'Loading…' : kind === 'error' ? 'Something went wrong' : 'Nothing here yet') }}</h3>
    <p v-if="message">{{ message }}</p>
    <div v-if="$slots.default || kind === 'error'" class="actions">
      <slot />
      <button v-if="kind === 'error'" class="btn" @click="$emit('retry')">Try again</button>
    </div>
  </div>
</template>

<style scoped>
.state.compact {
  padding: 28px 16px;
}

.state.error svg {
  color: var(--danger);
}

.state p {
  max-width: 56ch;
}

.actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: center;
  margin-top: 6px;
}

.spinner {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  border: 3px solid var(--border);
  border-top-color: var(--green-600);
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
