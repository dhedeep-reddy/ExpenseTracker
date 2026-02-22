from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from database import TransactionType, ReminderType

class NLPTransaction(BaseModel):
    type: TransactionType = Field(description="The type of the transaction")
    amount: float = Field(default=0.0, description="The numeric amount of the transaction")
    category: Optional[str] = Field(None, description="The category of the expense or income")
    date: Optional[str] = Field(None, description="ISO date string if mentioned")
    intent: str = Field(default="", description="Intent summary for debugging")
    confidence_score: float = Field(default=0.9, description="Confidence 0.0–1.0")
    cycle_id: Optional[int] = Field(None, description="Past cycle id if explicitly mentioned")
    is_partial_salary: Optional[bool] = Field(False, description="True if partial salary")

class NLPReminderAction(BaseModel):
    action: str = Field(description="'create', 'mark_paid', or 'delete'")
    title: str = Field(default="", description="Title/name of the reminder or loan")
    amount: float = Field(default=0.0, description="Amount of the reminder")
    due_date: Optional[str] = Field(None, description="ISO date string for due date")
    type: str = Field(default="CUSTOM", description="LOAN, BILL, SUBSCRIPTION, or CUSTOM")
    notes: Optional[str] = Field(None, description="Any extra notes")

class NLPResponse(BaseModel):
    transactions: List[NLPTransaction] = Field(default=[], description="List of financial transactions extracted")
    reminder_actions: List[NLPReminderAction] = Field(default=[], description="List of reminder/loan actions to perform")
    general_query: Optional[str] = Field(None, description="Question the user is asking")
    clarification_needed: Optional[str] = Field(None, description="Question to ask user if ambiguous")
    ai_insight: Optional[str] = Field(None, description="Conversational reply or data answer")
