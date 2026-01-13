import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(2)
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

async function ensureAdmin() {
  const email = process.env.ADMIN_EMAIL || 'admin@example.com'
  const password = process.env.ADMIN_PASSWORD || 'ChangeMe123!'

  const { data: existing } = await supabase.auth.admin.listUsers()
  const found = existing?.find(u => u.email === email)
  if (found) {
    console.log('Admin already exists:', email)
    return
  }

  const { user, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  } as any)
  if (error) {
    console.error('Failed creating admin user', error)
    process.exit(3)
  }

  console.log('Created admin user:', user?.email)

  // Optionally insert into profiles table if present
  try {
    if (user?.id) {
      const { error: pe } = await supabase.from('profiles').upsert({
        id: user.id,
        email: user.email,
        role: 'admin',
      })
      if (pe) console.warn('Failed upserting profile:', pe)
    }
  } catch (e) {
    console.warn('Skipping profile upsert:', e)
  }
}

ensureAdmin().then(()=> process.exit(0)).catch(err => { console.error(err); process.exit(4) })
