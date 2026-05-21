export const runtimeConfig = {
  assistantApiBase: import.meta.env.VITE_ASSISTANT_API_URL?.trim() || '/api',
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL ?? '',
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? '',
}

export function resolveAssistantApiUrl(path: string) {
  const base = runtimeConfig.assistantApiBase.replace(/\/+$/, '')
  const suffix = path.startsWith('/') ? path : `/${path}`
  return `${base}${suffix}`
}

export function hasSupabaseConfig() {
  return (
    runtimeConfig.supabaseUrl.trim().length > 0 &&
    runtimeConfig.supabaseAnonKey.trim().length > 0
  )
}
