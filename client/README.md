# PlayStation Game Zone

React/Vite client for the PlayStation store management SaaS.

## Run locally

1. Start the Express API from `server` after configuring `server/.env`.
2. From `client`, run `npm run dev`.
3. Open the Vite URL shown in the terminal. The API defaults to `http://localhost:5001/api`; set `VITE_API_URL` in `client/.env` when using another API URL.

## Shop onboarding and demo

- **Try Demo Mode Instantly** opens an interactive dashboard with sample-only data. Demo actions are held in browser memory and never write to MongoDB.
- Shop registration creates a shop and owner account using an email address as the sign-in identity. Phone numbers remain separate contact details for bookings and shop operations.
- The API assigns a free trial. The platform owner reviews manual Telebirr/CBE payments in `#super-admin` and can approve them by extending a shop's license by 30 days.
- Operational documents include a `shopId`. The API scopes tenant queries, aggregation pipelines and bulk inserts to the authenticated shop. Station names and product SKUs can be reused by different shops.

Set `SUPER_ADMIN_EMAIL` and `SUPER_ADMIN_PASSWORD` in the server environment before using the platform administration screen. Configure `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USER`, and `EMAIL_PASS` to deliver password-reset codes. Keep credentials private and use HTTPS in production.

Before deploying the email identity change to an existing database, run `npm run migrate:email-identities` from `server` to remove obsolete phone/username uniqueness indexes. Existing user accounts must be assigned unique email addresses before they can sign in; the migration does not infer email addresses from phone numbers.

## PWA

The Vite build uses `vite-plugin-pwa` to generate the web manifest and Workbox service worker. In production, the service worker precaches the app shell and updates/reloads clients automatically when a new deployment is available. API requests are not cached. PWA installation requires HTTPS (Vercel provides this on its production and preview domains; localhost is allowed for development).

The authenticated dashboard keeps an **Install app** button in its top bar until the app is installed. When a native prompt is available, a dismissible install suggestion appears; dismissing it does not remove the button. A site cannot force the browser to emit `beforeinstallprompt` or reopen a native prompt after the user dismisses it, so the button provides browser-menu install steps when needed. iPhone/iPad users get Safari's **Share → Add to Home Screen** instructions because iOS Safari does not expose that event. To verify on Vercel, deploy the production build, open the HTTPS URL in Chrome on Android, and check DevTools → Application for the manifest and active service worker. Local Vite development intentionally does not register the production service worker.

The service worker precaches the production HTML, JavaScript, CSS, and public assets; app navigation falls back to `index.html` for client-side routes. API traffic is network-only and also uses `cache: 'no-store'`, so operational/customer data is not served from a stale offline cache. Set `VITE_API_URL` to the HTTPS Express API URL in Vercel's frontend environment variables; production builds intentionally do not fall back to `localhost`. Also configure the backend's `CLIENT_ORIGIN` with the exact Vercel frontend origin(s), comma-separated when using more than one deployment URL, so Express CORS allows the deployed app.
