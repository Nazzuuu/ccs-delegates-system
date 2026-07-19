import { ref, computed } from 'vue'
import { fetchAppUserByEmail } from '../api/strapi'

// ── Hardcoded super-admin ───────────────────────────────────────────────────
const SUPER_ADMIN_EMAIL    = 'nazzrodin01@gmail.com'
const SUPER_ADMIN_PASSWORD = 'nazzrodin01admin'

const SESSION_KEY  = 'ccs_auth'
const SESSION_USER = 'ccs_user'

export interface SessionUser {
  email:        string
  isSuperAdmin: boolean  // true only for the hardcoded programmer account
}

// ── Shared reactive state ───────────────────────────────────────────────────
export const isAuthenticated = ref<boolean>(
  localStorage.getItem(SESSION_KEY) === 'true'
)

export const currentUser = ref<SessionUser | null>(
  (() => {
    try {
      const raw = localStorage.getItem(SESSION_USER)
      return raw ? JSON.parse(raw) : null
    } catch { return null }
  })()
)

// Convenience computed — use anywhere in the app
export const isSuperAdmin = computed(() =>
  currentUser.value?.isSuperAdmin === true
)

// ── Login ───────────────────────────────────────────────────────────────────
export async function login(email: string, password: string): Promise<boolean> {
  // 1. Super-admin — hardcoded, works offline
  if (email === SUPER_ADMIN_EMAIL && password === SUPER_ADMIN_PASSWORD) {
    _setSession({ email: SUPER_ADMIN_EMAIL, isSuperAdmin: true })
    return true
  }

  // 2. Regular accounts stored in Strapi app-users collection
  try {
    const user = await fetchAppUserByEmail(email)
    if (user && user.password === password) {
      _setSession({ email: user.email, isSuperAdmin: false })
      return true
    }
  } catch {
    // Strapi unreachable — only super-admin can log in offline
  }

  return false
}

export function logout() {
  isAuthenticated.value = false
  currentUser.value     = null
  localStorage.removeItem(SESSION_KEY)
  localStorage.removeItem(SESSION_USER)
}

function _setSession(user: SessionUser) {
  isAuthenticated.value = true
  currentUser.value     = user
  localStorage.setItem(SESSION_KEY,  'true')
  localStorage.setItem(SESSION_USER, JSON.stringify(user))
}
