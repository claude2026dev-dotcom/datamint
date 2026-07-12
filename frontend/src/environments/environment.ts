export const environment = {
  production: false,
  // Relative on purpose: proxy.conf.json forwards /api to the backend during
  // `ng serve`, so the browser always calls the SAME origin it loaded the app
  // from. A hardcoded https://localhost:5001/api only works when the browser
  // itself is on this machine - relative + same-origin proxying is what lets
  // the app also work through a tunnel (e.g. ngrok) exposing only the frontend port.
  apiBaseUrl: '/api',
  // >>> Paste the SAME Google OAuth Web Client ID used in the backend appsettings.json <<<
  googleClientId: '1037509001460-5uqo0jqbcrnpne9509s4dac5gfi6t7td.apps.googleusercontent.com',
  // >>> Razorpay public Key ID (safe to expose client-side) <<<
  razorpayKeyId: 'YOUR_RAZORPAY_KEY_ID'
};
