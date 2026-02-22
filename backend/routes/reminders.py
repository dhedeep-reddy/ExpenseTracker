from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel

from database import get_db, Reminder, ReminderType
from routes.auth import get_current_user

router = APIRouter(prefix="/api/reminders", tags=["reminders"])


class ReminderCreate(BaseModel):
    title: str
    amount: float = 0.0
    due_date: Optional[datetime] = None
    type: ReminderType = ReminderType.CUSTOM
    notes: Optional[str] = None


class ReminderUpdate(BaseModel):
    title: Optional[str] = None
    amount: Optional[float] = None
    due_date: Optional[datetime] = None
    type: Optional[ReminderType] = None
    is_paid: Optional[bool] = None
    notes: Optional[str] = None


class ReminderResponse(BaseModel):
    id: int
    title: str
    amount: float
    due_date: Optional[datetime]
    type: str
    is_paid: bool
    notes: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


@router.get("/", response_model=List[ReminderResponse])
def list_reminders(current_user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    return (
        db.query(Reminder)
        .filter(Reminder.user_id == current_user.id)
        .order_by(Reminder.due_date.asc())
        .all()
    )


@router.post("/", response_model=ReminderResponse)
def create_reminder(req: ReminderCreate, current_user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    reminder = Reminder(
        user_id=current_user.id,
        title=req.title,
        amount=req.amount,
        due_date=req.due_date,
        type=req.type,
        notes=req.notes,
    )
    db.add(reminder)
    db.commit()
    db.refresh(reminder)
    return reminder


@router.patch("/{reminder_id}", response_model=ReminderResponse)
def update_reminder(reminder_id: int, req: ReminderUpdate, current_user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    reminder = db.query(Reminder).filter(Reminder.id == reminder_id, Reminder.user_id == current_user.id).first()
    if not reminder:
        raise HTTPException(status_code=404, detail="Reminder not found")
    if req.title is not None:
        reminder.title = req.title
    if req.amount is not None:
        reminder.amount = req.amount
    if req.due_date is not None:
        reminder.due_date = req.due_date
    if req.type is not None:
        reminder.type = req.type
    if req.is_paid is not None:
        reminder.is_paid = req.is_paid
    if req.notes is not None:
        reminder.notes = req.notes
    db.commit()
    db.refresh(reminder)
    return reminder


@router.delete("/{reminder_id}")
def delete_reminder(reminder_id: int, current_user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    reminder = db.query(Reminder).filter(Reminder.id == reminder_id, Reminder.user_id == current_user.id).first()
    if not reminder:
        raise HTTPException(status_code=404, detail="Reminder not found")
    db.delete(reminder)
    db.commit()
    return {"ok": True}
