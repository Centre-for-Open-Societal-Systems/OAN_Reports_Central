import { ref, watch } from 'vue'

/** A ref persisted to localStorage (safe against SSR / blocked storage). */
export function persistedRef(key, fallback) {
  let initial = fallback
  try {
    const raw = localStorage.getItem(key)
    if (raw != null) initial = JSON.parse(raw)
  } catch {
    /* ignore */
  }
  const state = ref(initial)
  watch(
    state,
    (v) => {
      try {
        localStorage.setItem(key, JSON.stringify(v))
      } catch {
        /* ignore */
      }
    },
    { deep: true },
  )
  return state
}
