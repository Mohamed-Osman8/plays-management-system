# PlayStation Game Zone

React/Vite client for the PlayStation store management SaaS.

## Run locally

1. Start the Express API from `server` after configuring `server/.env`.
2. From `client`, run `npm run dev`.
3. Open the Vite URL shown in the terminal. The API defaults to `http://localhost:5001/api`; set `VITE_API_URL` in `client/.env` when using another API URL.

## Shop onboarding and demo

- **Try Demo Mode Instantly** opens an interactive dashboard with sample-only data. Demo actions are held in browser memory and never write to MongoDB.
- **Start 2-Month Free Trial** creates a shop and owner account. Registration accepts a shop name, phone number and password; the phone number can also be used to sign in.
- The API assigns a 60-day trial. The platform owner reviews manual Telebirr/CBE payments in `#super-admin` and can approve them by extending a shop's license by 30 days.
- Operational documents include a `shopId`. The API scopes tenant queries, aggregation pipelines and bulk inserts to the authenticated shop. Station names and product SKUs can be reused by different shops.

Set `SUPER_ADMIN_USERNAME` and `SUPER_ADMIN_PASSWORD` in the server environment before using the platform administration screen. Keep those credentials private and use HTTPS in production.

## PWA

The app includes a web manifest and a service worker. Home-screen installation requires HTTPS in deployment (localhost is allowed for development). On Android, use Chrome's **Install app / Add to Home screen** menu; on iOS, use Safari's **Share → Add to Home Screen**.
