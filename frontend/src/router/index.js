import { createRouter, createWebHistory } from 'vue-router'
import { isKnownCategory } from '../data/reports_catalog'

const routes = [
  {
    path: '/',
    name: 'library-home',
    component: () => import('../views/ReportLibrary.vue'),
    meta: { title: 'Report Library', section: 'library' },
  },
  {
    path: '/library/:category',
    name: 'library-category',
    component: () => import('../views/ReportLibrary.vue'),
    meta: { title: 'Report Library', section: 'library' },
    beforeEnter: (to) => (isKnownCategory(to.params.category) ? true : { name: 'library-home' }),
  },
  {
    path: '/reports/:reportId',
    name: 'report-detail',
    component: () => import('../views/ReportDetail.vue'),
    meta: { title: 'Report', section: 'library' },
  },
  {
    path: '/custom',
    name: 'custom-reports',
    component: () => import('../views/CustomReports.vue'),
    meta: { title: 'Custom Reports', section: 'custom' },
  },
  {
    path: '/custom/new',
    name: 'custom-new',
    component: () => import('../views/CustomReportBuilder.vue'),
    meta: { title: 'New Custom Report', section: 'custom' },
  },
  {
    path: '/custom/map-zone',
    name: 'map-zone',
    component: () => import('../views/MapSettings.vue'),
    props: { level: 'zone' },
    meta: { title: 'Map settings · Zone', section: 'custom' },
  },
  {
    path: '/custom/map-woreda',
    name: 'map-woreda',
    component: () => import('../views/MapSettings.vue'),
    props: { level: 'woreda' },
    meta: { title: 'Map settings · Woreda', section: 'custom' },
  },
  {
    path: '/schedule',
    name: 'schedule',
    component: () => import('../views/ScheduleView.vue'),
    meta: { title: 'Schedule', section: 'schedule' },
  },
  {
    path: '/settings',
    name: 'settings',
    component: () => import('../views/SettingsView.vue'),
    meta: { title: 'Settings', section: 'settings' },
  },
  { path: '/:pathMatch(.*)*', redirect: { name: 'library-home' } },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 }),
})

router.afterEach((to) => {
  document.title = `${to.meta.title ? to.meta.title + ' · ' : ''}OpenAgriNet — Report Center`
})

export default router
