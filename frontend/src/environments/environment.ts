export const environment = {
  production: false,
  // Bump alongside package.json's version, backend/Directory.Build.props's <Version>, and
  // the other two environment files together on release - see docs/WORKFLOW.md.
  version: '1.0.0',
  // Relative on purpose: proxy.conf.json forwards /api to the backend during
  // `ng serve`, so the browser always calls the SAME origin it loaded the app
  // from. A hardcoded https://localhost:5001/api only works when the browser
  // itself is on this machine - relative + same-origin proxying is what lets
  // the app also work through a tunnel (e.g. ngrok) exposing only the frontend port.
  apiBaseUrl: '/api',
  // Single source of truth for product branding in the UI (navbar, footer, checkout).
  // Keep in sync with "App:Name" in the backend's appsettings.json if the project is renamed.
  appName: 'Datamint',
  // null until a real logo exists - navbar/footer fall back to a plain letter mark until
  // then. Set to a URL (e.g. '/assets/logo.svg' after dropping the file into src/assets)
  // to switch every brand mark over automatically, same as the backend's App:LogoUrl.
  logoUrl: null as string | null,
  // >>> Paste the SAME Google OAuth Web Client ID used in the backend appsettings.json <<<
  googleClientId: '1037509001460-5uqo0jqbcrnpne9509s4dac5gfi6t7td.apps.googleusercontent.com'
};
