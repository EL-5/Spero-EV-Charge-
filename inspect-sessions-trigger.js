const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envPath = 'c:\\Users\\theop\\scms\\.env.local';
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

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

async function inspect() {
  console.log('--- Sessions Table Update Test ---');

  // 1. Fetch a session
  const { data: sessions } = await supabaseAdmin.from('sessions').select('id, status, payment_status, mode').limit(1);
  if (!sessions || sessions.length === 0) {
    console.log('No sessions found.');
    return;
  }
  
  const testSession = sessions[0];
  console.log('Original Session:', testSession);

  // 2. Try updating status to 'completed'
  console.log('Updating status to "completed"...');
  const { error: updateErr } = await supabaseAdmin
    .from('sessions')
    .update({ status: 'completed' })
    .eq('id', testSession.id);

  if (updateErr) {
    console.error('Update failed:', updateErr);
    return;
  }

  // 3. Fetch again to verify
  const { data: updatedSession } = await supabaseAdmin
    .from('sessions')
    .select('id, status, payment_status, mode')
    .eq('id', testSession.id)
    .single();

  console.log('Updated Session in DB:', updatedSession);

  // 4. Restore original status
  await supabaseAdmin
    .from('sessions')
    .update({ status: testSession.status })
    .eq('id', testSession.id);
  console.log('Restored original status.');
}

inspect();
