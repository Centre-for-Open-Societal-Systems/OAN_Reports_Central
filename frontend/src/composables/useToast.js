import { ref } from 'vue'

export const toast = ref(null)
let timer = null

export function showToast(message, tone = 'success') {
  toast.value = { message, tone, id: Date.now() }
  clearTimeout(timer)
  timer = setTimeout(() => (toast.value = null), 2800)
}
