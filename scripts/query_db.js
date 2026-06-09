const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing config, check paths');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function main() {
  console.log('Querying chargers...');
  const { data: chargers, error: err1 } = await supabase.from('chargers').select('*');
  if (err1) console.error(err1);
  else console.log('Chargers:', chargers);

  console.log('\nQuerying last 10 logs...');
  const { data: logs, error: err2 } = await supabase.from('ocpp_logs').select('*').order('created_at', { ascending: false }).limit(10);
  if (err2) console.error(err2);
  else console.log('Logs:', logs);
}

main();
