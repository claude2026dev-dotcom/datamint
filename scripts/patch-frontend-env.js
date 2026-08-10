// azd predeploy hook for the `web` service.
// Rewrites frontend/src/environments/environment.prod.ts's apiBaseUrl/googleClientId with the
// real values produced by `azd provision`, before `npm run build` (which bakes environment.prod.ts
// into the compiled bundle via Angular's fileReplacements - this is why it must run BEFORE build,
// not as a runtime config fetch).
const fs = require('fs');
const path = require('path');

const apiUrl = process.env.API_URL;
if (!apiUrl) {
  console.error('ERROR: API_URL is not set in the azd environment. Run `azd provision` first.');
  process.exit(1);
}

const envFile = path.join(__dirname, '..', 'frontend', 'src', 'environments', 'environment.prod.ts');
let content = fs.readFileSync(envFile, 'utf8');

content = content.replace(
  /apiBaseUrl:\s*'[^']*'/,
  `apiBaseUrl: '${apiUrl.replace(/\/$/, '')}/api'`
);

if (process.env.GOOGLE_CLIENT_ID) {
  content = content.replace(
    /googleClientId:\s*'[^']*'/,
    `googleClientId: '${process.env.GOOGLE_CLIENT_ID}'`
  );
}

fs.writeFileSync(envFile, content);
console.log(`Patched environment.prod.ts -> apiBaseUrl = ${apiUrl}/api`);
