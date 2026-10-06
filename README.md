# The Author's Desk

An AI-assisted writing studio for novelists: chapters, scenes, characters and lore, with an AI co-writer, version history, goals and manuscript export.

- **Frontend:** React + Vite + Tailwind
- **Data & sign-in:** Firebase (Firestore + Google Auth)
- **AI backend:** `server/handlers.ts`. Locally it runs on Express (`server.ts`); on Vercel it runs as serverless functions (`api/*.ts`).

## Run locally

```bash
npm install
cp .env.example .env   # optional: add server-side API keys
npm run dev            # http://localhost:3000
```

## Deploy to Vercel

1. Push this repo to GitHub, then on [vercel.com/new](https://vercel.com/new) import it. Vercel reads `vercel.json`, so no build settings need changing. It builds the site with `vite build` into `dist/` and turns `api/*.ts` into functions.
2. *(Optional)* Under **Settings → Environment Variables**, add any of the keys from `.env.example`. If you skip this, each user enters their own key in the app's Settings.
3. **Allow sign-in from your Vercel domain.** In the [Firebase console](https://console.firebase.google.com/project/silly-464018/authentication/settings), go to **Authentication → Settings → Authorized domains** and add `your-project.vercel.app` (plus any custom domain). Without this, Google sign-in fails with `auth/unauthorized-domain`.
4. Deploy. Later pushes to the main branch redeploy automatically.

AI functions are allowed to run for up to 300 seconds (`maxDuration` in `vercel.json`). If your Vercel plan has a lower limit, lower that number.

## Deploy the Firestore security rules

The app's database is a **named** Firestore database (`ai-studio-d8dc480e-…`), not `(default)`, so make sure you update the right one.

**Option A: Firebase console (no tools needed)**

1. Open [Firestore in the Firebase console](https://console.firebase.google.com/project/silly-464018/firestore).
2. Use the database dropdown at the top to select `ai-studio-d8dc480e-411f-46a3-a886-c00dd14a31f3`.
3. Open the **Rules** tab, replace everything with the contents of `firestore.rules`, and click **Publish**.

**Option B: Firebase CLI**

`firebase.json` and `.firebaserc` already point at the right project and database:

```bash
npx firebase-tools login     # once
npm run deploy:rules         # = firebase deploy --only firestore:rules
```

Rules take effect within about a minute.
