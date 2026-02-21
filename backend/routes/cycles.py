from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel

from database import get_db, Cycle, CycleStatus, Transaction, TransactionType, TransactionSource
from routes.auth import get_current_user

router = APIRouter(prefix="/api/cycles", tags=["cycles"])

class CycleResponse(BaseModel):
    id: int
    start_date: datetime
    end_date: Optional[datetime]
    salary_amount: float
    opening_balance: float
    total_expenses: float
    total_income_other_than_salary: float
    savings_balance: float
    investment_balance: float
    credit_card_due: float
    borrowed_amount: float
    status: str

    class Config:
        from_attributes = True

class NewCycleRequest(BaseModel):
    salary_amount: float
    
@router.get("/active", response_model=CycleResponse)
def get_active_cycle(current_user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    cycle = db.query(Cycle).filter(Cycle.user_id == current_user.id, Cycle.status != CycleStatus.CLOSED).order_by(Cycle.id.desc()).first()
    if not cycle:
        cycle = Cycle(user_id=current_user.id, status=CycleStatus.ACTIVE)
        db.add(cycle)
        db.commit()
        db.refresh(cycle)
    return cycle

@router.get("/history", response_model=List[CycleResponse])
def get_cycle_history(current_user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.query(Cycle).filter(Cycle.user_id == current_user.id).order_by(Cycle.id.desc()).all()

@router.post("/start", response_model=CycleResponse)
def start_new_cycle(req: NewCycleRequest, current_user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    # 1. Get current active cycle
    current_cycle = db.query(Cycle).filter(Cycle.user_id == current_user.id, Cycle.status != CycleStatus.CLOSED).order_by(Cycle.id.desc()).first()
    
    if current_cycle and current_cycle.salary_amount > 0:
        # Close old cycle
        current_cycle.status = CycleStatus.CLOSED
        current_cycle.end_date = datetime.utcnow()
        db.commit()

    # 2. Create new cycle
    new_cycle = Cycle(
        user_id=current_user.id,
        salary_amount=req.salary_amount,
        salary_credit_date=datetime.utcnow(),
        opening_balance=req.salary_amount,
        status=CycleStatus.ACTIVE
    )
    db.add(new_cycle)
    
    # 3. Add salary transaction to new cycle
    db.commit()
    db.refresh(new_cycle)
    
    salary_tx = Transaction(
        cycle_id=new_cycle.id,
        type=TransactionType.SALARY,
        amount=req.salary_amount,
        source=TransactionSource.MAIN_BALANCE,
        description="Salary Initial Credit"
    )
    db.add(salary_tx)
    db.commit()
    db.refresh(new_cycle)
    
    return new_cycle
