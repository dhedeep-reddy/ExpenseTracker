from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel

from database import get_db, Transaction, TransactionType, TransactionSource, Cycle, CycleStatus
from routes.auth import get_current_user
from state_machine import ExpenseStateMachine

router = APIRouter(prefix="/api/transactions", tags=["transactions"])

class TransactionCreate(BaseModel):
    type: TransactionType
    category: Optional[str] = None
    amount: float
    date: Optional[datetime] = None
    source: TransactionSource = TransactionSource.MAIN_BALANCE
    description: Optional[str] = None
    cycle_id: Optional[int] = None

class TransactionResponse(BaseModel):
    id: int
    cycle_id: int
    type: TransactionType
    category: Optional[str]
    amount: float
    date: datetime
    source: TransactionSource
    description: Optional[str]

    class Config:
        from_attributes = True

@router.get("/", response_model=List[TransactionResponse])
def get_transactions(
    cycle_id: Optional[int] = None,
    current_user: dict = Depends(get_current_user), 
    db: Session = Depends(get_db)
):
    query = db.query(Transaction).join(Cycle).filter(Cycle.user_id == current_user.id)
    if cycle_id:
        query = query.filter(Transaction.cycle_id == cycle_id)
    
    return query.order_by(Transaction.date.desc()).all()

@router.post("/", response_model=TransactionResponse)
def create_transaction(tx: TransactionCreate, current_user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    sm = ExpenseStateMachine(db, current_user.id)
    
    target_cycle_id = tx.cycle_id
    if not target_cycle_id:
        active_cycle = sm.get_active_cycle()
        target_cycle_id = active_cycle.id
        
    cycle = db.query(Cycle).filter(Cycle.id == target_cycle_id, Cycle.user_id == current_user.id).first()
    if not cycle:
        raise HTTPException(status_code=404, detail="Cycle not found")
        
    new_tx = Transaction(
        cycle_id=cycle.id,
        type=tx.type,
        category=tx.category,
        amount=tx.amount,
        date=tx.date or datetime.utcnow(),
        source=tx.source,
        description=tx.description
    )
    db.add(new_tx)
    db.commit()
    db.refresh(new_tx)
    
    sm.recalculate_cycle_aggregates(cycle)
    
    return new_tx

@router.put("/{tx_id}", response_model=TransactionResponse)
def update_transaction(tx_id: int, tx: TransactionCreate, current_user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    db_tx = db.query(Transaction).join(Cycle).filter(Transaction.id == tx_id, Cycle.user_id == current_user.id).first()
    if not db_tx:
        raise HTTPException(status_code=404, detail="Transaction not found")
        
    db_tx.type = tx.type
    db_tx.category = tx.category
    db_tx.amount = tx.amount
    if tx.date:
        db_tx.date = tx.date
    db_tx.source = tx.source
    db_tx.description = tx.description
    
    db.commit()
    db.refresh(db_tx)
    
    sm = ExpenseStateMachine(db, current_user.id)
    cycle = db.query(Cycle).filter(Cycle.id == db_tx.cycle_id).first()
    sm.recalculate_cycle_aggregates(cycle)
    
    return db_tx

@router.delete("/{tx_id}")
def delete_transaction(tx_id: int, current_user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    db_tx = db.query(Transaction).join(Cycle).filter(Transaction.id == tx_id, Cycle.user_id == current_user.id).first()
    if not db_tx:
        raise HTTPException(status_code=404, detail="Transaction not found")
        
    cycle_id = db_tx.cycle_id
    db.delete(db_tx)
    db.commit()
    
    sm = ExpenseStateMachine(db, current_user.id)
    cycle = db.query(Cycle).filter(Cycle.id == cycle_id).first()
    sm.recalculate_cycle_aggregates(cycle)
    
    return {"message": "Transaction deleted successfully"}
