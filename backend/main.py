from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import init_db
import os

from routes.auth import router as auth_router
from routes.cycles import router as cycles_router
from routes.transactions import router as transactions_router
from routes.analytics import router as analytics_router
from routes.chat import router as chat_router

app = FastAPI(title="FinAI Expense Tracker API")

# Allow the Vercel frontend URL (set FRONTEND_URL in Railway env vars)
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")
allowed_origins = list({FRONTEND_URL, "http://localhost:3000"})

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

@app.on_event("startup")
def on_startup():
    init_db()

@app.get("/")
def read_root():
    return {"message": "Welcome to the Expense Tracker API"}

# Trigger reload
