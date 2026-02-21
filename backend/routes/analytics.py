from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime
from pydantic import BaseModel

from database import get_db, Cycle, Transaction, TransactionType
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
    
    available_balance = sm.calculate_current_balance(active_cycle)
    total_income = active_cycle.salary_amount + active_cycle.total_income_other_than_salary
    total_expenses = active_cycle.total_expenses
    net_flow = total_income - total_expenses
    
    # Estimate remaining days (assuming 30-day month cycle)
    if active_cycle.salary_credit_date:
        days_passed = (datetime.utcnow() - active_cycle.salary_credit_date).days
        remaining_days = max(0, 30 - days_passed)
        daily_average = total_expenses / max(1, days_passed)
    else:
        remaining_days = 30
        daily_average = 0.0
        
    # Burn Rate Status
    burn_rate_status = "STABLE"
    if remaining_days > 0 and daily_average > 0:
        days_covered_by_balance = available_balance / daily_average
        if days_covered_by_balance < remaining_days * 0.5:
            burn_rate_status = "CRITICAL"
        elif days_covered_by_balance < remaining_days:
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
