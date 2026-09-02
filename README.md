# PipelineIQ

> AI-Powered GitHub Error & Incident Monitoring Platform

PipelineIQ connects your GitHub repositories, application errors, and Slack into one intelligent monitoring platform — with AI-powered root-cause analysis.

## Monorepo Structure

```
pipelineiq/
├── frontend/     # React + Vite SaaS dashboard
├── backend/      # FastAPI Python backend (Phase 2)
├── sdk/          # JavaScript error capture SDK (Phase 3)
└── docs/         # Architecture & API documentation
```

## Getting Started (Phase 1 — Frontend)

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React, Vite, Tailwind CSS, shadcn/ui |
| Backend | Python, FastAPI, Supabase (Phase 2) |
| Database | Supabase PostgreSQL |
| AI | Google Gemini API |
| Auth | Supabase Auth |
| Integrations | GitHub App, Slack OAuth |
