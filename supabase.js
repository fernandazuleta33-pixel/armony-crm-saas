const SUPABASE_URL='https://TU_URL.supabase.co'
const SUPABASE_KEY='TU_ANON_KEY'
const db=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY)
window.db=db
