import os
import json
from openai import AzureOpenAI
from schemas import NLPResponse
from dotenv import load_dotenv

load_dotenv()

client = AzureOpenAI(
    azure_endpoint=os.getenv("AZURE_OPENAI_ENDPOINT", ""),
    api_key=os.getenv("AZURE_OPENAI_API_KEY", ""),
    api_version=os.getenv("OPENAI_API_VERSION", "2024-12-01-preview"),
)

from datetime import datetime

def parse_user_input(user_input: str, data_context: str = "", chat_history: str = "") -> NLPResponse:
    current_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    system_prompt = f"""
    You are an AI financial reasoning engine AND a friendly conversational buddy for a single-user expense tracker.
    Your job is to parse natural language input into structured transactional data, but ALSO reply naturally and warmly to the user.
    The system revolves around salary cycles.
    
    CURRENT SYSTEM TIME: {current_time}
    (Use this exact time to resolve relative dates like "yesterday", "last week", etc. Always output `date` as an absolute ISO string YYYY-MM-DDTHH:MM:SS if a date is implied or mentioned).
    
    Here is the user's FINANCIAL CONTEXT (Transactions and Envelopes) in this cycle:
    -----
    {data_context}
    -----
    
    Here is the RECENT CHAT HISTORY (for conversational context):
    -----
    {chat_history}
    -----
    
    Extract the transactions. Types can be INCOME, EXPENSE, SALARY, CORRECTION, ALLOCATE_BUDGET, or DELETE.
    - If the user explicitly mentions a transaction (e.g. "I spent 500 on food") log it immediately.
    - **CRITICAL - IMPLICIT INTENT:** If the user implies an action based on the prior chat history (e.g. they say "yes update the salary" or "salary broo" or "yes 5000"), you MUST deduce what they mean from the `RECENT CHAT HISTORY` and output the correct `transactions` array. 
    - If the user says "allocate 5000 to food" or similar, type is ALLOCATE_BUDGET, amount is 5000, category is 'food'.
    - If the user correcting a previous transaction (e.g., "actually the food was 1200", "i meant 500 for rent", "change shoes to 800"), the type MUST be CORRECTION. Extract the category being corrected ('food') and the NEW correct amount (1200).
    - If the user explicitly asks to remove, delete, or undo a transaction (e.g. "delete the last food expense", "remove the 5000 income from my mom"), the type MUST be DELETE. Extract the details (amount, category) of the transaction they want to delete.
    - If the user mentions getting a partial salary, set is_partial_salary to true.
    
    CONVERSATION RULES:
    1. If the user asks a question about their data ("How much did I spend?"), analyze the history and put your friendly answer into `ai_insight`!
    2. If the user asks how much money is left or their current balance, you MUST reply separately with: the Available Balance (excluding envelopes), a list of all allocated envelope remaining amounts, and finally the sum of Total Money available.
    3. If the user is just saying hi, making general conversation, or if no transactions are detected, DO NOT ask for clarification. Instead, match their vibe! Put a friendly response in `ai_insight` like "Hi! Any updates on today's expenses? 😊".
    
    Return a list of transactions, a general_query if asked, and clarification_needed if ambiguous.
    """
    
    deployment_name = os.getenv("AZURE_OPENAI_DEPLOYMENT_NAME", "gpt-4o")
    
    try:
        response = client.chat.completions.create(
            model=deployment_name,
            response_format={"type": "json_object"},
            messages=[
                {
                    "role": "system", 
                    "content": system_prompt + "\n\nOutput strictly as JSON matching the NLPResponse schema:\n{\"transactions\": [{\"type\": \"DELETE\", \"amount\": 5000, \"category\": \"mom\", \"date\": null, \"intent\": \"delete duplicate income\", \"confidence_score\": 0.9, \"is_partial_salary\": false}], \"general_query\": null, \"clarification_needed\": null, \"ai_insight\": null}"
                },
                {"role": "user", "content": user_input}
            ]
        )
        
        content = response.choices[0].message.content
        parsed_data = json.loads(content)
        return NLPResponse(**parsed_data)
        
    except Exception as e:
        print(f"Error parsing input: {e}")
        return NLPResponse(
            transactions=[],
            ai_insight="I hit a slight snag understanding that! Do you have any updates on today's expenses to log? 😊"
        )
