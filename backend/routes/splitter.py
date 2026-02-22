from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List, Optional, Dict
import os
import json
from openai import AzureOpenAI
from dotenv import load_dotenv
from collections import defaultdict

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
    split_among: List[str]      # [] means split equally among ALL members
    split_amounts: Dict[str, float] = {}  # If specific amounts per person are given


class MemberBalance(BaseModel):
    name: str
    total_paid: float
    fair_share: float
    net_balance: float  # positive = gets back money, negative = owes


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


def compute_balances_and_settlements(
    members: List[str],
    expenses: List[ExpenseItem]
) -> tuple[List[MemberBalance], List[Settlement]]:
    """
    Server-side authoritative calculation of balances and settlements.
    This ensures correct results regardless of LLM math errors.
    """
    # What each person actually paid
    total_paid: Dict[str, float] = defaultdict(float)
    # What each person's fair share is (what they should have paid)
    fair_share_owed: Dict[str, float] = defaultdict(float)

    for expense in expenses:
        payer = expense.paid_by
        total_paid[payer] += expense.amount

        if expense.split_amounts:
            # Explicit per-person amounts given
            for person, amount in expense.split_amounts.items():
                fair_share_owed[person] += amount
            # If total split_amounts < expense.amount (rounding/remainder), add to first split person
            assigned = sum(expense.split_amounts.values())
            remainder = round(expense.amount - assigned, 2)
            if abs(remainder) > 0.001 and expense.split_amounts:
                first = list(expense.split_amounts.keys())[0]
                fair_share_owed[first] += remainder
        elif expense.split_among:
            # Split equally among specified members
            per_person = round(expense.amount / len(expense.split_among), 2)
            for person in expense.split_among:
                fair_share_owed[person] += per_person
            # Add any rounding remainder to the payer's share
            assigned = per_person * len(expense.split_among)
            remainder = round(expense.amount - assigned, 2)
            if abs(remainder) > 0.001:
                fair_share_owed[expense.split_among[0]] += remainder
        else:
            # Split equally among ALL members
            per_person = round(expense.amount / len(members), 2)
            for person in members:
                fair_share_owed[person] += per_person
            assigned = per_person * len(members)
            remainder = round(expense.amount - assigned, 2)
            if abs(remainder) > 0.001:
                fair_share_owed[members[0]] += remainder

    # Ensure all members are present even if they paid nothing
    for m in members:
        total_paid.setdefault(m, 0.0)
        fair_share_owed.setdefault(m, 0.0)

    # net_balance = total_paid - fair_share (positive → gets back, negative → owes)
    member_balances = []
    net: Dict[str, float] = {}
    for m in members:
        paid = round(total_paid[m], 2)
        share = round(fair_share_owed[m], 2)
        balance = round(paid - share, 2)
        net[m] = balance
        member_balances.append(MemberBalance(
            name=m,
            total_paid=paid,
            fair_share=share,
            net_balance=balance,
        ))

    # Minimal settlements using greedy creditor-debtor algorithm
    creditors = {m: v for m, v in net.items() if v > 0.005}
    debtors = {m: -v for m, v in net.items() if v < -0.005}

    settlements = []
    cred_list = sorted(creditors.items(), key=lambda x: -x[1])
    debt_list = sorted(debtors.items(), key=lambda x: -x[1])

    ci, di = 0, 0
    cred_list = list(cred_list)
    debt_list = list(debt_list)
    # Convert to mutable lists
    cred_amounts = [v for _, v in cred_list]
    debt_amounts = [v for _, v in debt_list]

    while ci < len(cred_list) and di < len(debt_list):
        creditor = cred_list[ci][0]
        debtor = debt_list[di][0]
        amount = round(min(cred_amounts[ci], debt_amounts[di]), 2)
        if amount > 0.01:
            settlements.append(Settlement(from_member=debtor, to_member=creditor, amount=amount))
        cred_amounts[ci] -= amount
        debt_amounts[di] -= amount
        if cred_amounts[ci] < 0.01:
            ci += 1
        if debt_amounts[di] < 0.01:
            di += 1

    return member_balances, settlements


@router.post("/analyze", response_model=SplitResponse)
def analyze_split(req: SplitRequest, current_user: dict = Depends(get_current_user)):
    if not req.description.strip():
        raise HTTPException(status_code=400, detail="Description cannot be empty")

    system_prompt = """You are a group expense parser. Extract structured expense data from the user's description. You ONLY need to parse the expenses — the backend will calculate all balances and settlements correctly.

RULES:
1. Extract all MEMBERS (people involved). Normalize "I", "me", "myself" → "User".
2. Extract each EXPENSE ITEM with:
   - description: what it was for
   - amount: the total numeric amount
   - paid_by: who paid (normalized name)
   - split_among: list of names if split equally among a specific subset, [] if split equally among ALL members
   - split_amounts: dict of {name: amount} ONLY when specific per-person amounts are stated (not equal split)
     Example: "breakfast 1100 split: User=500, Bob=200, Alice=400" → split_amounts: {"User": 500, "Bob": 200, "Alice": 400}
3. Write a brief summary string.

IMPORTANT:
- If the user says "split equally" with no specific amounts → use split_among:[] and split_amounts:{}
- If the user gives specific per-person amounts → use split_amounts with those exact values
- DO NOT compute balances or settlements — the backend handles that
- Normalize "I", "me", "my", "myself" to "User" consistently

Output JSON:
{
  "members": ["User", "Alice", "Bob"],
  "expenses": [
    {"description": "Hotel", "amount": 3000.0, "paid_by": "User", "split_among": [], "split_amounts": {}},
    {"description": "Dinner", "amount": 1500.0, "paid_by": "Alice", "split_among": [], "split_amounts": {}},
    {"description": "Breakfast", "amount": 1100.0, "paid_by": "User", "split_among": [], "split_amounts": {"User": 500, "Bob": 200, "Alice": 400}}
  ],
  "summary": "3-person Goa trip with ₹7100 in total expenses."
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

        members: List[str] = parsed.get("members", [])
        expenses = [ExpenseItem(**e) for e in parsed.get("expenses", [])]
        summary: str = parsed.get("summary", "Split calculated successfully.")

        if not members:
            raise HTTPException(status_code=400, detail="Could not identify members from description.")

        # Server-side authoritative balance calculation (no LLM math errors)
        member_balances, settlements = compute_balances_and_settlements(members, expenses)

        # Build total for summary
        total = sum(e.amount for e in expenses)
        owed_str = ", ".join(
            f"{b.name} is owed ₹{abs(b.net_balance):,.2f}"
            for b in member_balances if b.net_balance > 0.01
        )
        owes_str = ", ".join(
            f"{b.name} owes ₹{abs(b.net_balance):,.2f}"
            for b in member_balances if b.net_balance < -0.01
        )
        auto_summary = f"Total: ₹{total:,.2f}. {owed_str}. {owes_str}.".replace(". .", ".")

        return SplitResponse(
            members=members,
            expenses=expenses,
            member_balances=member_balances,
            settlements=settlements,
            summary=auto_summary or summary,
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"LLM processing failed: {str(e)}")
