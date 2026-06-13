# Materna — AI-Powered Maternal Wellness Platform

Materna is a full-stack maternal health companion that combines camera-based vital sign estimation (rPPG), a real-time conversational AI voice agent, and a structured care-team workflow into a single daily check-in experience.

---

## What It Does

Every day, a patient opens Materna and completes a 45-second check-in:

1. **rPPG scan** — the webcam measures heart rate, respiratory rate, and signal quality via remote photoplethysmography (no wearable required)
2. **Voice conversation** — Materna AI (powered by xAI Grok Voice) greets the patient by name, asks how she feels, and listens. The patient speaks naturally; the AI responds in real time
3. **Emergency detection** — if the patient says anything matching distress phrases ("call my husband", "I feel terrible", etc.), Materna immediately places a Twilio voice call to the emergency contact, reading the patient's exact words back to the family member
4. **Structured report** — at the end of the session, a personalized HTML email is sent to all report recipients with vitals, symptom flags, AI conversation summary, hospital-ready clinical note, and a 7-day trend table

---

## Tech Stack

### Backend

- **Python 3.11** + **FastAPI** — REST API + WebSocket server
- **SQLAlchemy** + **Alembic** — ORM and schema migrations
- **PostgreSQL** (local Docker) — primary data store
- **Supabase** — auth, file storage, and optional cloud DB
- **OpenCV + NumPy + SciPy** — rPPG signal processing pipeline
- **xAI Grok Voice API** (`grok-voice-think-fast-1.0`) — real-time bidirectional voice WebSocket
- **OpenAI** (`gpt-4o-mini`, Whisper) — conversation summarization + RAG embeddings
- **Twilio** — SMS reminders + emergency outbound AI voice call
- **APScheduler** — background jobs (SMS/email reminders, weekly rollups)
- **ReportLab** — PDF report generation
- **Google Gemini** — voice agent fallback

### Frontend

- **React 18** + **TypeScript** + **Vite**
- **Tailwind CSS v4** — utility-first styling
- **React Router v7** — client-side routing
- **Web Audio API** — microphone capture, PCM downsampling, audio playback
- **WebSocket** — xAI voice proxy + real-time messaging

---

## Architecture

```
Browser (React)
  │
  ├─ /checkup  ──── WebSocket ──────► FastAPI /api/checkup/xai-voice/ws
  │                                        │
  │                                        └─ WebSocket proxy ──► xAI Grok Voice API
  │                                                                (wss://api.x.ai/v1/realtime)
  │
  ├─ /api/*    ──── HTTP REST ──────► FastAPI (all other endpoints)
  │
  └─ /ws/messaging/{id} ──── WS ──► FastAPI WebSocket (real-time chat)

FastAPI
  ├─ rPPG analysis (OpenCV pipeline)
  ├─ Session storage (PostgreSQL via SQLAlchemy)
  ├─ Supabase sync (auth + file storage)
  ├─ Emergency detection → Twilio voice call
  ├─ Email reports → Gmail SMTP
  └─ RAG chat (OpenAI embeddings + Supabase vector search)
```

---

## Local Setup

### Requirements

- Python 3.11
- Node.js 18+
- Docker (for local PostgreSQL)
- A virtual environment at `main/backend/.venv` (or adjust `start.sh`)

### 1. Clone and configure

```bash
cd backend
cp .env.example .env   # fill in your API keys (see below)
```

### 2. Start the database

```bash
# If using Docker for local Postgres
docker run -d \
  --name materna-db \
  -e POSTGRES_DB=materna \
  -e POSTGRES_PASSWORD=postgres \
  -p 5433:5432 \
  postgres:16
```

### 3. Run migrations

```bash
cd backend
.venv/bin/alembic upgrade head
```

### 4. (Optional) Seed 7 weeks of demo data

```bash
cd backend
.venv/bin/python scripts/seed_demo_data.py
```

This creates demo user **Sarah** (35 weeks pregnant) with 49 sessions of historical check-in data.

### 5. Start everything

```bash
./start.sh
```

This kills any existing process on port 8000, starts the FastAPI backend, waits for it to be healthy, then starts the Vite dev server.

- Frontend: http://localhost:5173
- Backend API docs: http://localhost:8000/docs

### Demo login

| Field    | Value                         |
| -------- | ----------------------------- |
| Email    | `quachphuwork@gmail.com`      |
| Password | (your Supabase user password) |
| Role     | Patient (Sarah, Week 35)      |

---

## Environment Variables

Create `backend/.env` with the following keys:

```env
# Database
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5433/materna

# Supabase (auth + file storage)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
JWT_SECRET=your-supabase-jwt-secret

# AI / Voice
XAI_API_KEY=xai-...           # xAI Grok Voice — primary voice agent
OPENAI_API_KEY=sk-proj-...    # GPT-4o-mini summarization + Whisper + RAG
GEMINI_API_KEY=AIza...        # Google Gemini (fallback)

# Twilio (SMS reminders + emergency calls)
TWILIO_ACCOUNT_SID=ACxxx
TWILIO_AUTH_TOKEN=xxx
TWILIO_PHONE_NUMBER=+1xxxxxxxxxx    # your Twilio number (E.164)
EMERGENCY_CALL_RECIPIENT=+1xxxxxxxxxx  # who gets called in an emergency

# Email reports (Gmail App Password)
SMTP_FROM_EMAIL=your@gmail.com
SMTP_FROM_PASSWORD=xxxx xxxx xxxx xxxx  # 16-char App Password
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587

# CORS
CORS_ORIGINS=http://localhost:5173
```

To add more email report recipients, edit `backend/app/demo_config.py`:

```python
DEMO_REPORT_RECIPIENTS = [
    "family@example.com",
    "doctor@example.com",
]
```

---

## Key Flows

### Voice Check-in (xAI Grok Voice)

1. Patient clicks **Start Check-In** → frontend calls `POST /api/checkup/gemini/live-token` to register the session and cache the system prompt
2. Frontend opens a WebSocket to `/api/checkup/xai-voice/ws?session_id=<id>`
3. Backend proxy opens a second WebSocket to `wss://api.x.ai/v1/realtime` and sends `session.update` (system prompt + `server_vad`)
4. xAI sends a greeting audio stream → backend base64-decodes + forwards as raw PCM binary frames → frontend plays via `AudioContext`
5. Patient speaks → browser captures microphone at 24 kHz, downsamples to 16 kHz, sends as base64 PCM → backend forwards to xAI
6. xAI detects speech end (server VAD), transcribes, generates response, streams audio back
7. Each patient utterance is checked for emergency phrases in real time
8. Session ends when the 45-second rPPG timer expires → `POST /api/checkup/realtime/complete` saves the AI summary and triggers the email report

### Emergency Flow

If the patient says any distress phrase (e.g., "call my husband", "I need help", "I feel terrible"):

1. Backend fires `_fire_emergency()` in a background task
2. Twilio places an outbound call to `EMERGENCY_CALL_RECIPIENT`
3. The TwiML message reads back the patient's **last 3 spoken sentences** verbatim, plus her live heart rate
4. Frontend shows an emergency banner immediately
5. The call uses `Polly.Joanna` (AWS Polly) at a calm, clear pace for maximum intelligibility

### Email Reports

After every completed session, `send_daily_report_email()` runs in a background task. The email includes:

- Patient name, gestational week, session date/time
- rPPG vitals (HR, signal quality, wellness score)
- Simulated watch data (HRV, SpO₂, sleep hours, respiratory rate)
- AI conversation summary
- Symptom flags (color-coded chips: absent / present / urgent)
- Hospital-ready clinical note
- 7-day trend table

---

## Project Structure

```
./
├── backend/
│   ├── app/
│   │   ├── routers/
│   │   │   ├── voice_agent.py        # xAI voice WebSocket proxy + emergency detection
│   │   │   ├── checkup.py            # rPPG upload, session CRUD, history
│   │   │   ├── dashboard.py          # summary metrics, streak, mascot health
│   │   │   ├── messaging.py          # doctor↔patient messaging + WebSocket
│   │   │   ├── reports.py            # weekly rollup + full PDF report
│   │   │   ├── appointments.py       # appointment booking
│   │   │   ├── auth.py               # JWT login/signup
│   │   │   └── admin.py              # user management
│   │   ├── services/
│   │   │   ├── agent_context.py      # Materna AI system prompt builder
│   │   │   ├── emergency_call.py     # Twilio outbound voice call + TwiML builder
│   │   │   ├── email_report.py       # personalized HTML email report
│   │   │   ├── watch_simulation.py   # Apple Watch biometric simulation
│   │   │   ├── weekly_rollup.py      # 7-day patient summary
│   │   │   ├── pdf_report.py         # full PDF for doctor handoff
│   │   │   ├── rag_service.py        # RAG retrieval over health documents
│   │   │   └── session_metrics.py    # HR extraction, trend helpers
│   │   ├── demo_config.py            # demo patient, recipients, session length
│   │   └── main.py                   # FastAPI app, CORS, router mounts
│   ├── rppg/                         # rPPG signal processing (POS, CHROM algorithms)
│   ├── scripts/
│   │   └── seed_demo_data.py         # seeds 7 weeks of historical check-in data
│   └── alembic/                      # database migrations
│
├── frontend/
│   └── src/
│       ├── pages/
│       │   ├── CheckupPage.tsx        # main check-in flow (rPPG + voice)
│       │   ├── DashboardPage.tsx      # patient home dashboard
│       │   ├── MessagingPage.tsx      # care team + AI chat
│       │   ├── AppointmentsPage.tsx   # appointment booking
│       │   └── admin/                 # admin panel pages
│       ├── components/
│       │   ├── checkup/GeminiVoiceWidget.tsx  # xAI voice WebSocket client
│       │   ├── dashboard/MascotPanel.tsx       # Mia anime baby mascot (SVG)
│       │   ├── dashboard/MetricsSummaryCards.tsx
│       │   └── messaging/AIAgentChat.tsx       # RAG chat UI
│       └── lib/api.ts                 # all API calls, env-variable base URL
│
└── start.sh                           # one-command local dev startup
```

---

## Demo Notes

- **Patient name**: Sarah Chen, Week 35 (configurable in `demo_config.py`)
- **Session length**: 45 seconds (rPPG scan, then voice continues until user ends)
- **Multiple check-ins per day**: fully supported — each session is saved independently
- **Emergency number**: `+17143101206` (configurable via `EMERGENCY_CALL_RECIPIENT`)
- **Report emails**: `quachphuwork@gmail.com` + `thienphu.quach01@student.csulb.edu`
- **Mascot**: "Mia" — anime baby with 4 mood states (superSad / sad / happy / superHappy) reflecting mascot health score

---

## Safety Disclaimer

Materna is a **demo wellness platform**. It is not a medical device and does not provide medical diagnoses. rPPG values are estimates based on camera signal analysis and should not replace professional clinical assessment. Emergency detection is keyword-based and does not replace calling 911.
