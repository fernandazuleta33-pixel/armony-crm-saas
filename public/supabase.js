import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'
const SUPABASE_URL ='https://jqvpjnetjzargolrppyq.supabase.co'
const SUPABASE_KEY ='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpxdnBqbmV0anphcmdvbHJwcHlxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0MzgxOTcsImV4cCI6MjA5MTAxNDE5N30.DGiyZuypfCiIxD4kzENLLpXT-i2Fb-K2B5Ez4wyClxk'
export const sb = createClient(SUPABASE_URL, SUPABASE_KEY)

export async function getEmpresaId() {
  try {
    const { data: { user } } = await sb.auth.getUser()
    if (!user) return null
    const { data, error } = await sb.from('usuarios').select('empresa_id').eq('id', user.id).single()
    if (error) { console.error('getEmpresaId error:', error); return null }
    return data?.empresa_id ?? null
  } catch (e) { console.error('getEmpresaId exception:', e); return null }
}

export async function getCurrentUser() {
  try {
    const { data: { user } } = await sb.auth.getUser()
    if (!user) return null
    const { data, error } = await sb.from('usuarios').select('*').eq('id', user.id).single()
    if (error) { console.error('getCurrentUser error:', error); return null }
    return data
  } catch (e) { console.error('getCurrentUser exception:', e); return null }
}
