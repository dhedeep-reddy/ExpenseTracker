import streamlit as st
import pandas as pd
from database import init_db, SessionLocal, CategoryBudget, Transaction, TransactionType, TransactionSource
from state_machine import ExpenseStateMachine
from nlp_engine import parse_user_input
from auth import register_user, verify_user

st.set_page_config(page_title="Expense Tracker", layout="wide")

# Initialize DB
if "db_initialized" not in st.session_state:
    init_db()
    st.session_state.db_initialized = True

if "user_id" not in st.session_state:
    st.session_state.user_id = None
    st.session_state.username = None

# Ensure DB session is available for sidebar and logic
db = SessionLocal()

if st.session_state.user_id is None:
    st.title("💰 Expense Tracker")
    tab1, tab2 = st.tabs(["Login", "Register"])
    
    with tab1:
        st.subheader("Login to your account")
        login_user = st.text_input("Username", key="login_user")
        login_pwd = st.text_input("Password", type="password", key="login_pwd")
        if st.button("Login"):
            success, result = verify_user(db, login_user, login_pwd)
            if success:
                st.session_state.user_id = result.id
                st.session_state.username = result.username
                st.rerun()
            else:
                st.error(result)
                
    with tab2:
        st.subheader("Create a new account")
        reg_user = st.text_input("Username", key="reg_user")
        reg_pwd = st.text_input("Password", type="password", key="reg_pwd")
        if st.button("Register"):
            if not reg_user or not reg_pwd:
                st.error("Please provide both username and password.")
            else:
                success, msg = register_user(db, reg_user, reg_pwd)
                if success:
                    st.success(msg + " Please switch to Login tab.")
                else:
                    st.error(msg)
    
    st.stop()  # Stop execution here if not logged in

st.subheader(f"Welcome, {st.session_state.username}")

if "messages" not in st.session_state:
    st.session_state.messages = []

sm = ExpenseStateMachine(db, st.session_state.user_id)
active_cycle = sm.get_active_cycle()

# Fetch transactions for context and analytics
transactions = db.query(Transaction).filter(Transaction.cycle_id == active_cycle.id).order_by(Transaction.date.asc()).all()
df = pd.DataFrame([{
    "Date": tx.date,
    "Time": tx.date.strftime("%Y-%m-%d %H:%M"),
    "Type": tx.type.value,
    "Category": tx.category.capitalize() if tx.category else "Other",
    "Amount": tx.amount,
    "Source": tx.source.value,
    "Description": tx.description
} for tx in transactions]) if transactions else pd.DataFrame()

with st.sidebar:
    st.title("💰 Expense Tracker")
    st.caption(f"Cycle State: {active_cycle.status.value}")
    st.write("---")
    
    navigation = st.radio("Navigation", ["💬 Chat", "📊 Financial Dashboard", "📅 History"])
    st.write("---")
    
    if st.button("Logout", key="sidebar_logout_btn"):
        st.session_state.user_id = None
        st.session_state.username = None
        st.session_state.messages = []
        st.rerun()

# 1. Chat View (Minimalist)
if navigation == "💬 Chat":
    current_balance = sm.calculate_current_balance(active_cycle)
    
    # Massive UI Metric at the top of Chat
    st.markdown("<h2 style='text-align: center; color: #4CAF50;'>Available Balance</h2>", unsafe_allow_html=True)
    st.markdown(f"<h1 style='text-align: center; font-size: 4rem;'>₹{current_balance}</h1>", unsafe_allow_html=True)
    st.write("---")
    
    for msg in st.session_state.messages:
        with st.chat_message(msg["role"]):
            st.markdown(msg["content"])
            
    user_input = st.chat_input("Log an expense, salary, or ask a question...")
    
    if user_input:
        st.session_state.messages.append({"role": "user", "content": user_input})
        with st.chat_message("user"):
            st.markdown(user_input)
            
        with st.chat_message("assistant"):
            history_context = df.to_json(orient="records") if not df.empty else "No transactions yet."
            
            from database import Cycle, Transaction
            all_user_cycles = db.query(Cycle).filter(Cycle.user_id == st.session_state.user_id).order_by(Cycle.id.asc()).all()
            
            past_cycles_data = []
            for c in all_user_cycles:
                if c.id != active_cycle.id:
                    txs = db.query(Transaction).filter(Transaction.cycle_id == c.id, Transaction.type == "EXPENSE").all()
                    cat_spending = {}
                    for tx in txs:
                        cat = tx.category.capitalize() if tx.category else "Other"
                        cat_spending[cat] = cat_spending.get(cat, 0.0) + tx.amount
                    
                    cat_str = ", ".join([f"{k}: ₹{v}" for k, v in cat_spending.items()]) if cat_spending else "None"
                    past_cycles_data.append(f"Cycle {c.id}: Started {c.start_date.strftime('%Y-%m-%d')}, Salary ₹{c.salary_amount}, Total Spent ₹{c.total_expenses}, Categories ({cat_str}), Status: {c.status.value}")
            
            past_cycles_context = "\n".join(past_cycles_data)
            if not past_cycles_context:
                past_cycles_context = "No past cycles available."
            
            budgets = db.query(CategoryBudget).filter(CategoryBudget.cycle_id == active_cycle.id).all()
            budget_context = "\n".join([f"Envelope '{b.category_name}': Allocated ₹{b.allocated_amount}, Spent ₹{b.spent_amount}, Remaining ₹{max(0, b.allocated_amount - b.spent_amount)}" for b in budgets]) if budgets else "No envelopes allocated."
            
            full_context = f"PAST CYCLES SUMMARY:\n{past_cycles_context}\n\nCURRENT CYCLE TRANSACTIONS:\n{history_context}\n\nCURRENT ENVELOPES:\n{budget_context}"
            
            # Format the last 5 chat messages for context
            recent_msgs = st.session_state.messages[-6:-1] # excluding the one just added
            chat_context = "\n".join([f"{m['role']}: {m['content']}" for m in recent_msgs]) if recent_msgs else "No previous chat."
            
            nlp_response = parse_user_input(user_input, full_context, chat_context)
            response = sm.process_nlp_response(nlp_response, active_cycle)
            st.markdown(response)
        
        st.session_state.messages.append({"role": "assistant", "content": response})
        st.rerun()

# 2. Financial Dashboard View (Analytics)
elif navigation == "📊 Financial Dashboard":
    st.header("Financial Dashboard")
    
    from database import Cycle
    all_cycles = db.query(Cycle).filter(Cycle.user_id == st.session_state.user_id).order_by(Cycle.id.desc()).all()
    cycle_options = {f"Cycle {c.id} ({c.start_date.strftime('%b %d')} - {c.end_date.strftime('%b %d') if c.end_date else 'Active'})": c.id for c in all_cycles}
    selected_cycle_label = st.selectbox("Select Cycle to Analyze", options=list(cycle_options.keys()))
    view_cycle_id = cycle_options[selected_cycle_label]
    view_cycle = db.query(Cycle).filter(Cycle.id == view_cycle_id).first()
    
    view_transactions = db.query(Transaction).filter(Transaction.cycle_id == view_cycle.id).order_by(Transaction.date.asc()).all()
    view_df = pd.DataFrame([{
        "Date": tx.date,
        "Time": tx.date.strftime("%Y-%m-%d %H:%M"),
        "Type": tx.type.value,
        "Category": tx.category.capitalize() if tx.category else "Other",
        "Amount": tx.amount,
        "Source": tx.source.value,
        "Description": tx.description
    } for tx in view_transactions]) if view_transactions else pd.DataFrame()
    
    # Top Row Metrics
    col1, col2, col3 = st.columns(3)
    col1.metric("Total Salary", f"₹{view_cycle.salary_amount}")
    col2.metric("Total Spent", f"₹{view_cycle.total_expenses}", delta=f"-₹{view_cycle.total_expenses}", delta_color="inverse")
    col3.metric("Other Income", f"₹{view_cycle.total_income_other_than_salary}")
    
    st.write("---")
    
    col_chart, col_buckets = st.columns([1.5, 1])
    
    with col_chart:
        st.subheader("Categorical Breakdown")
        if not view_df.empty and "EXPENSE" in view_df["Type"].values:
            expenses_df = view_df[view_df["Type"] == "EXPENSE"]
            cat_sum = expenses_df.groupby("Category")["Amount"].sum().reset_index()
            
            # Matplotlib Pie Chart instead of Bar Chart
            import matplotlib.pyplot as plt
            fig, ax = plt.subplots()
            ax.pie(cat_sum["Amount"], labels=cat_sum["Category"], autopct='%1.1f%%', startangle=90)
            ax.axis('equal')
            st.pyplot(fig)
        else:
            st.info("No expense data out there yet to chart.")

        st.subheader("Spending Over Time")
        if not view_df.empty and "EXPENSE" in view_df["Type"].values:
            # Group by day
            expenses_df["Day"] = expenses_df["Date"].dt.strftime('%b %d')
            time_sum = expenses_df.groupby("Day")["Amount"].sum().reset_index()
            st.line_chart(time_sum.set_index("Day"))
        else:
            st.info("No timeline data yet.")

    with col_buckets:
        st.subheader("Envelope Budgets")
        budgets = db.query(CategoryBudget).filter(CategoryBudget.cycle_id == view_cycle.id).all()
        if budgets:
            for b in budgets:
                remaining = b.allocated_amount - b.spent_amount
                safe_ratio = min(max(b.spent_amount / b.allocated_amount if b.allocated_amount > 0 else 1.0, 0.0), 1.0)
                st.progress(safe_ratio, text=f"{b.category_name.capitalize()}: ₹{remaining} left (of ₹{b.allocated_amount})")
        else:
            st.write("No envelopes tracking right now.")
            
        st.write("---")
        st.subheader("Savings & Credit")
        st.write(f"Savings: ₹{view_cycle.savings_balance}")
        st.write(f"Credit Used: ₹{view_cycle.credit_card_due}")
        st.write(f"Borrowed: ₹{view_cycle.borrowed_amount}")

# 3. History View
elif navigation == "📅 History":
    st.header("Transaction Raw Data")
    
    from database import Cycle
    all_cycles = db.query(Cycle).filter(Cycle.user_id == st.session_state.user_id).order_by(Cycle.id.desc()).all()
    cycle_options = {f"Cycle {c.id} ({c.start_date.strftime('%b %d')} - {c.end_date.strftime('%b %d') if c.end_date else 'Active'})": c.id for c in all_cycles}
    selected_cycle_label = st.selectbox("Select Cycle to View", options=list(cycle_options.keys()))
    view_cycle_id = cycle_options[selected_cycle_label]
    
    view_transactions = db.query(Transaction).filter(Transaction.cycle_id == view_cycle_id).order_by(Transaction.date.asc()).all()
    view_df = pd.DataFrame([{
        "ID": tx.id,
        "Date": tx.date,
        "Time": tx.date.strftime("%Y-%m-%d %H:%M"),
        "Type": tx.type.value,
        "Category": tx.category.capitalize() if tx.category else "Other",
        "Amount": tx.amount,
        "Source": tx.source.value,
        "Description": tx.description
    } for tx in view_transactions]) if view_transactions else pd.DataFrame()
    
    if not view_df.empty:
        # Make the table editable
        st.info("💡 You can double-click cells to edit them, or select a row and press Delete to remove it. Click 'Save Changes' to update.")
        edited_df = st.data_editor(
            view_df[["ID", "Time", "Type", "Category", "Amount", "Source", "Description"]],
            use_container_width=True,
            num_rows="dynamic",
            hide_index=True,
            key="history_editor",
            column_config={
                "ID": None, # Hide mapped ID
                "Time": st.column_config.TextColumn("Time", disabled=True),
                "Type": st.column_config.SelectboxColumn("Type", options=[e.value for e in TransactionType]),
                "Category": st.column_config.TextColumn("Category"),
                "Amount": st.column_config.NumberColumn("Amount", format="₹%f"),
                "Source": st.column_config.SelectboxColumn("Source", options=[e.value for e in TransactionSource]),
                "Description": st.column_config.TextColumn("Description"),
            }
        )
        
        if st.button("Save Changes", type="primary"):
            changes = st.session_state.get("history_editor", {})
            has_changes = False
            
            # Handle Deletions
            for row_idx in changes.get("deleted_rows", []):
                tx_id = int(view_df.iloc[row_idx]["ID"])
                tx_to_del = db.query(Transaction).filter(Transaction.id == tx_id).first()
                if tx_to_del:
                    db.delete(tx_to_del)
                    has_changes = True
                    
            # Handle Edits
            for row_idx, cols in changes.get("edited_rows", {}).items():
                tx_id = int(view_df.iloc[row_idx]["ID"])
                tx_to_edit = db.query(Transaction).filter(Transaction.id == tx_id).first()
                if tx_to_edit:
                    if "Type" in cols: tx_to_edit.type = TransactionType(cols["Type"])
                    if "Category" in cols: tx_to_edit.category = cols["Category"]
                    if "Amount" in cols: tx_to_edit.amount = float(cols["Amount"])
                    if "Source" in cols: tx_to_edit.source = TransactionSource(cols["Source"])
                    if "Description" in cols: tx_to_edit.description = cols["Description"]
                    has_changes = True

            if has_changes:
                db.commit()
                # Run complete cycle recalculation
                edit_cycle = db.query(Cycle).filter(Cycle.id == view_cycle_id).first()
                sm.recalculate_cycle_aggregates(edit_cycle)
                st.success("Changes saved! Balances and envelopes recalculated.")
                st.rerun()
    else:
        st.info("No recorded transactions in this cycle yet.")
