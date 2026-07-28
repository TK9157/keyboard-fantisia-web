# 🎹 Keyboard Fantasia — Supabase & Google Sign-In Setup Guide

Follow these steps to connect your player to Supabase and enable Google Sign-In.

---

## Step 1: Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and sign up / log in
2. Click **"New Project"**
3. Fill in:
   - **Name**: `keyboard-fantasia` (or anything you like)
   - **Database Password**: Choose a strong password (save it!)
   - **Region**: Pick the closest to you
4. Click **Create new project** — wait ~2 minutes for it to provision

---

## Step 2: Run the Database Migration

1. In your Supabase Dashboard, go to **SQL Editor** (left sidebar)
2. Click **"New query"**
3. Open the file `sql/migration.sql` from your project
4. **Copy the entire contents** and paste it into the SQL Editor
5. Click **"Run"** (or Ctrl+Enter)
6. You should see "Success. No rows returned" — this creates:
   - `cassettes` table (6 cassettes)
   - `tracks` table (60 tracks seeded)
   - `visitors` table (for tracking sign-ins)
   - `play_logs` table (for tracking plays)
   - RLS policies for security
   - `upsert_visitor` function

> **Verify**: Go to **Table Editor** → you should see the 4 tables with data

---

## Step 3: Get Your Supabase Keys

1. Go to **Project Settings** → **API** (left sidebar → gear icon)
2. Copy these two values:
   - **Project URL**: e.g., `https://abcdefg.supabase.co`
   - **anon / public key**: e.g., `eyJhbGciOiJIUzI1...`

3. Open `js/supabase-config.js` in your project and replace:
```javascript
var SUPABASE_CONFIG = {
  url: 'https://YOUR-PROJECT-ID.supabase.co',    // ← paste Project URL
  anonKey: 'eyJhbGciOiJI...'                      // ← paste anon key
};
```

---

## Step 4: Set Up Google OAuth

### 4a. Google Cloud Console

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project (or use existing)
3. Go to **APIs & Services** → **Credentials**
4. Click **"Create Credentials"** → **"OAuth 2.0 Client ID"**
5. If prompted, configure the OAuth consent screen first:
   - User type: **External**
   - App name: `Keyboard Fantasia`
   - Support email: your email
   - Authorized domains: add your Supabase domain (e.g., `supabase.co`)
   - Click **Save and Continue** through the remaining steps
6. Now create the OAuth 2.0 Client ID:
   - Application type: **Web application**
   - Name: `Keyboard Fantasia`
   - **Authorized redirect URIs**: Add:
     ```
     https://YOUR-PROJECT-ID.supabase.co/auth/v1/callback
     ```
     (Replace `YOUR-PROJECT-ID` with your actual Supabase project ID)
7. Click **Create**
8. Copy the **Client ID** and **Client Secret**

### 4b. Enable Google in Supabase

1. In Supabase Dashboard, go to **Authentication** → **Providers**
2. Find **Google** and click to expand
3. Toggle **Enable**
4. Paste your:
   - **Client ID** (from Google Cloud)
   - **Client Secret** (from Google Cloud)
5. Click **Save**

---

## Step 5: Create Storage Buckets (Optional)

If you want to upload songs to Supabase Storage:

1. Go to **Storage** (left sidebar)
2. Click **"New bucket"**:
   - Name: `audio`, Public: **ON** → Create
   - Name: `video`, Public: **ON** → Create
   - Name: `photos`, Public: **ON** → Create
3. Upload your media files to the respective buckets
4. Update the track URLs in the `tracks` table to use Supabase Storage URLs

> **For now**, you can skip this step — the player uses local `media/` files as fallback

---

## Step 6: Deploy Your App

The player needs to be hosted on a web server (not `file://`) for Google Sign-In to work.

### Option A: Vercel (Easiest)
1. Push your project to GitHub
2. Go to [vercel.com](https://vercel.com), connect your GitHub repo
3. Deploy — Vercel auto-detects it as a static site
4. Add your Vercel URL to Google OAuth **Authorized redirect URIs**

### Option B: Netlify
1. Drag and drop your project folder to [netlify.com](https://app.netlify.com/drop)
2. Get your deployment URL
3. Add the URL to Google OAuth settings

### Option C: Local Dev Server (for testing)
```bash
# Using Python
python -m http.server 3000

# Using Node.js (npx)
npx serve .

# Using PHP
php -S localhost:3000
```
Then open `http://localhost:3000`

> **Important**: Add `http://localhost:3000` to your Google OAuth **Authorized JavaScript Origins** and the Supabase callback URL for local testing.

---

## Step 7: Verify Everything Works

1. Open your deployed app
2. You should see the **auth overlay** with "Sign in with Google" button
3. Click "Sign in with Google" → redirects to Google → sign in
4. After sign-in, you see the **user badge** (top-right) with your name + avatar
5. Play a song → check `play_logs` table in Supabase
6. Check `visitors` table → your name, email, IP should be there

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "Sign in" button does nothing | Check browser console for errors. Ensure Supabase URL and key are correct |
| Google sign-in redirects but fails | Check the redirect URI matches exactly in both Google Console and Supabase |
| No data loads | Check Supabase RLS policies — cassettes and tracks should have public read |
| IP address is null | IP APIs may be blocked by ad blockers; this is normal |
| Player works but no auth overlay | Supabase is not configured — check `js/supabase-config.js` |
