from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List, Optional, Dict
import os
import json
from openai import AzureOpenAI
from dotenv import load_dotenv
from datetime import datetime

from routes.auth import get_current_user

load_dotenv()

router = APIRouter(prefix="/api/splitter", tags=["splitter"])

client = AzureOpenAI(
    azure_endpoint=os.getenv("AZURE_OPENAI_ENDPOINT", ""),
    api_key=os.getenv("AZURE_OPENAI_API_KEY", ""),
    api_version=os.getenv("OPENAI_API_VERSION", "2024-12-01-preview"),
)


class SplitRequest(BaseModel):
    description: str


class ExpenseItem(BaseModel):
    description: str
    amount: float
    paid_by: str
    split_among: List[str]  # empty means all members


class MemberBalance(BaseModel):
    name: str
    total_paid: float
    fair_share: float
    net_balance: float  # positive = gets back money, negative = owes money


class Settlement(BaseModel):
    from_member: str
    to_member: str
    amount: float


class SplitResponse(BaseModel):
    members: List[str]
    expenses: List[ExpenseItem]
    member_balances: List[MemberBalance]
    settlements: List[Settlement]
    summary: str


@router.post("/analyze", response_model=SplitResponse)
def analyze_split(req: SplitRequest, current_user: dict = Depends(get_current_user)):
    if not req.description.strip():
        raise HTTPException(status_code=400, detail="Description cannot be empty")

    system_prompt = """You are a trip/group expense splitter AI. The user describes a trip or group expense scenario in plain English.

Your job:
1. Extract all MEMBERS (people) involved
2. Extract each EXPENSE ITEM: what it was for, how much it cost, who PAID it, and who it should be SPLIT AMONG (empty list means all members equally)
3. Compute MEMBER BALANCES: for each person, total_paid, fair_share (their portion of total spend), net_balance (positive = is owed money back, negative = owes money)
4. Compute SETTLEMENTS: the minimal set of transactions to settle all debts (who pays whom and how much)
5. Write a friendly SUMMARY of the split

IMPORTANT RULES:
- Currency: treat any currency symbols or none as the same local currency, just use the number
- If no explicit split is mentioned for an item, split equally among ALL members
- Round amounts to 2 decimal places
- Settlements should be the MINIMAL set needed (net out debts)
- All member names should be capitalized consistently

Output STRICTLY as JSON matching this schema:
{
  "members": ["Alice", "Bob", "Charlie"],
  "expenses": [
    {"description": "Hotel", "amount": 3000.0, "paid_by": "Alice", "split_among": []},
    {"description": "Dinner", "amount": 1200.0, "paid_by": "Bob", "split_among": ["Alice", "Bob"]}
  ],
  "member_balances": [
    {"name": "Alice", "total_paid": 3000.0, "fair_share": 1733.33, "net_balance": 1266.67},
    {"name": "Bob", "total_paid": 1200.0, "fair_share": 1333.33, "net_balance": -133.33},
    {"name": "Charlie", "total_paid": 0.0, "fair_share": 1133.33, "net_balance": -1133.33}
  ],
  "settlements": [
    {"from_member": "Charlie", "to_member": "Alice", "amount": 1133.33},
    {"from_member": "Bob", "to_member": "Alice", "amount": 133.33}
  ],
  "summary": "Total trip cost was ₹4200. Alice is owed ₹1266.67. Bob and Charlie owe Alice."
}
"""

    deployment_name = os.getenv("AZURE_OPENAI_DEPLOYMENT_NAME", "gpt-4o")

    try:
        response = client.chat.completions.create(
            model=deployment_name,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": req.description},
            ],
        )
        content = response.choices[0].message.content
        parsed = json.loads(content)

        # Normalize and validate
        members = parsed.get("members", [])
        expenses = [ExpenseItem(**e) for e in parsed.get("expenses", [])]
        member_balances = [MemberBalance(**m) for m in parsed.get("member_balances", [])]
        settlements = [Settlement(**s) for s in parsed.get("settlements", [])]
        summary = parsed.get("summary", "Split calculated successfully.")

        return SplitResponse(
            members=members,
            expenses=expenses,
            member_balances=member_balances,
            settlements=settlements,
            summary=summary,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"LLM processing failed: {str(e)}")
