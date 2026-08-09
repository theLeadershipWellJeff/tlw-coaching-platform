# theLeadershipWell · Session Prep Engine
## Setup Guide

---

## STEP 1 — Google Cloud Project

1. Go to https://console.cloud.google.com
2. Click "New Project" → name it `tlw-session-prep` → Create
3. Enable APIs:
   - Go to "APIs & Services" → "Library"
   - Search and enable: **Gmail API**
   - Search and enable: **Google Calendar API**
4. Create OAuth credentials:
   - Go to "APIs & Services" → "Credentials"
   - Click "Create Credentials" → "OAuth client ID"
   - Application type: **Web application**
   - Name: `TLW Session Prep`
   - Authorized redirect URIs — add ALL of these:
     ```
     http://localhost:3000/api/auth/callback/google
     https://theleadershipwell.online/api/auth/callback/google
     ```
   - Click Create → Copy your **Client ID** and **Client Secret**
5. Configure OAuth consent screen:
   - Go to "OAuth consent screen"
   - User type: **External**
   - App name: `theLeadershipWell Session Prep`
   - Add your email as a test user
   - Scopes: add gmail.send, gmail.compose, calendar.readonly

---

## STEP 2 — Generate NEXTAUTH_SECRET

Run this in your terminal:
```bash
openssl rand -base64 32
```
Copy the output — that's your NEXTAUTH_SECRET.

---

## STEP 3 — Vercel Setup

1. Go to https://vercel.com → your account
2. Click "Add New Project" → "Import Git Repository"
   - OR: drag this folder directly to Vercel
3. Framework: **Next.js** (auto-detected)
4. Add Environment Variables (Settings → Environment Variables):

| Key | Value |
|-----|-------|
| GOOGLE_CLIENT_ID | from Step 1 |
| GOOGLE_CLIENT_SECRET | from Step 1 |
| NEXTAUTH_URL | https://theleadershipwell.online |
| NEXTAUTH_SECRET | from Step 2 |
| ANTHROPIC_API_KEY | your Anthropic key |
| JEFF_FROM_EMAIL | jeff@jeffkholmes.com |
| JEFF_CC_EMAIL | jeff@theleadershipwell.com |

5. Deploy

---

## STEP 4 — Connect Domain

1. In Vercel → your project → Settings → Domains
2. Add: `theleadershipwell.online`
3. Vercel will give you DNS records to add at your domain registrar
4. Add those records → domain connects in ~5 minutes

---

## STEP 5 — Test

1. Open https://theleadershipwell.online
2. Sign in with Google (jeff@jeffkholmes.com)
3. You'll see upcoming sessions from your calendar
4. Click any session → it pulls CA notes → generates prep → shows live editable preview
5. Edit any field by clicking it
6. Hit Send → email goes directly to client (no drafts!)

---

## HOW IT WORKS

```
Google Calendar → upcoming sessions on dashboard
       ↓ click a session
Coach Accountable API → pulls last 6 months of notes
       ↓
Claude API → generates personalized content
       ↓
Live editable preview → click any field to edit inline
       ↓
Gmail API → sends real email (not a draft)
CC: jeff@theleadershipwell.com on everything
```

---

## LOCAL DEVELOPMENT

```bash
# Install dependencies
npm install

# Copy env file and fill in values
cp .env.example .env.local

# Run dev server
npm run dev

# Open http://localhost:3000
```
