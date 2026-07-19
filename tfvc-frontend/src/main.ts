import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import App from './App.vue'
import './assets/main.css'

import { isAuthenticated, isSuperAdmin } from './composables/useAuth'

import LoginView        from './views/LoginView.vue'
import DashboardView    from './views/DashboardView.vue'
import StudentsView     from './views/StudentsView.vue'
import ReceivedView     from './views/ReceivedView.vue'
import ImportStudentsView from './views/ImportStudentsView.vue'
import BackoutListView  from './views/BackoutListView.vue'
import SettingsView     from './views/SettingsView.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login',     component: LoginView,          name: 'login',    meta: { public: true } },
    { path: '/',          redirect: '/dashboard' },
    { path: '/dashboard', component: DashboardView,      name: 'dashboard' },
    { path: '/students',  component: StudentsView,        name: 'students' },
    { path: '/received',  component: ReceivedView,        name: 'received' },
    { path: '/import',    component: ImportStudentsView,  name: 'import' },
    { path: '/backout',   component: BackoutListView,     name: 'backout' },
    { path: '/settings',  component: SettingsView,        name: 'settings' },
  ]
})

// ── Navigation guard ────────────────────────────────────────────────────────
router.beforeEach((to) => {
  // Not logged in → go to login
  if (!to.meta.public && !isAuthenticated.value) {
    return { name: 'login' }
  }
  // Already logged in → skip login page
  if (to.name === 'login' && isAuthenticated.value) {
    return { name: 'dashboard' }
  }
  // Settings is super-admin only
  if (to.name === 'settings' && !isSuperAdmin.value) {
    return { name: 'dashboard' }
  }
})

const app = createApp(App)
app.use(router)
app.mount('#app')
