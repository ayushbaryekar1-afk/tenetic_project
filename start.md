# Quick start

## 1. Open the project in VS Code
Extract the ZIP, then **File → Open Folder → `tenetic-super-agent`**. Open two terminals (**Terminal → New Terminal**).

## 2. Start the backend (terminal 1)
```bash
cd backend
python -m venv .venv
.venv\Scripts\activate          # Windows
# source .venv/bin/activate     # Mac/Linux
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```
Open http://localhost:8000/health. You should see `{"status":"ok"}`.

## 3. Start the frontend (terminal 2)
```bash
cd frontend
npm install
npm run dev
```

## 4. Open the browser
Go to http://localhost:3000.

## 5. Test demo mode
Demo mode is on by default, so no setup is needed. Ask: **"What is the total sales?"**
Expected: `Based on the connected data, the total sales are ₹24.6 Cr.`
The sidebar should show **Demo mode**.

## 6. Configure Databricks
Copy `.env.example` to `.env` in the project root and fill in:
```
DATABRICKS_HOST=https://<your-workspace>.cloud.databricks.com
DATABRICKS_TOKEN=<your token>
DATABRICKS_AGENT_ENDPOINT=<your serving endpoint name>
```

## 7. Switch to live mode
In `.env` set:
```
DEMO_MODE=false
```
Restart the backend (`Ctrl+C`, then `uvicorn main:app --reload --port 8000`).

## 8. Test the Super Agent
Refresh http://localhost:3000, open **Settings**, and confirm *Mode: Live* and *Databricks configured: Yes*. Ask a real question about your data.

If the response format differs from what the app expects, see "Connecting Databricks" in `README.md` and edit `backend/services/databricks_service.py`.
