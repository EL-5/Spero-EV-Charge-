const fs = require('fs');
const envFile = fs.readFileSync('.env.local', 'utf8');
const dbUrlMatch = envFile.match(/DATABASE_URL=["']?([^"'\n]+)/);
if (dbUrlMatch) {
  const dbUrl = dbUrlMatch[1];
  const { execSync } = require('child_process');
  try {
    execSync(`psql "${dbUrl}" -c "ALTER TABLE settings ADD COLUMN IF NOT EXISTS gateway_host TEXT, ADD COLUMN IF NOT EXISTS gateway_port TEXT;"`, { stdio: 'inherit' });
    console.log('Success via psql');
  } catch(e) {
    console.log('psql failed');
  }
} else {
  console.log('No DB URL');
}
