import os
import json
from openai import AzureOpenAI
from schemas import NLPResponse
from dotenv import load_dotenv
from datetime import datetime
from typing import List

load_dotenv()

client = AzureOpenAI(
    azure_endpoint=os.getenv("AZURE_OPENAI_ENDPOINT", ""),
    api_key=os.getenv("AZURE_OPENAI_API_KEY", ""),
    api_version=os.getenv("OPENAI_API_VERSION", "2024-12-01-preview"),
)

def parse_user_input(
    user_input: str,
    data_context: str = "",
    chat_history: List[dict] = None
) -> NLPResponse:
    current_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    system_prompt = f"""You are FinAI — a warm, intelligent financial assistant for a personal expense tracker. You help the user log transactions, manage budget envelopes, manage payment reminders/loans, and answer questions about their finances.

CURRENT SYSTEM TIME: {current_time}
(Use this to resolve relative dates like "yesterday", "last week". Always output `date` as ISO: YYYY-MM-DDTHH:MM:SS)

FINANCIAL CONTEXT (balance, transactions, envelopes, reminders):
-----
{data_context}
-----

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TRANSACTION PARSING RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Transaction types you can output in `transactions[]`:
- EXPENSE     → user spent money ("spent 500 on food", "paid 200 for taxi")
- INCOME      → user received money other than salary ("got 2000 freelance", "received 500 from friend")
- SALARY      → user received their monthly salary ("got salary of 75000", "salary credited")
- ALLOCATE_BUDGET → user wants to set a budget envelope ("allocate 10000 to food", "set 5000 for transport", "budget 3000 for rent")
- CORRECTION  → user fixes a past entry ("actually food was 1200 not 800", "correct the grocery to 950")
- DELETE      → user deletes a transaction ("remove that food expense", "delete last taxi entry")
- DELETE_BUDGET → user removes a budget envelope ("delete food budget", "remove rent envelope")

CRITICAL RULES FOR TRANSACTIONS:
1. ALLOCATE_BUDGET: Use this whenever the user says "allocate", "set budget", "budget for", "set aside", "assign", "put X for Y". Put the amount and category. This is NOT an expense — it's a planning action.
2. EXPENSE: Only use for actual money spent (already happened).
3. Always put the transaction in `transactions[]` array. NEVER just mention it in `ai_insight` without putting it in the array.
4. For short confirmations ("yes", "ok", "sure"), look at the previous assistant message and follow through.
5. If confidence < 0.5, ask for clarification.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
REMINDER / LOAN RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Use `reminder_actions[]` when the user talks about future payments, loans, bills, or subscription reminders.

Reminder action types:
- "create" → user wants to add a future payment reminder or loan ("add reminder for rent on 28th", "I have a loan EMI of 5000 due next Friday", "remind me to pay electricity 1200 before March 1")
- "mark_paid" → user says a reminder/loan is paid ("I paid the rent", "EMI paid", "cleared the electricity bill")  
- "delete" → user removes a reminder ("remove the gym subscription reminder", "delete rent reminder")

Reminder types: LOAN, BILL, SUBSCRIPTION, CUSTOM

CRITICAL: If the user mentions paying a future bill, a loan, an EMI, or wants to be reminded of something → put it in `reminder_actions[]`, NOT in `transactions[]` (unless they say they already paid it, in which case use both — create an EXPENSE transaction AND mark_paid the reminder).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CONVERSATION RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. Always be warm, concise, and friendly.
2. If asked about balance/spending, analyze the FINANCIAL CONTEXT and give a clear answer in `ai_insight`.
3. For balance queries, break down: Available Balance + envelope details + Total.
4. Always confirm what you logged in `ai_insight`.
5. Never refer to "cycles" — instead say "this month" or "current period".

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OUTPUT FORMAT (strict JSON, all fields present, null for unused)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{{
  "transactions": [
    {{"type": "EXPENSE", "amount": 500, "category": "food", "date": null, "intent": "lunch", "confidence_score": 0.95, "cycle_id": null, "is_partial_salary": false}}
  ],
  "reminder_actions": [
    {{"action": "create", "title": "Rent Payment", "amount": 12000, "due_date": "2026-03-01T00:00:00", "type": "BILL", "notes": null}}
  ],
  "general_query": null,
  "clarification_needed": null,
  "ai_insight": "Got it! Logged ₹500 for food. 🍽️"
}}
"""

    messages = [{"role": "system", "content": system_prompt}]

    if chat_history:
        for turn in chat_history[-20:]:
            role = turn.get("role", "user")
            content = turn.get("content", "")
            if role in ("user", "assistant") and content:
                messages.append({"role": role, "content": content})

    messages.append({"role": "user", "content": user_input})

    deployment_name = os.getenv("AZURE_OPENAI_DEPLOYMENT_NAME", "gpt-4o")

    try:
        response = client.chat.completions.create(
            model=deployment_name,
            response_format={"type": "json_object"},
            messages=messages
        )
        content = response.choices[0].message.content
        parsed_data = json.loads(content)
        return NLPResponse(**parsed_data)

    except Exception as e:
        print(f"Error parsing input: {e}")
        return NLPResponse(
            transactions=[],
            reminder_actions=[],
            ai_insight="I hit a slight snag — could you rephrase that? 😊"
        )


def generate_report_summary(stats: dict) -> dict:
    """Given pre-computed spending statistics, ask GPT-4o for a warm narrative
    summary + actionable bullet points. Returns a dict with keys:
    headline (str), paragraphs (list[str]), bullets (list[str]).
    Falls back to a rule-based summary if the AI call fails."""

    system_prompt = """You are FinAI, a warm and sharp personal-finance analyst.
You are given pre-computed statistics about a user's ENTIRE spending history across many months.
Write a concise, encouraging, and genuinely useful financial review.

Rules:
- Use Indian Rupees (₹) and Indian number formatting.
- Be specific: reference the actual numbers, categories, and recurring items given.
- Call out recurring/subscription-like spending and whether it looks healthy.
- Be honest but supportive. No fluff, no generic advice.

Output STRICT JSON only, in this exact shape:
{
  "headline": "one punchy sentence summarizing their financial picture",
  "paragraphs": ["2 to 3 short paragraphs of narrative analysis"],
  "bullets": ["4 to 6 short, specific, actionable insight bullets"]
}"""

    deployment_name = os.getenv("AZURE_OPENAI_DEPLOYMENT_NAME", "gpt-4o")
    try:
        response = client.chat.completions.create(
            model=deployment_name,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": json.dumps(stats, default=str)},
            ],
        )
        data = json.loads(response.choices[0].message.content)
        return {
            "headline": data.get("headline", "Here's your spending review."),
            "paragraphs": data.get("paragraphs", []) or [],
            "bullets": data.get("bullets", []) or [],
        }
    except Exception as e:
        print(f"Error generating report summary: {e}")
        return _fallback_summary(stats)


def _fallback_summary(stats: dict) -> dict:
    """Rule-based summary used when the AI call is unavailable."""
    totals = stats.get("totals", {})
    income = totals.get("total_income", 0) or 0
    expenses = totals.get("total_expenses", 0) or 0
    net = income - expenses
    top_cats = stats.get("by_category", [])[:3]
    recurring = stats.get("recurring", [])

    bullets = []
    if top_cats:
        c = top_cats[0]
        bullets.append(
            f"Your biggest spend is {c['category'].title()} at ₹{c['total']:,.0f} "
            f"({c['pct']:.0f}% of all spending)."
        )
    if recurring:
        bullets.append(
            f"You have {len(recurring)} recurring item(s) — e.g. "
            + ", ".join(r["label"] for r in recurring[:3]) + "."
        )
    savings_rate = (net / income * 100) if income else 0
    bullets.append(
        f"Over this period you saved ₹{net:,.0f} "
        f"({savings_rate:.0f}% of income)."
        if net >= 0 else
        f"You spent ₹{abs(net):,.0f} more than you earned this period — worth reviewing."
    )
    return {
        "headline": (
            f"You've tracked ₹{expenses:,.0f} across {totals.get('months_count', 0)} months."
        ),
        "paragraphs": [
            "Here is an automated overview of your spending. "
            "Connect the AI engine for a richer, personalized narrative."
        ],
        "bullets": bullets,
    }
