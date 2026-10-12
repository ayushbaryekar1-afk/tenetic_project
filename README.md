# Tenetic AI: Databricks Super Agent Chat

A full-stack chat app that connects a web UI to your **Databricks Super Agent** (the supervisor that routes questions to your Genie agents). It works out of the box in **demo mode**, with no Databricks account needed.

## 1. Overview

- **Frontend:** Next.js 14, React, TypeScript, Tailwind CSS, Lucide icons
- **Backend:** FastAPI, Pydantic, httpx, python-dotenv
- **Security:** the browser only talks to the FastAPI backend. Databricks credentials live in the backend `.env` and never reach the frontend.
- **Chat history:** saved in the browser (localStorage). No database needed.

## 2. Architecture

```
USER
  ↓
FRONTEND  (Next.js / React)          http://localhost:3000
  ↓  HTTPS/JSON
FASTAPI BACKEND                      http://localhost:8000
  ↓  Bearer token (server-side only)
DATABRICKS SUPER AGENT  (Model Serving endpoint)
  ↓
Genie 1 · Genie 2 · Genie 3 · Genie 4 · Genie 5 · Genie 6
  ↓
DATA / TABLES / KNOWLEDGE SOURCES
```

## 3. Requirements

- Node.js 18.17+ (20 LTS recommended) and npm
- Python 3.9+ (3.11+ recommended)
- VS Code (optional but recommended)

## 4. Folder structure

```
tenetic-super-agent/
├── frontend/
│   ├── app/            layout.tsx, page.tsx, globals.css, icon.svg
│   ├── components/     Chat, ChatMessage, ChatInput, Sidebar, Header,
│   │                   AgentStatus, LoadingIndicator, SettingsModal, Logo
│   ├── lib/            api.ts (backend client), storage.ts, format.ts, types.ts
│   └── package.json, tsconfig.json, tailwind.config.ts, ...
├── backend/
│   ├── main.py         app setup, CORS, error handlers
│   ├── config.py       environment variables
│   ├── errors.py
│   ├── models/chat.py  Pydantic request/response models
│   ├── routes/         chat.py, health.py
│   ├── services/       databricks_service.py (all Databricks code), demo_service.py
│   └── requirements.txt
├── .env.example
├── .gitignore
├── README.md
└── start.md
```

## 5. Environment configuration

Copy the example files. **Never commit `.env`.**

| Copy | To | Used by |
|---|---|---|
| `.env.example` | `.env` (project root) | backend (Databricks + demo mode) |
| `frontend/.env.example` | `frontend/.env.local` | frontend (`NEXT_PUBLIC_API_URL`) |

Mac/Linux: `cp .env.example .env && cp frontend/.env.example frontend/.env.local`
Windows (PowerShell): `copy .env.example .env; copy frontend\.env.example frontend\.env.local`

The frontend defaults to `http://localhost:8000`, so `frontend/.env.local` is only needed if your backend runs elsewhere. You can also put the backend variables in `backend/.env` instead of the root `.env`; `backend/.env` takes priority.

| Variable | Purpose |
|---|---|
| `DEMO_MODE` | `true` = mock answers, no Databricks calls. `false` = call your Super Agent. |
| `DATABRICKS_HOST` | Workspace URL, e.g. `https://adb-123456789.1.azuredatabricks.net` |
| `DATABRICKS_TOKEN` | Personal access token or service-principal token |
| `DATABRICKS_AGENT_ENDPOINT` | Serving endpoint **name** (e.g. `super-agent`) or a full invocations URL |
| `NEXT_PUBLIC_API_URL` | Backend URL used by the browser |
| `GENIE_AGENT_COUNT` | Optional. Number shown in the UI (default 6) |
| `REQUEST_TIMEOUT_SECONDS` | Optional. Backend timeout for Databricks calls (default 90) |
| `CORS_ORIGINS` | Optional. Comma-separated allowed browser origins |

## 6. Backend installation and run

```bash
cd backend
python -m venv .venv

# Windows
.venv\Scripts\activate
# Mac/Linux
source .venv/bin/activate

pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Check it: open http://localhost:8000/health (should return `{"status":"ok"}`). Interactive API docs are at http://localhost:8000/docs.

## 7. Frontend installation and run

In a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:3000.

## 8. Demo mode

With `DEMO_MODE=true` (the default) the backend never calls Databricks and returns mock answers. Try:

- "What is the total sales?" → `Based on the connected data, the total sales are ₹24.6 Cr.`
- "Which region is underperforming?" → a sample table
- "Who are our top customers?", "Show the monthly revenue trend", "Inventory status"

Demo answers are labelled "(demo)" in the response metadata.

## 9. Connecting Databricks

1. In Databricks, open **Serving** and note the name of your Super Agent endpoint.
2. Create a token (**Settings → Developer → Access tokens**) for a user or service principal with **Can Query** permission on that endpoint.
3. Edit `.env`:
   ```
   DATABRICKS_HOST=https://<your-workspace>.cloud.databricks.com
   DATABRICKS_TOKEN=<your token>
   DATABRICKS_AGENT_ENDPOINT=<endpoint name>
   DEMO_MODE=false
   ```
4. Restart the backend (`Ctrl+C`, then `uvicorn main:app --reload --port 8000`).
5. Open **Settings** in the UI. It should say *Live* and *Databricks configured: Yes*.

### If your endpoint uses a different request/response format

Everything Databricks-specific is in `backend/services/databricks_service.py`:

- `_build_url()` builds the URL (`/serving-endpoints/<name>/invocations`).
- `_build_payload()` is the **request mapping**. The default is `{"messages": [...]}`. Alternatives are shown in comments.
- `_parse_response()` is the **response mapping**. It already handles OpenAI-style `choices`, `output`, `messages`, `predictions`, and plain `response`/`answer`/`text` keys. If yours is different, add a branch there.

To show which Genie answered, return the name in `custom_outputs.agent` (or `name` on the assistant message). If nothing is returned, only the response is shown.

## 10. How a request flows

1. You type a question and press Enter.
2. `lib/api.ts` sends `POST /api/chat` with `{ message, conversation_id }` to FastAPI.
3. `routes/chat.py` validates the input (1–4000 chars).
4. Demo mode: `demo_service.py` returns a mock answer. Live mode: `databricks_service.py` sends the message plus recent turns to your endpoint with the server-side token.
5. The reply is mapped to `{ response, conversation_id, agent, execution_time, timestamp }` and shown in the chat.
6. Errors are converted into short, safe messages. Tokens, hosts and stack traces are never returned.

`POST /api/chat/stream` (Server-Sent Events) is also available. The UI uses `/api/chat`; the stream route sends the finished reply in chunks and is a starting point if you want token streaming later.

## 11. Troubleshooting

| Symptom | Fix |
|---|---|
| "Can't reach the backend" | Start the backend and check `NEXT_PUBLIC_API_URL`. Restart `npm run dev` after changing env files. |
| Browser CORS error | Add your frontend origin to `CORS_ORIGINS` in `.env`. |
| "Databricks is not configured" | Fill all three Databricks variables, or set `DEMO_MODE=true`. |
| "Databricks rejected the server's credentials" | The token is wrong, expired, or lacks **Can Query** on the endpoint. Also check `DATABRICKS_HOST`. |
| "endpoint was not found" | Check `DATABRICKS_AGENT_ENDPOINT` spelling. |
| "unavailable" or timeouts on the first call | Serving endpoints can scale to zero and take a few minutes to wake. Retry, or raise `REQUEST_TIMEOUT_SECONDS`. |
| "replied in a format this app doesn't recognise" | Adjust `_parse_response()` (see section 9). The backend log shows the top-level keys it received. |
| Port already in use | Use another port, e.g. `uvicorn main:app --reload --port 8001`, and update `NEXT_PUBLIC_API_URL`. |
| `ModuleNotFoundError` | Activate the virtual environment, then `pip install -r requirements.txt`. |

## 12. Deployment notes

- Set environment variables in your host's secret manager. Do not ship `.env` files.
- Backend: `uvicorn main:app --host 0.0.0.0 --port 8000` behind HTTPS (nginx, a cloud load balancer, etc.). Set `CORS_ORIGINS` to your real frontend URL.
- Frontend: `npm run build && npm start`, or deploy to Vercel/Netlify with `NEXT_PUBLIC_API_URL` set to the public backend URL. This value is baked in at build time.
- **Free Render + Vercel setup:** The root `render.yaml` can create the free FastAPI service from the `backend/` directory. In Render, create a Blueprint from this repository and deploy it; verify `https://<render-service>.onrender.com/health`. In Vercel, import the same repository, set the Root Directory to `frontend`, add `NEXT_PUBLIC_API_URL=https://<render-service>.onrender.com`, and deploy. Then set the Render `CORS_ORIGINS` environment variable to the exact Vercel production origin (for example, `https://<project>.vercel.app`) and redeploy the backend. For live Databricks mode, set `DEMO_MODE=false` and add `DATABRICKS_HOST`, `DATABRICKS_TOKEN`, and `DATABRICKS_AGENT_ENDPOINT` as Render environment variables; never put the token in Vercel or GitHub. The Blueprint defaults to demo mode so it can deploy without secrets.
- Render's free web services can sleep when idle, so the first request after inactivity may take about a minute. Free instances are intended for testing and hobby projects, not production.
- **Add authentication before exposing this publicly.** The backend has no user login, so anyone who can reach it can query your Super Agent with the server's token. Put it behind SSO or add API auth.
- Conversation memory is in-process. With multiple backend instances or restarts, move it to Redis or a database.
- Use a service-principal token with the minimum permissions needed, and rotate it regularly.
