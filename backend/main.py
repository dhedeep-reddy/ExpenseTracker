from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import init_db
import os

from routes.auth import router as auth_router, seed_admin
from routes.cycles import router as cycles_router
from routes.transactions import router as transactions_router
from routes.analytics import router as analytics_router
from routes.chat import router as chat_router
from routes.reminders import router as reminders_router
from routes.splitter import router as splitter_router
from routes.admin import router as admin_router

app = FastAPI(title="FinAI Expense Tracker API")

# CORS — always allow localhost.
# Set FRONTEND_URL in the Render dashboard to your Netlify URL (or any extra origins, comma-separated).
_base_origins = [
    "http://localhost:3000",
    "https://finai-expense-tracker.netlify.app",
    "https://friedpotato232-finai-backend.hf.space",
]
_extra_origins_str = os.getenv("FRONTEND_URL", "")
_extra_origins = [o.strip() for o in _extra_origins_str.split(",") if o.strip()]
allowed_origins = _base_origins + _extra_origins

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(cycles_router)
app.include_router(transactions_router)
app.include_router(analytics_router)
app.include_router(chat_router)
app.include_router(reminders_router)
app.include_router(splitter_router)
app.include_router(admin_router)

@app.on_event("startup")
def on_startup():
    init_db()
    # Seed the admin account (creates if not exists)
    from database import SessionLocal
    db = SessionLocal()
    try:
        seed_admin(db)
    finally:
        db.close()

@app.get("/")
def read_root():
    return {"message": "Welcome to the Expense Tracker API"}

@app.get("/api/health")
def health_check():
    """Quick liveness check — visit this URL in a browser to confirm the backend is alive."""
    return {"status": "ok"}

