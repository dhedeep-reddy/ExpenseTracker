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
    chat_history: List[dict] = None   # list of {role: "user"|"assistant", content: str}
) -> NLPResponse:
    current_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    system_prompt = f"""You are an AI financial reasoning engine AND a warm, conversational buddy for a single-user expense tracker. Your job is to parse natural language input into structured transactional data AND reply naturally to the user.

CURRENT SYSTEM TIME: {current_time}
(Use this to resolve relative dates like "yesterday", "last week". Always output `date` as ISO: YYYY-MM-DDTHH:MM:SS)

FINANCIAL CONTEXT (current cycle transactions, past cycles, envelopes):
-----
{data_context}
-----

PARSING RULES:
- Transaction types: INCOME, EXPENSE, SALARY, CORRECTION, ALLOCATE_BUDGET, DELETE, DELETE_BUDGET
- Log explicit transactions immediately: "spent 500 on food" → EXPENSE 500 food
- **CONTEXT-AWARE REPLIES:** The full conversation history is provided as actual chat messages above this system prompt. If the user gives a SHORT or AMBIGUOUS message like "yes", "sure", "ok", "go ahead", "tell me", or a single number, you MUST read the immediately preceding assistant message and respond accordingly. For example, if the assistant just offered to "summarize spending by category", and the user says "yes", you MUST provide that spending summary in `ai_insight`.
- CORRECTION: user fixes a past entry ("actually food was 1200") → type CORRECTION, correct category + new amount
- DELETE: user removes a transaction ("delete the last food expense") → type DELETE with category/amount details
- DELETE_BUDGET: user removes/clears/deletes an entire budget envelope ("remove rent envelope", "delete food budget", "clear transport allocation", "remove the rent budget") → type DELETE_BUDGET, category = envelope name, amount = 0
- ALLOCATE_BUDGET: "allocate 5000 to food" → type ALLOCATE_BUDGET, amount 5000, category food
- PARTIAL SALARY: set is_partial_salary=true if mentioned
- CROSS-CYCLE: if user names a past cycle explicitly ("Cycle 7"), set cycle_id to that integer

CONVERSATION RULES:
1. If the user asks a question about their data, analyze the financial context and put a clear, friendly answer in `ai_insight`.
2. For balance queries, break down: Available Balance + each envelope remaining + Total available.
3. For short confirmations ("yes", "ok", "sure", "go ahead") — look at what you (the assistant) just said/offered in the previous message and FOLLOW THROUGH on that offer in `ai_insight`. Do NOT give a generic "let me know if you need help" response.
4. For casual greetings or off-topic chat, reply warmly in `ai_insight`.

Output strictly as JSON:
{{"transactions": [{{"type": "EXPENSE", "amount": 500, "category": "food", "date": null, "intent": "lunch", "confidence_score": 0.95, "cycle_id": null, "is_partial_salary": false}}], "general_query": null, "clarification_needed": null, "ai_insight": null}}
"""

    # Build structured message list: system prompt + prior conversation turns + current user message
    messages = [{"role": "system", "content": system_prompt}]

    # Inject prior turns as real OpenAI message objects so the model has full memory
    if chat_history:
        for turn in chat_history[-20:]:  # keep last 20 turns max
            role = turn.get("role", "user")
            content = turn.get("content", "")
            if role in ("user", "assistant") and content:
                messages.append({"role": role, "content": content})

    # Current user message
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
            ai_insight="I hit a slight snag — could you rephrase that? 😊"
        )
