const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Manually parse .env.local
const envPath = path.resolve(process.cwd(), '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    let value = match[2] || '';
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    env[match[1]] = value;
  }
});

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Error: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local');
  process.exit(1);
}

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

async function promoteToSuperAdmin(email) {
  console.log(`--- Promoting ${email} to Super Admin ---`);
  try {
    // 1. Find user in auth.users
    const { data: { users }, error: listError } = await supabaseAdmin.auth.admin.listUsers();
    
    if (listError) {
      console.error('Error listing users:', listError.message);
      return;
    }

    const user = users.find(u => u.email?.toLowerCase() === email.toLowerCase());

    if (!user) {
      console.error(`User with email ${email} not found.`);
      return;
    }

    console.log(`Found User ID: ${user.id}`);

    // 2. Update role in profiles table
    const { error: updateError } = await supabaseAdmin
      .from('profiles')
      .update({ role: 'super_admin', is_active: true })
      .eq('id', user.id);

    if (updateError) {
      console.error('Error updating profile:', updateError.message);
      return;
    }

    console.log(`SUCCESS: ${email} is now a Super Admin.`);
  } catch (err) {
    console.error('Connection error:', err.message);
  }
  console.log('-------------------------------------------');
}

const emailToPromote = process.argv[2];
if (!emailToPromote) {
  console.log('Usage: node scripts/promote-user-v2.js <email>');
  process.exit(1);
}

promoteToSuperAdmin(emailToPromote);
