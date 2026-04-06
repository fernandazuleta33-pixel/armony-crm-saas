import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'
const supabase = createClient ('https://jqvpjnetjzargolrppyq.supabase.co',

'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpxdnBqbmV0anphcmdvbHJwcHlxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0MzgxOTcsImV4cCI6MjA5MTAxNDE5N30.DGiyZuypfCiIxD4kzENLLpXT-i2Fb-K2B5Ez4wyClxk'
)
export async function getEmpresaId() {
  const { data: userData } = await supabase.auth.getUser()

  const { data } = await supabase
    .from('usuarios')
    .select('empresa_id')
    .eq('id', userData.user.id)
    .single()

  return data?.empresa_id
}

export default supabase
