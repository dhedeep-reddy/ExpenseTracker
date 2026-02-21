from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from database import TransactionType

class NLPTransaction(BaseModel):
    type: TransactionType = Field(description="The type of the transaction: INCOME, EXPENSE, SALARY, CORRECTION, ALLOCATE_BUDGET, or DELETE")
    amount: float = Field(description="The numeric amount of the transaction")
    category: Optional[str] = Field(None, description="The category of the expense or income, e.g., 'food', 'rent', 'freelance'.")
    date: Optional[str] = Field(None, description="The detected date string, preferably in ISO format. Only if explicitly mentioned.")
    intent: str = Field(description="The overall intent of this transaction to help debugging system choices")
    confidence_score: float = Field(description="A confidence score between 0.0 and 1.0 representing how certain the model is about extracting these details")
    cycle_id: Optional[int] = Field(None, description="If the user explicitly refers to applying this transaction to a past cycle or timeframe, extract its integer cycle_id based on the context summary.")
    is_partial_salary: Optional[bool] = Field(False, description="True if the user mentions getting a partial salary")

class NLPResponse(BaseModel):
    transactions: List[NLPTransaction] = Field(description="List of transactions extracted from the user's message")
    general_query: Optional[str] = Field(None, description="If the user is asking a general question instead of or along with entering data, state the question here.")
    clarification_needed: Optional[str] = Field(None, description="If any fields are missing or ambiguous (e.g. no amount mentioned), what question should we ask the user?")
    ai_insight: Optional[str] = Field(None, description="If the user asks a question about their data, provide a conversational answer here based on the financial history provided.")
