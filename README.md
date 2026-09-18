# Superior IELTS

**AI-powered IELTS preparation platform** — a lightweight single-page web application built with vanilla HTML, CSS and JavaScript.

## Overview

Superior IELTS is a product prototype for practical IELTS preparation. It brings practice, AI feedback, personal planning, notes and progress tracking into one interface.

## Main features

- **AI Writing review** — IELTS essay review with criterion-based feedback.
- **Speaking review** — transcript-based speaking feedback and voice input tools.
- **Reading & Listening practice** — timed sessions, multiple question types, scoring and error review.
- **AI study plan** — personalised weekly planning based on the learner's goal and context.
- **Personal dashboard** — daily focus, streaks, calendar and progress indicators.
- **Notes / notebook** — Markdown-friendly notes, search, tags, links and export/import.
- **Optional Supabase sync** — account-based cloud synchronisation for notes while local-first storage remains available.
- **PWA support** — manifest and service worker included for installable/offline shell behaviour.

## Technology

- HTML5
- CSS3
- Vanilla JavaScript (no framework, no build step)
- Supabase JS client via jsDelivr when cloud sync is enabled
- Browser storage for local-first data persistence
- Web APIs such as MediaRecorder for voice input

## Run locally

Serve the folder with a local web server for the most complete browser behaviour.

```bash
python -m http.server 8000
```

Open `http://localhost:8000`.

## AI configuration

The application asks the user for a **Gemini API key** in Profile settings and keeps it in the browser's local storage. **Do not commit personal API keys to this repository.**

## Optional Supabase sync

Cloud notes sync is not hardcoded into the repository. Use the in-app synchronisation settings and provide:

- Supabase Project URL
- Supabase publishable / anonymous client key

Use only a client-safe key together with properly configured Row Level Security (RLS). Never place a Supabase `service_role` key in frontend code.

## Security

Secrets are intentionally excluded from the public source. Before every push, check that you have not added:

```text
.env
API keys
access tokens
service_role keys
private credentials
```

## Project structure

```text
Superior-IELTS/
├── index.html
├── manifest.json
├── sw.js
├── icon-192.png
├── icon-512.png
├── README.md
├── .gitignore
└── assets/
```

## Portfolio / hackathon description

Superior IELTS demonstrates a complete product prototype rather than isolated code snippets: product UI, client-side state, AI integrations, IELTS practice flows, scoring logic, local persistence, notes and optional cloud synchronisation are combined in one application.
