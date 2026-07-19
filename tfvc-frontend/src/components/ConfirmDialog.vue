<script setup lang="ts">
defineProps<{
  open:      boolean
  title:     string
  message:   string
  confirmLabel?: string
  confirmClass?: string
  loading?:  boolean
}>()

const emit = defineEmits<{
  (e: 'confirm'): void
  (e: 'cancel'):  void
}>()
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition duration-150 ease-out"
      enter-from-class="opacity-0 scale-95"
      enter-to-class="opacity-100 scale-100"
      leave-active-class="transition duration-100 ease-in"
      leave-from-class="opacity-100 scale-100"
      leave-to-class="opacity-0 scale-95"
    >
      <div
        v-if="open"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
        @click.self="emit('cancel')"
      >
        <div class="card w-full max-w-sm mx-4 shadow-2xl">
          <!-- Header -->
          <div class="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center gap-3">
            <div class="w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center flex-shrink-0">
              <svg class="w-4 h-4 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
              </svg>
            </div>
            <h3 class="text-sm font-semibold text-gray-800 dark:text-white">{{ title }}</h3>
          </div>

          <!-- Body -->
          <div class="px-5 py-4">
            <p class="text-sm text-gray-600 dark:text-gray-300">{{ message }}</p>
          </div>

          <!-- Footer -->
          <div class="px-5 py-3 border-t border-gray-100 dark:border-gray-800 flex items-center justify-end gap-2">
            <button
              @click="emit('cancel')"
              :disabled="loading"
              class="btn-secondary text-xs px-4 py-1.5 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              @click="emit('confirm')"
              :disabled="loading"
              :class="['inline-flex items-center gap-1.5 text-xs px-4 py-1.5 rounded-md font-medium transition-colors disabled:opacity-50', confirmClass ?? 'btn-primary']"
            >
              <svg v-if="loading" class="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
              </svg>
              {{ loading ? 'Processing...' : (confirmLabel ?? 'Confirm') }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
