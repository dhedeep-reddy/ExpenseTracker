from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

from database import get_db, User, Cycle, Transaction, CategoryBudget, Reminder, TransactionType
from routes.auth import get_current_user

router = APIRouter(prefix="/api/admin", tags=["admin"])

class UserSummary(BaseModel):
    id: int
    username: str
    created_at: str
    total_income: float
    total_expenses: float
    available_balance: float
    transaction_count: int
    envelope_count: int
    reminder_count: int

class TransactionRow(BaseModel):
    id: int
    type: str
    category: Optional[str]
    amount: float
    source: str
    description: Optional[str]
    date: str

class UserDetail(BaseModel):
    id: int
    username: str
    created_at: str
    total_income: float
    total_expenses: float
    available_balance: float
    transactions: List[TransactionRow]
    envelopes: List[dict]
    reminders: List[dict]

def _user_summary(user: User, db: Session) -> UserSummary:
    all_txs = db.query(Transaction).join(Cycle).filter(Cycle.user_id == user.id).all()
    total_income = sum(t.amount for t in all_txs if t.type in (TransactionType.INCOME, TransactionType.SALARY))
    total_expenses = sum(t.amount for t in all_txs if t.type == TransactionType.EXPENSE)
    # Envelope locked money
    cycle = db.query(Cycle).filter(Cycle.user_id == user.id).order_by(Cycle.id.desc()).first()
    locked = 0.0
    env_count = 0
    if cycle:
        budgets = db.query(CategoryBudget).filter(CategoryBudget.cycle_id == cycle.id).all()
        locked = sum(max(0.0, b.allocated_amount - b.spent_amount) for b in budgets)
        env_count = len(budgets)
    rem_count = db.query(Reminder).filter(Reminder.user_id == user.id).count()
    return UserSummary(
        id=user.id,
        username=user.username,
        created_at=user.created_at.strftime("%Y-%m-%d %H:%M") if user.created_at else "—",
        total_income=round(total_income, 2),
        total_expenses=round(total_expenses, 2),
        available_balance=round(total_income - total_expenses - locked, 2),
        transaction_count=len(all_txs),
        envelope_count=env_count,
        reminder_count=rem_count,
    )

@router.get("/users", response_model=List[UserSummary])
def list_users(current_user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    if not getattr(current_user, "is_admin", False):
        raise HTTPException(status_code=403, detail="Admin access only")
    users = db.query(User).filter(User.is_admin == False).order_by(User.id).all()
    return [_user_summary(u, db) for u in users]

@router.get("/users/{user_id}", response_model=UserDetail)
def get_user_detail(user_id: int, current_user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    if not getattr(current_user, "is_admin", False):
        raise HTTPException(status_code=403, detail="Admin access only")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    all_txs = db.query(Transaction).join(Cycle).filter(Cycle.user_id == user_id).order_by(Transaction.date.desc()).all()
    total_income = sum(t.amount for t in all_txs if t.type in (TransactionType.INCOME, TransactionType.SALARY))
    total_expenses = sum(t.amount for t in all_txs if t.type == TransactionType.EXPENSE)

    cycle = db.query(Cycle).filter(Cycle.user_id == user_id).order_by(Cycle.id.desc()).first()
    envelopes = []
    locked = 0.0
    if cycle:
        budgets = db.query(CategoryBudget).filter(CategoryBudget.cycle_id == cycle.id).all()
        locked = sum(max(0.0, b.allocated_amount - b.spent_amount) for b in budgets)
        envelopes = [{"id": b.id, "category": b.category_name, "allocated": b.allocated_amount, "spent": b.spent_amount, "remaining": max(0, b.allocated_amount - b.spent_amount)} for b in budgets]

    reminders = db.query(Reminder).filter(Reminder.user_id == user_id).order_by(Reminder.due_date.asc()).all()
    rem_list = [{"id": r.id, "title": r.title, "amount": r.amount, "type": r.type.value, "due_date": r.due_date.strftime("%Y-%m-%d") if r.due_date else None, "is_paid": r.is_paid} for r in reminders]

    return UserDetail(
        id=user.id,
        username=user.username,
        created_at=user.created_at.strftime("%Y-%m-%d %H:%M") if user.created_at else "—",
        total_income=round(total_income, 2),
        total_expenses=round(total_expenses, 2),
        available_balance=round(total_income - total_expenses - locked, 2),
        transactions=[TransactionRow(
            id=t.id, type=t.type.value, category=t.category,
            amount=t.amount, source=t.source.value,
            description=t.description,
            date=t.date.strftime("%Y-%m-%d %H:%M")
        ) for t in all_txs],
        envelopes=envelopes,
        reminders=rem_list,
    )
