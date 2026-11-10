<script setup>
import { onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import AppSidebar from './components/AppSidebar.vue'
import AppTopbar from './components/AppTopbar.vue'
import AppIcon from './components/AppIcon.vue'
import { toast } from './composables/useToast'
import { loadCatalog } from './composables/useCatalog'
import { loadSettings } from './composables/useStores'

const route = useRoute()
const sidebarOpen = ref(false)
watch(
  () => route.fullPath,
  () => (sidebarOpen.value = false),
)

onMounted(() => {
  loadCatalog()
  loadSettings()
})
</script>

<template>
  <div class="shell">
    <AppSidebar :open="sidebarOpen" @close="sidebarOpen = false" />
    <div class="main">
      <AppTopbar @toggle-sidebar="sidebarOpen = !sidebarOpen" />
      <main class="content">
        <RouterView :key="route.name === 'report-detail' ? route.params.reportId : undefined" />
      </main>
    </div>

    <Transition name="toast">
      <div v-if="toast" :key="toast.id" class="toast" :class="toast.tone" role="status">
        <AppIcon :name="toast.tone === 'success' ? 'check' : 'info'" :size="16" />
        {{ toast.message }}
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.shell {
  min-height: 100vh;
}

.main {
  margin-left: var(--sidebar-w);
  min-width: 0;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.content {
  flex: 1;
  min-width: 0;
}

.toast {
  position: fixed;
  right: 24px;
  bottom: 24px;
  z-index: 100;
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 12px 18px;
  border-radius: 12px;
  background: var(--text);
  color: #fff;
  font-weight: 600;
  box-shadow: var(--shadow-lg);
}

.toast.success svg {
  color: #6ee7a8;
}

.toast-enter-active,
.toast-leave-active {
  transition: opacity 0.25s, transform 0.25s;
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(10px);
}

@media (max-width: 900px) {
  .main {
    margin-left: 0;
  }
}
</style>
