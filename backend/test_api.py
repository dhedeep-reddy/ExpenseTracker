import requests

BASE_URL = "http://localhost:8000/api"

def print_resp(action, resp):
    print(f"--- {action} ---")
    print(f"Status: {resp.status_code}")
    try:
        print(resp.json())
    except Exception as e:
        print(resp.text)
    print()

def run_tests():
    session = requests.Session()
    username = "test_scenario_user_x1"
    password = "password123"
    
    print("================ Scenario 1: Authentication ================")
    # Register
    resp = session.post(f"{BASE_URL}/auth/register", json={"username": username, "password": password})
    if resp.status_code == 400: # Probably already exists
        resp = session.post(f"{BASE_URL}/auth/login", json={"username": username, "password": password})
    
    print_resp("Login/Register", resp)
    if resp.status_code != 200:
        print("Auth failed, stopping tests.")
        return
        
    token = resp.json().get("access_token")
    session.headers.update({"Authorization": f"Bearer {token}"})

    print("================ Scenario 2: Cycle Management ================")
    resp = session.post(f"{BASE_URL}/cycles/start", json={"salary_amount": 50000.0})
    print_resp("Start New Cycle (50,000 INR Salary)", resp)

    print("================ Scenario 3: Transactions & Recalculation ================")
    txs = [
        {"type": "EXPENSE", "amount": 1500, "category": "Food", "source": "MAIN_BALANCE", "description": "Dinner"},
        {"type": "EXPENSE", "amount": 800, "category": "Transport", "source": "MAIN_BALANCE", "description": "Cab"},
        {"type": "INCOME", "amount": 5000, "category": "Freelance", "source": "MAIN_BALANCE", "description": "Side project"}
    ]
    
    for tx in txs:
        resp = session.post(f"{BASE_URL}/transactions/", json=tx)
        print_resp(f"Add {tx['type']} Transaction ({tx['amount']})", resp)

    print("================ Scenario 4: Analytics Dashboard Validation ================")
    resp = session.get(f"{BASE_URL}/analytics/dashboard")
    print_resp("Analytics Dashboard", resp)

if __name__ == "__main__":
    run_tests()
