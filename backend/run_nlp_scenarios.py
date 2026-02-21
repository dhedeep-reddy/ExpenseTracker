import requests
import time

BASE_URL = "http://localhost:8000/api"

def run_scenarios():
    session = requests.Session()
    username = f"nlp_tester_{int(time.time())}"
    password = "password123"
    
    print(f"Registering user: {username}")
    resp = session.post(f"{BASE_URL}/auth/register", json={"username": username, "password": password})
    if resp.status_code != 200:
        print("Auth failed", resp.text)
        return
        
    token = resp.json().get("access_token")
    session.headers.update({"Authorization": f"Bearer {token}"})

    print("Setting up initial baseline parameters...\n")
    session.post(f"{BASE_URL}/cycles/start", json={"salary_amount": 50000.0})

    scenarios = [
        # SECTION 1
        "Paid 250 for food",
        "Freelancing 8000",
        "Got bonus 5000",
        "Salary credited 50000",
        "Paid 500",
        "Amazon 1200",
        "bro 2k",
        "uber yday 340",
        
        # SECTION 2
        "Got salary 50k and paid rent 10k",
        
        # SECTION 3
        "Actually it was 700",
        "Salary was 48k not 50k",
        
        # SECTION 4
        "Salary credited 50k",
        "Got 25k",
        "Start fresh this month",
        
        # SECTION 5
        "Rent 120000",
        
        # SECTION 6
        "Paid via credit card 3000",
        "Paid credit card bill 3000",
        "Borrowed 5000 from friend",
        "Returned 2000",
        
        # SECTION 7
        "Spent 10 crore",
        "$50",
        
        # SECTION 8
        "yesterday",
        "last Sunday",
        "2 weeks ago",
        "Paid rent on Jan 5",
        
        # SECTION 9
        "How much balance left?",
        "How much did I spend on food?",
        "Can I afford a trip costing 10k?",
        "Why am I always broke?",
        
        # SECTION 10 & 11
        "Bought groceries and snacks 1500",
        "My salary date changed"
    ]

    chat_history = ""

    for s in scenarios:
        print(f"\n=======================")
        print(f"USER: {s}")
        req_data = {
            "message": s,
            "chat_history": chat_history[-1000:]
        }
        try:
            resp = session.post(f"{BASE_URL}/chat/", json=req_data)
            if resp.status_code == 200:
                ai_resp = resp.json().get("response")
                safe_ai_resp = str(ai_resp).encode("ascii", "ignore").decode()
                print(f"AI: {safe_ai_resp}")
                chat_history += f"User: {s}\nAI: {safe_ai_resp}\n"
            else:
                print(f"Error: {resp.status_code} - {resp.text}")
        except Exception as e:
            print(f"Crashed: {e}")

if __name__ == "__main__":
    run_scenarios()
