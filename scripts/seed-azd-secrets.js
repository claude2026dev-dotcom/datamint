// Dev utility: pushes this machine's local appsettings.json secrets into the current azd
// environment (plain `azd env set`, stored in the gitignored .azure/<env>/.env - same
// "plaintext locally, never committed" convention as appsettings.json itself), so
// `azd provision` can supply them to Key Vault via main.parameters.json substitution without
// ever typing the raw values into a shell command or committing them anywhere. Safe to re-run
// (idempotent overwrite). Run once per machine, right after `azd env new`/`azd init`.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const appsettingsPath = path.join(__dirname, '..', 'backend', 'src', 'Datamint.API', 'appsettings.json');
if (!fs.existsSync(appsettingsPath)) {
  console.error(`ERROR: ${appsettingsPath} not found. Copy it from appsettings.json.example and fill in real values first.`);
  process.exit(1);
}
const config = JSON.parse(fs.readFileSync(appsettingsPath, 'utf8'));

const azdVarToConfigPath = {
  JWT_SECRET: ['Jwt', 'Secret'],
  EMAIL_PASSWORD: ['Email', 'Password'],
  CLAUDE_API_KEY: ['Claude', 'ApiKey'],
  OPENAI_API_KEY: ['OpenAI', 'ApiKey'],
};

for (const [azdVar, [section, key]] of Object.entries(azdVarToConfigPath)) {
  const value = config[section]?.[key];
  if (!value) {
    console.log(`Skipping ${azdVar} - no value at ${section}.${key} in local appsettings.json`);
    continue;
  }
  execFileSync('azd', ['env', 'set', azdVar, value], { stdio: ['ignore', 'ignore', 'inherit'] });
  console.log(`Set ${azdVar} (value not printed)`);
}

const googleClientId = config.GoogleAuth?.ClientId;
if (googleClientId) {
  execFileSync('azd', ['env', 'set', 'GOOGLE_CLIENT_ID', googleClientId], { stdio: 'inherit' });
  console.log('Set GOOGLE_CLIENT_ID');
}

console.log('Done. Run `azd provision` next.');
