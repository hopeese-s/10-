# E-Calendar Auto Drive Router & AI Summary (v2)

Standalone FastAPI microservice that connects your **iPad (Notability, GoodNotes, Voice Memos)** with **LINE Official Account**, **E-Calendar schedule**, and **Google Drive / NotebookLM**.

---

## 🌟 Key Features

1. **Automatic Lecture Matching**: Matches incoming files to active classes based on your E-Calendar schedule (Timezone `Asia/Bangkok`), with a 30-minute grace period buffer.
2. **Flat Google Drive Hierarchy**: Files are saved directly into the course folder (`E-Calendar_Study_Space/{Subject}/`) without nested date subdirectories, allowing instant bulk-selection in **Google NotebookLM**.
3. **Multi-File Session Debounce**: Files sent within 150 seconds of each other in the same lecture (e.g. slides + audio recordings) are grouped into a single consolidated Gemini AI summary.
4. **Instant File Safety**: Original files are uploaded to Google Drive immediately upon receipt (guaranteeing zero data loss even if AI summarization fails).
5. **2-Stage LINE Response**: Responds with an immediate acknowledgment (<30s) to keep LINE reply tokens fresh, followed by a detailed push notification when AI summarization finishes.
6. **Robust Fallbacks**: Uses `google-genai` SDK with graceful fallbacks if Gemini is unreachable or credentials are missing.

---

## 🚀 Deployment Checklist

### 1. Google Cloud & Drive Setup
1. Create a Google Cloud Project and enable **Google Drive API**.
2. Create a **Service Account** and download its JSON key.
3. In Google Drive, create a folder named `E-Calendar_Study_Space`.
4. Share this folder with your Service Account email as **Editor**.
5. Copy the folder ID from the Drive URL into `GOOGLE_DRIVE_PARENT_ID`.

### 2. LINE Developers Console
1. In your LINE OA Messaging API channel, copy:
   - **Channel Access Token** (`LINE_CHANNEL_ACCESS_TOKEN`)
   - **Channel Secret** (`LINE_CHANNEL_SECRET`)
2. Set Webhook URL to: `https://<your-railway-app>.up.railway.app/webhook`
3. Enable **Use Webhook**.

### 3. Google AI Studio (Gemini)
1. Create an API key at [Google AI Studio](https://aistudio.google.com/).
2. Set `GEMINI_API_KEY` and optional `GEMINI_MODEL` (default: `gemini-2.5-flash`).

### 4. Railway Deployment
1. Deploy this folder as a new service on Railway.
2. Configure the environment variables listed in `.env.example`.
3. Check `GET /health` returns HTTP 200 `{"status": "ok"}`.
