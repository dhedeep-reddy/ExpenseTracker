from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime
from pydantic import BaseModel
from typing import List
from collections import defaultdict

from database import get_db, Cycle, Transaction, TransactionType, CategoryBudget
from routes.auth import get_current_user
from state_machine import ExpenseStateMachine

router = APIRouter(prefix="/api/analytics", tags=["analytics"])

class BalanceResponse(BaseModel):
    available_balance: float
    total_income: float
    total_expenses: float
    net_flow: float
    remaining_days: int
    daily_average_spending: float
    burn_rate_status: str

@router.get("/dashboard", response_model=BalanceResponse)
def get_dashboard_metrics(current_user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    sm = ExpenseStateMachine(db, current_user.id)
    active_cycle = sm.get_active_cycle()

    # Simple running balance: all income/salary across ALL cycles minus all expenses
    all_txs = db.query(Transaction).join(Cycle).filter(Cycle.user_id == current_user.id).all()
    total_income = sum(t.amount for t in all_txs if t.type in (TransactionType.INCOME, TransactionType.SALARY))
    total_expenses = sum(t.amount for t in all_txs if t.type == TransactionType.EXPENSE)
    available_balance = total_income - total_expenses
    net_flow = total_income - total_expenses

    # Days in current month for spend rate calculation
    now = datetime.utcnow()
    day_of_month = now.day
    days_in_month = 30
    remaining_days = max(0, days_in_month - day_of_month)

    # This month's expenses for burn rate
    this_month_expenses = sum(
        t.amount for t in all_txs
        if t.type == TransactionType.EXPENSE
        and t.date.year == now.year and t.date.month == now.month
    )
    daily_average = this_month_expenses / max(1, day_of_month)

    burn_rate_status = "STABLE"
    if remaining_days > 0 and daily_average > 0:
        days_covered = available_balance / daily_average
        if days_covered < remaining_days * 0.5:
            burn_rate_status = "CRITICAL"
        elif days_covered < remaining_days:
            burn_rate_status = "WARNING"

    return BalanceResponse(
        available_balance=available_balance,
        total_income=total_income,
        total_expenses=total_expenses,
        net_flow=net_flow,
        remaining_days=remaining_days,
        daily_average_spending=daily_average,
        burn_rate_status=burn_rate_status
    )

class EnvelopeItem(BaseModel):
    category_name: str
    allocated_amount: float
    spent_amount: float
    remaining_amount: float

@router.get("/envelopes", response_model=List[EnvelopeItem])
def get_envelopes(current_user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    sm = ExpenseStateMachine(db, current_user.id)
    active_cycle = sm.get_active_cycle()
    budgets = db.query(CategoryBudget).filter(CategoryBudget.cycle_id == active_cycle.id).all()
    return [
        EnvelopeItem(
            category_name=b.category_name,
            allocated_amount=b.allocated_amount,
            spent_amount=b.spent_amount,
            remaining_amount=max(0.0, b.allocated_amount - b.spent_amount)
        )
        for b in budgets
    ]

class MonthlyHistoryItem(BaseModel):
    month: str          # "2025-01"
    label: str          # "Jan 2025"
    total_income: float
    total_expenses: float
    net: float
    transaction_count: int

@router.get("/monthly-history", response_model=List[MonthlyHistoryItem])
def get_monthly_history(current_user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    # Get all cycles for user
    user_cycle_ids = [c.id for c in db.query(Cycle).filter(Cycle.user_id == current_user.id).all()]
    if not user_cycle_ids:
        return []
    
    # Get all transactions across all cycles
    all_txs = db.query(Transaction).filter(Transaction.cycle_id.in_(user_cycle_ids)).all()
    
    monthly: dict = defaultdict(lambda: {"total_income": 0.0, "total_expenses": 0.0, "count": 0})
    
    for tx in all_txs:
        month_key = tx.date.strftime("%Y-%m")
        monthly[month_key]["count"] += 1
        if tx.type.value in ("INCOME", "SALARY"):
            monthly[month_key]["total_income"] += tx.amount
        elif tx.type.value == "EXPENSE":
            monthly[month_key]["total_expenses"] += tx.amount
    
    result = []
    for month_key in sorted(monthly.keys(), reverse=True):
        data = monthly[month_key]
        dt = datetime.strptime(month_key, "%Y-%m")
        result.append(MonthlyHistoryItem(
            month=month_key,
            label=dt.strftime("%b %Y"),
            total_income=round(data["total_income"], 2),
            total_expenses=round(data["total_expenses"], 2),
            net=round(data["total_income"] - data["total_expenses"], 2),
            transaction_count=data["count"],
        ))
    return result
