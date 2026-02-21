from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from database import get_db, Cycle, Transaction, CategoryBudget
from routes.auth import get_current_user
from state_machine import ExpenseStateMachine
from nlp_engine import parse_user_input

router = APIRouter(prefix="/api/chat", tags=["chat"])

class ChatRequest(BaseModel):
    message: str
    chat_history: str = "No previous chat."

class ChatResponse(BaseModel):
    response: str

@router.post("/", response_model=ChatResponse)
def process_chat(req: ChatRequest, current_user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    sm = ExpenseStateMachine(db, current_user.id)
    active_cycle = sm.get_active_cycle()
    
    # Recreate the context building from app.py
    # 1. Current transactions
    transactions = db.query(Transaction).filter(Transaction.cycle_id == active_cycle.id).order_by(Transaction.date.asc()).all()
    history_context_lines = []
    for tx in transactions:
        cat = tx.category.capitalize() if tx.category else "Other"
        history_context_lines.append(f"Date: {tx.date.strftime('%Y-%m-%d %H:%M')}, Type: {tx.type.value}, Category: {cat}, Amount: {tx.amount}, Source: {tx.source.value}, Description: {tx.description}")
    history_context = "\n".join(history_context_lines) if history_context_lines else "No transactions yet."
    
    # 2. Past Cycles Context
    all_user_cycles = db.query(Cycle).filter(Cycle.user_id == current_user.id).order_by(Cycle.id.asc()).all()
    past_cycles_data = []
    for c in all_user_cycles:
        if c.id != active_cycle.id:
            txs = db.query(Transaction).filter(Transaction.cycle_id == c.id, Transaction.type == "EXPENSE").all()
            cat_spending = {}
            for tx in txs:
                cat = tx.category.capitalize() if tx.category else "Other"
                cat_spending[cat] = cat_spending.get(cat, 0.0) + tx.amount
            
            cat_str = ", ".join([f"{k}: ₹{v}" for k, v in cat_spending.items()]) if cat_spending else "None"
            past_cycles_data.append(f"Cycle {c.id}: Started {c.start_date.strftime('%Y-%m-%d')}, Salary ₹{c.salary_amount}, Total Spent ₹{c.total_expenses}, Categories ({cat_str}), Status: {c.status.value}")
    
    past_cycles_context = "\n".join(past_cycles_data) if past_cycles_data else "No past cycles available."
    
    # 3. Budget Envelopes
    budgets = db.query(CategoryBudget).filter(CategoryBudget.cycle_id == active_cycle.id).all()
    budget_context = "\n".join([f"Envelope '{b.category_name}': Allocated ₹{b.allocated_amount}, Spent ₹{b.spent_amount}, Remaining ₹{max(0, b.allocated_amount - b.spent_amount)}" for b in budgets]) if budgets else "No envelopes allocated."
    
    full_context = f"PAST CYCLES SUMMARY:\n{past_cycles_context}\n\nCURRENT CYCLE TRANSACTIONS:\n{history_context}\n\nCURRENT ENVELOPES:\n{budget_context}"
    
    # Parse via NLP Engine
    try:
        nlp_response = parse_user_input(req.message, full_context, req.chat_history)
        response_text = sm.process_nlp_response(nlp_response, active_cycle)
        return ChatResponse(response=response_text)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
