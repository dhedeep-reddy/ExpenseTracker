from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List, Dict, Any
from datetime import datetime

from database import get_db, Cycle, Transaction, CategoryBudget, Reminder, ReminderType
from routes.auth import get_current_user
from state_machine import ExpenseStateMachine
from nlp_engine import parse_user_input

router = APIRouter(prefix="/api/chat", tags=["chat"])

class ChatRequest(BaseModel):
    message: str
    chat_history: List[Dict[str, Any]] = []

class ChatResponse(BaseModel):
    response: str

@router.post("/", response_model=ChatResponse)
def process_chat(req: ChatRequest, current_user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    sm = ExpenseStateMachine(db, current_user.id)
    active_cycle = sm.get_active_cycle()

    # 1. Current transactions
    transactions = db.query(Transaction).filter(Transaction.cycle_id == active_cycle.id).order_by(Transaction.date.asc()).all()
    history_context_lines = []
    for tx in transactions:
        cat = tx.category.capitalize() if tx.category else "Other"
        history_context_lines.append(f"Date: {tx.date.strftime('%Y-%m-%d %H:%M')}, Type: {tx.type.value}, Category: {cat}, Amount: ₹{tx.amount}, Source: {tx.source.value}, Description: {tx.description}")
    history_context = "\n".join(history_context_lines) if history_context_lines else "No transactions yet."

    # 2. Past periods (avoid "cycle" language)
    all_user_cycles = db.query(Cycle).filter(Cycle.user_id == current_user.id).order_by(Cycle.id.asc()).all()
    past_periods_data = []
    for c in all_user_cycles:
        if c.id != active_cycle.id:
            txs = db.query(Transaction).filter(Transaction.cycle_id == c.id).all()
            cat_spending = {}
            for tx in txs:
                if tx.type.value == "EXPENSE":
                    cat = tx.category.capitalize() if tx.category else "Other"
                    cat_spending[cat] = cat_spending.get(cat, 0.0) + tx.amount
            cat_str = ", ".join([f"{k}: ₹{v}" for k, v in cat_spending.items()]) if cat_spending else "None"
            label = c.start_date.strftime("%b %Y")
            past_periods_data.append(f"Period {label}: Income ₹{c.salary_amount + c.total_income_other_than_salary}, Total Spent ₹{c.total_expenses}, Categories ({cat_str}), Status: {c.status.value}")
    past_context = "\n".join(past_periods_data) if past_periods_data else "No past financial periods yet."

    # 3. Budget Envelopes
    budgets = db.query(CategoryBudget).filter(CategoryBudget.cycle_id == active_cycle.id).all()
    budget_context = "\n".join([
        f"Envelope '{b.category_name}': Allocated ₹{b.allocated_amount}, Spent ₹{b.spent_amount}, Remaining ₹{max(0, b.allocated_amount - b.spent_amount)}"
        for b in budgets
    ]) if budgets else "No budget envelopes set."

    # 4. Reminders / Loans
    reminders = db.query(Reminder).filter(Reminder.user_id == current_user.id).order_by(Reminder.due_date.asc()).all()
    now = datetime.utcnow()
    reminder_lines = []
    for r in reminders:
        status = "PAID" if r.is_paid else ("OVERDUE" if r.due_date and r.due_date < now else "UPCOMING")
        due = r.due_date.strftime("%Y-%m-%d") if r.due_date else "No due date"
        reminder_lines.append(f"Reminder [{r.id}] '{r.title}' | Type: {r.type.value} | Amount: ₹{r.amount} | Due: {due} | Status: {status} | Notes: {r.notes or 'None'}")
    reminders_context = "\n".join(reminder_lines) if reminder_lines else "No reminders or loans set."

    # 5. Balance snapshot
    available_balance = sm.calculate_current_balance(active_cycle)
    total_allocated = sum(b.allocated_amount for b in budgets)
    total_envelope_remaining = sum(max(0, b.allocated_amount - b.spent_amount) for b in budgets)

    balance_summary = (
        f"CURRENT FINANCIAL SNAPSHOT:\n"
        f"  Available Balance (excl. envelopes): ₹{available_balance}\n"
        f"  Total Allocated to Envelopes: ₹{total_allocated}\n"
        f"  Total Envelope Remaining: ₹{total_envelope_remaining}\n"
        f"  Total Money Available (Balance + Envelopes): ₹{available_balance + total_envelope_remaining}\n"
        f"  Monthly Income: ₹{active_cycle.salary_amount + active_cycle.total_income_other_than_salary} | Total Spent: ₹{active_cycle.total_expenses}"
    )

    full_context = (
        f"{balance_summary}\n\n"
        f"PAST FINANCIAL PERIODS:\n{past_context}\n\n"
        f"CURRENT PERIOD TRANSACTIONS:\n{history_context}\n\n"
        f"BUDGET ENVELOPES:\n{budget_context}\n\n"
        f"REMINDERS & LOANS:\n{reminders_context}"
    )

    try:
        nlp_response = parse_user_input(req.message, full_context, req.chat_history or [])

        # Process transaction actions via state machine
        tx_response = sm.process_nlp_response(nlp_response, active_cycle)

        # Process reminder actions
        reminder_responses = []
        for ra in (nlp_response.reminder_actions or []):
            try:
                if ra.action == "create":
                    due_dt = None
                    if ra.due_date:
                        try:
                            due_dt = datetime.fromisoformat(ra.due_date.replace("Z", "+00:00").replace("+00:00", ""))
                        except Exception:
                            due_dt = None
                    r_type = ReminderType.CUSTOM
                    try:
                        r_type = ReminderType(ra.type.upper())
                    except Exception:
                        pass
                    new_reminder = Reminder(
                        user_id=current_user.id,
                        title=ra.title,
                        amount=ra.amount,
                        due_date=due_dt,
                        type=r_type,
                        notes=ra.notes,
                        is_paid=False,
                    )
                    db.add(new_reminder)
                    db.commit()
                    due_str = due_dt.strftime("%d %b %Y") if due_dt else "no due date"
                    reminder_responses.append(f"✅ Reminder added: '{ra.title}' — ₹{ra.amount} due {due_str}")

                elif ra.action == "mark_paid":
                    # Find reminder by title match (case-insensitive)
                    match = db.query(Reminder).filter(
                        Reminder.user_id == current_user.id,
                        Reminder.title.ilike(f"%{ra.title}%"),
                        Reminder.is_paid == False
                    ).first()
                    if match:
                        match.is_paid = True
                        db.commit()
                        reminder_responses.append(f"✅ Marked '{match.title}' as paid!")
                    else:
                        reminder_responses.append(f"Couldn't find an unpaid reminder matching '{ra.title}'.")

                elif ra.action == "delete":
                    match = db.query(Reminder).filter(
                        Reminder.user_id == current_user.id,
                        Reminder.title.ilike(f"%{ra.title}%")
                    ).first()
                    if match:
                        db.delete(match)
                        db.commit()
                        reminder_responses.append(f"🗑 Deleted reminder: '{match.title}'")
                    else:
                        reminder_responses.append(f"Couldn't find a reminder matching '{ra.title}'.")
            except Exception as re:
                reminder_responses.append(f"Error processing reminder: {str(re)}")

        # Combine all responses
        parts = []
        if tx_response and tx_response != "No valid transactions found.":
            parts.append(tx_response)
        if reminder_responses:
            parts.append("\n".join(reminder_responses))

        if nlp_response.ai_insight:
            final_insight = nlp_response.ai_insight
            if parts:
                return ChatResponse(response="\n\n".join(parts) + "\n\n" + final_insight)
            else:
                return ChatResponse(response=final_insight)
        else:
            return ChatResponse(response="\n\n".join(parts) if parts else "Got it!")

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
