# ⚡ FinAI — AI-Powered Expense Tracker

A modern, full-stack expense tracker powered by **Azure OpenAI GPT-4o**. Log expenses, manage salary cycles, allocate budget envelopes, and chat naturally with an AI that has full access to your financial data — just like ChatGPT, but for your wallet.

---

## 🚀 Features

- 💬 **ChatGPT-style AI Chat** — Dedicated full-page chat UI where the LLM reads all your transactions, budgets, and past cycles to answer questions and log expenses in natural language
- 💰 **Salary Cycle Engine** — Automatically opens and closes monthly cycles when salary is detected
- 📊 **Envelope Budgeting** — Allocate money to categories (food, transport, etc.) and track spending per envelope
- 🔄 **Smart Corrections & Deletes** — Tell the AI "actually that was 950 not 800" and it corrects the record
- 📈 **Dashboard Analytics** — Live balance, burn rate, daily average, spending charts
- 🔒 **JWT Authentication** — Secure login/register with token-based auth
- ⚡ **Real-time Financial Health Score** — AI Insights page with a health gauge and actionable tips

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | Next.js 16 (App Router), Tailwind CSS v4, Recharts, Heroicons |
| **Backend** | FastAPI (Python), SQLAlchemy, SQLite |
| **AI Engine** | Azure OpenAI GPT-4o (`json_object` structured output) |
| **Auth** | JWT (PyJWT + werkzeug password hashing) |

---

## 📁 Project Structure

```
expense/
├── backend/
│   ├── main.py              # FastAPI app entry point
│   ├── database.py          # SQLAlchemy models & DB init
│   ├── state_machine.py     # Core financial logic engine
│   ├── nlp_engine.py        # Azure OpenAI integration
│   ├── schemas.py           # Pydantic schemas
│   ├── auth.py              # JWT auth helpers
│   └── routes/
│       ├── auth.py          # /api/auth — login, register
│       ├── cycles.py        # /api/cycles — salary cycles
│       ├── transactions.py  # /api/transactions — CRUD
│       ├── analytics.py     # /api/analytics — dashboard metrics
│       └── chat.py          # /api/chat — AI chat endpoint
│
└── frontend/
    └── src/
        ├── app/
        │   ├── (auth)/      # Login & Register pages
        │   └── (dashboard)/
        │       ├── dashboard/   # Financial overview
        │       ├── chat/        # 💬 AI Chat (ChatGPT-style)
        │       ├── transactions/
        │       └── insights/    # AI health score & tips
        ├── components/
        │   ├── layout/      # AppLayout, Sidebar, Header
        │   └── ui/          # Button, Card, QuickAddModal
        ├── contexts/        # AuthContext
        └── lib/             # Axios API client
```

---

## ⚙️ Setup & Running Locally

### Prerequisites
- Python 3.10+
- Node.js 18+
- An Azure OpenAI resource with a `gpt-4o` deployment

### 1. Backend

```bash
cd backend

# Create and activate virtual environment
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # Mac/Linux

# Install dependencies
pip install -r requirements.txt

# Create .env file
# (see .env.example below)

# Start the server
python -m uvicorn main:app --reload
# → Running at http://localhost:8000
```

**`backend/.env`** (create this file):
```
JWT_SECRET_KEY=your-secret-key
AZURE_OPENAI_ENDPOINT=https://your-resource.cognitiveservices.azure.com/
AZURE_OPENAI_API_KEY=your-api-key
AZURE_OPENAI_DEPLOYMENT_NAME=gpt-4o
OPENAI_API_VERSION=2024-12-01-preview
```

### 2. Frontend

```bash
cd frontend

# Install dependencies
npm install

# Start dev server
npm run dev
# → Running at http://localhost:3000
```

---

## 🤖 How the AI Chat Works

1. User types a message (e.g. *"Spent 800 on groceries today"*)
2. The backend builds a rich context:
   - All current cycle transactions
   - All past cycles summary
   - All budget envelopes (allocated vs. spent)
   - Last 20 chat messages (conversation memory)
3. GPT-4o parses the message into structured JSON (`NLPResponse`)
4. The `ExpenseStateMachine` processes each transaction and updates the DB
5. A natural language response is returned to the user

### Supported AI Commands (Natural Language)
| Intent | Example |
|---|---|
| Log salary | *"I got paid 75000 today"* |
| Log expense | *"Spent 1200 on food"* |
| Log income | *"Got 5000 freelance payment"* |
| Allocate budget | *"Allocate 10000 to transport"* |
| Correct entry | *"Actually the Uber was 300 not 200"* |
| Delete entry | *"Delete the last food expense"* |
| Query balance | *"How much money do I have left?"* |
| Financial advice | *"How am I doing this month?"* |

---

## 📸 Screenshots

> Dashboard, AI Chat, Transactions, and AI Insights pages available after running locally.

---

## 📄 License

MIT
