<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { logout, isSuperAdmin, currentUser } from './composables/useAuth'

const router = useRouter()
const route  = useRoute()

// ── Sidebar state ──────────────────────────────────────────────────────────
// On mobile: sidebarOpen controls the overlay drawer (default closed)
// On desktop: sidebarOpen controls collapsed (icon-only) vs expanded
const sidebarOpen = ref(true)
const isMobile    = ref(false)

function checkMobile() {
  isMobile.value = window.innerWidth < 768
  // auto-close drawer on mobile when resizing up
  if (!isMobile.value) sidebarOpen.value = true
}

onMounted(() => {
  checkMobile()
  window.addEventListener('resize', checkMobile)

  // On mobile, start with sidebar closed
  if (isMobile.value) sidebarOpen.value = false

  const saved = localStorage.getItem('sidebarOpen')
  if (!isMobile.value && saved !== null) {
    sidebarOpen.value = saved === 'true'
  }
})
onUnmounted(() => window.removeEventListener('resize', checkMobile))

function toggleSidebar() {
  sidebarOpen.value = !sidebarOpen.value
  if (!isMobile.value) localStorage.setItem('sidebarOpen', String(sidebarOpen.value))
}

// Close mobile drawer when navigating
function navigate(path: string) {
  router.push(path)
  if (isMobile.value) sidebarOpen.value = false
}

// ── Dark mode ──────────────────────────────────────────────────────────────
const isDark = ref(false)
function applyTheme(dark: boolean) {
  document.documentElement.classList.toggle('dark', dark)
  localStorage.setItem('theme', dark ? 'dark' : 'light')
}
function toggleTheme() { isDark.value = !isDark.value; applyTheme(isDark.value) }
onMounted(() => {
  const saved = localStorage.getItem('theme')
  isDark.value = saved === 'dark'
  applyTheme(isDark.value)
})

// ── Nav ────────────────────────────────────────────────────────────────────
function isActive(path: string) { return route.path === path }
function handleLogout() { logout(); router.replace('/login') }

const initials = () => {
  const email = currentUser.value?.email ?? ''
  return email.substring(0, 2).toUpperCase()
}

const navLinks = [
  { label: 'Dashboard',       path: '/dashboard', icon: `<path stroke-linecap="round" stroke-linejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/>` },
  { label: 'Students',        path: '/students',  icon: `<path stroke-linecap="round" stroke-linejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/>` },
  { label: 'Received',        path: '/received',  icon: `<path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>` },
  { label: 'Import Students', path: '/import',    icon: `<path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/>` },
  { label: 'List of Backout', path: '/backout',   icon: `<path stroke-linecap="round" stroke-linejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"/>` },
]

const settingsLink = {
  label: 'Settings',
  path: '/settings',
  icon: `<path stroke-linecap="round" stroke-linejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>`
}

const isOnLogin = () => route.path === '/login'
</script>

<template>
  <div class="flex h-screen overflow-hidden bg-gray-50 dark:bg-gray-950 transition-colors duration-200">

    <!-- ── Mobile overlay backdrop ─────────────────────────────── -->
    <Transition enter-active-class="transition-opacity duration-200" enter-from-class="opacity-0" enter-to-class="opacity-100"
                leave-active-class="transition-opacity duration-200" leave-from-class="opacity-100" leave-to-class="opacity-0">
      <div
        v-if="!isOnLogin() && isMobile && sidebarOpen"
        class="fixed inset-0 z-30 bg-black/50 backdrop-blur-sm"
        @click="sidebarOpen = false"
      />
    </Transition>

    <!-- ── Sidebar ─────────────────────────────────────────────── -->
    <aside
      v-if="!isOnLogin()"
      :class="[
        'flex flex-col bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 shadow-sm transition-all duration-300 ease-in-out flex-shrink-0',
        // Mobile: fixed overlay drawer, slides in/out
        isMobile
          ? 'fixed inset-y-0 left-0 z-40 ' + (sidebarOpen ? 'w-60 translate-x-0' : 'w-60 -translate-x-full')
          // Desktop: icon-only (w-16) or full (w-60), no translate
          : (sidebarOpen ? 'w-60' : 'w-16')
      ]"
    >
      <!-- Logo area -->
      <div :class="['border-b border-gray-100 dark:border-gray-800 overflow-hidden flex-shrink-0', sidebarOpen ? 'px-5 py-5' : 'px-0 py-4 flex flex-col items-center']">
        <!-- Expanded: full logo -->
        <div v-if="sidebarOpen" class="flex items-center gap-2.5">
          <div class="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 bg-sync-green">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/>
            </svg>
          </div>
          <div class="leading-tight min-w-0">
            <p class="text-xs font-bold text-sync-green uppercase tracking-widest">CCS</p>
            <h1 class="text-sm font-bold text-gray-800 dark:text-white leading-none">Delegates System</h1>
          </div>
        </div>
        <div v-if="sidebarOpen" class="mt-3 pl-0.5">
          <span class="gradient-title text-xl">CCS-DELEGATES</span>
          <p class="text-gray-400 dark:text-gray-500 text-xs mt-0.5">Paid &amp; Received Tracker</p>
        </div>
        <!-- Collapsed: icon only -->
        <div v-else class="w-9 h-9 rounded-lg flex items-center justify-center bg-sync-green">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/>
          </svg>
        </div>
      </div>

      <!-- Nav links -->
      <nav :class="['flex-1 py-4 overflow-y-auto overflow-x-hidden', sidebarOpen ? 'space-y-0.5 px-3' : 'space-y-1 px-2']">
        <button
          v-for="link in navLinks" :key="link.label"
          @click="navigate(link.path)"
          :title="!sidebarOpen ? link.label : undefined"
          :class="[
            'w-full flex items-center rounded-lg text-sm font-medium transition-all duration-150 group relative',
            sidebarOpen ? 'gap-3 px-3 py-2.5' : 'justify-center px-0 py-2.5',
            isActive(link.path)
              ? 'bg-sync-green text-white shadow-sm'
              : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white'
          ]"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" v-html="link.icon"/>
          <!-- Label: only shown when expanded -->
          <span v-if="sidebarOpen" class="truncate">{{ link.label }}</span>
          <!-- Tooltip: only shown when collapsed on desktop -->
          <span v-if="!sidebarOpen && !isMobile"
            class="absolute left-full ml-3 px-2.5 py-1.5 rounded-md text-xs font-medium bg-gray-900 dark:bg-gray-700 text-white whitespace-nowrap pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-50 shadow-lg">
            {{ link.label }}
          </span>
        </button>
      </nav>

      <!-- Bottom: Settings + Logout -->
      <div :class="['border-t border-gray-100 dark:border-gray-800 pt-3 pb-3 overflow-x-hidden', sidebarOpen ? 'px-3 space-y-0.5' : 'px-2 space-y-1 flex flex-col items-stretch']">
        <button
          v-if="isSuperAdmin"
          @click="navigate(settingsLink.path)"
          :title="!sidebarOpen ? settingsLink.label : undefined"
          :class="[
            'w-full flex items-center rounded-lg text-sm font-medium transition-all duration-150 group relative',
            sidebarOpen ? 'gap-3 px-3 py-2.5' : 'justify-center px-0 py-2.5',
            isActive(settingsLink.path)
              ? 'bg-sync-green text-white shadow-sm'
              : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white'
          ]"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" v-html="settingsLink.icon"/>
          <span v-if="sidebarOpen" class="truncate">{{ settingsLink.label }}</span>
          <span v-if="!sidebarOpen && !isMobile"
            class="absolute left-full ml-3 px-2.5 py-1.5 rounded-md text-xs font-medium bg-gray-900 dark:bg-gray-700 text-white whitespace-nowrap pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-50 shadow-lg">
            {{ settingsLink.label }}
          </span>
        </button>

        <button @click="handleLogout"
          :title="!sidebarOpen ? 'Logout' : undefined"
          :class="[
            'w-full flex items-center rounded-lg text-sm font-medium transition-all duration-150 group relative text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600',
            sidebarOpen ? 'gap-3 px-3 py-2.5' : 'justify-center px-0 py-2.5'
          ]"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/>
          </svg>
          <span v-if="sidebarOpen">Logout</span>
          <span v-if="!sidebarOpen && !isMobile"
            class="absolute left-full ml-3 px-2.5 py-1.5 rounded-md text-xs font-medium bg-gray-900 dark:bg-gray-700 text-white whitespace-nowrap pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-50 shadow-lg">
            Logout
          </span>
        </button>
      </div>

      <!-- Footer: only when expanded -->
      <div v-if="sidebarOpen" class="px-5 py-3 border-t border-gray-100 dark:border-gray-800 flex-shrink-0">
        <p class="text-gray-400 text-xs">TFVC Delegates System</p>
        <p class="text-gray-300 dark:text-gray-600 text-xs">AY 2025–2026</p>
      </div>
    </aside>

    <!-- ── Main area ──────────────────────────────────────────── -->
    <div class="flex-1 flex flex-col overflow-hidden min-w-0">

      <!-- Top bar -->
      <header
        v-if="!isOnLogin()"
        class="h-12 flex items-center justify-between px-3 sm:px-4 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 flex-shrink-0 transition-colors duration-200 gap-2 z-20"
      >
        <!-- Left: sidebar toggle -->
        <button
          @click="toggleSidebar"
          class="flex items-center justify-center w-8 h-8 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors flex-shrink-0"
          :title="sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'"
        >
          <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 12h16M4 18h16"/>
          </svg>
        </button>

        <!-- Right: dark mode + profile -->
        <div class="flex items-center gap-2 ml-auto">
          <!-- Dark mode toggle -->
          <button @click="toggleTheme"
            class="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
            <svg v-if="isDark" class="w-4 h-4 text-yellow-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m12.728 0l-.707-.707M6.343 6.343l-.707-.707M12 8a4 4 0 100 8 4 4 0 000-8z"/>
            </svg>
            <svg v-else class="w-4 h-4 text-gray-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"/>
            </svg>
            <span class="hidden sm:inline">{{ isDark ? 'Light' : 'Dark' }}</span>
          </button>

          <!-- Profile chip -->
          <div class="flex items-center gap-2 pl-2 border-l border-gray-200 dark:border-gray-700">
            <div class="w-7 h-7 rounded-full bg-sync-green flex items-center justify-center flex-shrink-0">
              <span class="text-white text-xs font-bold leading-none">{{ initials() }}</span>
            </div>
            <div class="leading-tight hidden sm:block max-w-[160px]">
              <p class="text-xs font-medium text-gray-800 dark:text-gray-100 leading-none truncate">{{ currentUser?.email ?? '—' }}</p>
              <p class="text-xs mt-0.5" :class="isSuperAdmin ? 'text-sync-green font-semibold' : 'text-gray-400'">
                {{ isSuperAdmin ? 'Super Admin' : 'User' }}
              </p>
            </div>
          </div>
        </div>
      </header>

      <!-- Page content -->
      <main class="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-950 transition-colors duration-200">
        <RouterView />
      </main>
    </div>

  </div>
</template>
