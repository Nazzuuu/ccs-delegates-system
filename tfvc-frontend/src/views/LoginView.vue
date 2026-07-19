<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { login } from '../composables/useAuth'
import { createAppUser, fetchAppUserByEmail } from '../api/strapi'

const router = useRouter()

// ── Mode toggle ─────────────────────────────────────────────────────────────
const mode = ref<'login' | 'register'>('login')

// ── Shared fields ────────────────────────────────────────────────────────────
const email       = ref('')
const password    = ref('')
const showPass    = ref(false)
const errorMsg    = ref('')
const successMsg  = ref('')
const isLoading   = ref(false)

// ── Register-only fields ─────────────────────────────────────────────────────
const confirmPassword = ref('')
const showConfirm     = ref(false)

function switchMode(m: 'login' | 'register') {
  mode.value       = m
  errorMsg.value   = ''
  successMsg.value = ''
  password.value   = ''
  confirmPassword.value = ''
}

// ── Login ────────────────────────────────────────────────────────────────────
async function handleLogin() {
  errorMsg.value = ''
  if (!email.value.trim() || !password.value) {
    errorMsg.value = 'Please enter your email and password.'
    return
  }
  isLoading.value = true
  await new Promise(r => setTimeout(r, 400))
  const ok = await login(email.value.trim(), password.value)
  isLoading.value = false
  if (ok) {
    router.replace('/dashboard')
  } else {
    errorMsg.value = 'Invalid email or password.'
    password.value = ''
  }
}

// ── Register ─────────────────────────────────────────────────────────────────
async function handleRegister() {
  errorMsg.value   = ''
  successMsg.value = ''

  if (!email.value.trim() || !password.value || !confirmPassword.value) {
    errorMsg.value = 'Please fill in all fields.'
    return
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())) {
    errorMsg.value = 'Please enter a valid email address.'
    return
  }
  if (password.value.length < 6) {
    errorMsg.value = 'Password must be at least 6 characters.'
    return
  }
  if (password.value !== confirmPassword.value) {
    errorMsg.value = 'Passwords do not match.'
    return
  }

  isLoading.value = true
  try {
    // Check if email already exists
    const existing = await fetchAppUserByEmail(email.value.trim())
    if (existing) {
      errorMsg.value = 'An account with this email already exists.'
      isLoading.value = false
      return
    }

    await createAppUser({ email: email.value.trim(), password: password.value, isAdmin: false })
    successMsg.value = 'Account created! You can now log in.'
    mode.value            = 'login'
    password.value        = ''
    confirmPassword.value = ''
  } catch (e: any) {
    errorMsg.value = e.message ?? 'Failed to create account. Make sure Strapi is running.'
  } finally {
    isLoading.value = false
  }
}
</script>

<template>
  <div class="flex h-screen w-full overflow-hidden">

    <!-- ── Left dark panel ───────────────────────────────────── -->
    <div class="hidden lg:flex w-1/2 bg-gray-950 flex-col justify-between p-10 relative overflow-hidden">
      <div class="absolute inset-0 opacity-5"
        style="background-image: radial-gradient(circle at 25% 25%, #22c55e 0%, transparent 50%), radial-gradient(circle at 75% 75%, #16a34a 0%, transparent 50%);">
      </div>

      <!-- Logo -->
      <div class="relative z-10 flex items-center gap-3">
        <div class="w-10 h-10 rounded-xl bg-sync-green flex items-center justify-center">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/>
          </svg>
        </div>
        <div>
          <p class="text-xs font-bold text-sync-green uppercase tracking-widest">CCS</p>
          <p class="text-sm font-bold text-white leading-none">Delegates System</p>
        </div>
      </div>

      <!-- Quote -->
      <div class="relative z-10">
        <div class="border-trace">
          <blockquote class="text-2xl font-semibold leading-snug text-shimmer">
            "Managing delegates, one payment at a time. The modern standard for CCS tracking."
          </blockquote>
          <p class="text-gray-500 text-sm mt-3">— Built for CCS delegates, AY 2025–2026</p>
        </div>
      </div>

      <!-- Brand -->
      <div class="relative z-10">
        <span class="text-shimmer-green text-3xl font-extrabold tracking-tight">CCS-DELEGATES</span>
        <p class="text-gray-600 text-xs mt-1">Paid & Received Tracker</p>
      </div>
    </div>

    <!-- ── Right form panel ──────────────────────────────────── -->
    <div class="flex-1 flex items-center justify-center bg-white dark:bg-gray-950 px-8">
      <div class="w-full max-w-sm">

        <!-- Mobile logo -->
        <div class="flex items-center gap-2 mb-8 lg:hidden">
          <div class="w-8 h-8 rounded-lg bg-sync-green flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/>
            </svg>
          </div>
          <span class="font-bold text-gray-800 dark:text-white text-sm">CCS Delegates System</span>
        </div>

        <!-- Heading -->
        <div class="mb-6">
          <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
            {{ mode === 'login' ? 'Welcome back' : 'Create account' }}
          </h1>
          <p class="text-gray-500 text-sm mt-1">
            {{ mode === 'login' ? 'Enter your credentials to access the system' : 'Register a new account to get started' }}
          </p>
        </div>

        <!-- Success alert (after register) -->
        <div v-if="successMsg" class="mb-5 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 text-green-700 dark:text-green-300 rounded-lg px-4 py-3 text-sm flex items-center gap-2">
          <svg class="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
          {{ successMsg }}
        </div>

        <!-- Error alert -->
        <div v-if="errorMsg" class="mb-5 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 text-red-700 dark:text-red-300 rounded-lg px-4 py-3 text-sm flex items-center gap-2">
          <svg class="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
          </svg>
          {{ errorMsg }}
        </div>

        <!-- ── LOGIN FORM ── -->
        <form v-if="mode === 'login'" @submit.prevent="handleLogin" class="space-y-5">
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Email</label>
            <input v-model="email" type="email" placeholder="name@example.com"
              autocomplete="email" class="input-search" :disabled="isLoading"/>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Password</label>
            <div class="relative">
              <input v-model="password" :type="showPass ? 'text' : 'password'"
                placeholder="Enter password" autocomplete="current-password"
                class="input-search pr-10" :disabled="isLoading"/>
              <button type="button" @click="showPass = !showPass" tabindex="-1"
                class="absolute inset-y-0 right-3 flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                <svg v-if="!showPass" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                  <path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                </svg>
                <svg v-else class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"/>
                </svg>
              </button>
            </div>
          </div>

          <button type="submit" :disabled="isLoading"
            class="w-full btn-primary py-2.5 flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed">
            <svg v-if="isLoading" class="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
            </svg>
            {{ isLoading ? 'Signing in...' : 'Log in to Account' }}
          </button>

          <p class="text-center text-sm text-gray-500">
            Don't have an account?
            <button type="button" @click="switchMode('register')"
              class="text-sync-green font-medium hover:underline">
              Create one
            </button>
          </p>
        </form>

        <!-- ── REGISTER FORM ── -->
        <form v-else @submit.prevent="handleRegister" class="space-y-5">
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Email</label>
            <input v-model="email" type="email" placeholder="name@example.com"
              autocomplete="email" class="input-search" :disabled="isLoading"/>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Password</label>
            <div class="relative">
              <input v-model="password" :type="showPass ? 'text' : 'password'"
                placeholder="At least 6 characters" autocomplete="new-password"
                class="input-search pr-10" :disabled="isLoading"/>
              <button type="button" @click="showPass = !showPass" tabindex="-1"
                class="absolute inset-y-0 right-3 flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                <svg v-if="!showPass" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                  <path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                </svg>
                <svg v-else class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"/>
                </svg>
              </button>
            </div>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Confirm Password</label>
            <div class="relative">
              <input v-model="confirmPassword" :type="showConfirm ? 'text' : 'password'"
                placeholder="Re-enter password" autocomplete="new-password"
                class="input-search pr-10" :disabled="isLoading"/>
              <button type="button" @click="showConfirm = !showConfirm" tabindex="-1"
                class="absolute inset-y-0 right-3 flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                <svg v-if="!showConfirm" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                  <path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                </svg>
                <svg v-else class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"/>
                </svg>
              </button>
            </div>
          </div>

          <button type="submit" :disabled="isLoading"
            class="w-full btn-primary py-2.5 flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed">
            <svg v-if="isLoading" class="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
            </svg>
            {{ isLoading ? 'Creating...' : 'Create Account' }}
          </button>

          <p class="text-center text-sm text-gray-500">
            Already have an account?
            <button type="button" @click="switchMode('login')"
              class="text-sync-green font-medium hover:underline">
              Log in
            </button>
          </p>
        </form>

        <p class="text-center text-gray-400 text-xs mt-8">
          CCS Delegates System &mdash; AY 2025–2026
        </p>
      </div>
    </div>
  </div>
</template>
