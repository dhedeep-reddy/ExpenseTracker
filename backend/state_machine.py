from sqlalchemy.orm import Session
from database import Cycle, Transaction, CycleStatus, TransactionType, TransactionSource
from schemas import NLPResponse, NLPTransaction
from datetime import datetime


class ExpenseStateMachine:
    def __init__(self, db: Session, user_id: int):
        self.db = db
        self.user_id = user_id

    def get_active_cycle(self) -> Cycle:
        """Get or create the single persistent cycle for the user."""
        cycle = self.db.query(Cycle).filter(
            Cycle.user_id == self.user_id,
            Cycle.status != CycleStatus.CLOSED
        ).order_by(Cycle.id.desc()).first()

        if not cycle:
            cycle = Cycle(user_id=self.user_id, status=CycleStatus.ACTIVE)
            self.db.add(cycle)
            self.db.commit()
            self.db.refresh(cycle)
        return cycle

    def calculate_current_balance(self, cycle: Cycle) -> float:
        """Simple running total: all income/salary + opening_balance - all expenses."""
        txs = self.db.query(Transaction).join(Cycle).filter(Cycle.user_id == self.user_id).all()
        total_income = sum(t.amount for t in txs if t.type in (TransactionType.INCOME, TransactionType.SALARY))
        total_expense = sum(t.amount for t in txs if t.type == TransactionType.EXPENSE)
        return total_income - total_expense

    def recalculate_cycle_aggregates(self, cycle: Cycle):
        """Recalculate cycle aggregates from all transactions (across all of user's cycles)."""
        from database import CategoryBudget
        # Reset
        cycle.total_expenses = 0.0
        cycle.total_income_other_than_salary = 0.0

        budgets = self.db.query(CategoryBudget).filter(CategoryBudget.cycle_id == cycle.id).all()
        for b in budgets:
            b.spent_amount = 0.0

        txs = self.db.query(Transaction).filter(Transaction.cycle_id == cycle.id).all()
        for tx in txs:
            if tx.type == TransactionType.EXPENSE:
                cycle.total_expenses += tx.amount
                if tx.category:
                    cat_budget = next((b for b in budgets if b.category_name.lower() == tx.category.lower()), None)
                    if cat_budget:
                        cat_budget.spent_amount += tx.amount
            elif tx.type == TransactionType.INCOME:
                cycle.total_income_other_than_salary += tx.amount
            elif tx.type == TransactionType.SALARY:
                cycle.salary_amount += tx.amount

        self.db.commit()

    def process_nlp_response(self, nlp_res: NLPResponse, cycle: Cycle) -> str:
        if nlp_res.clarification_needed:
            return nlp_res.clarification_needed

        if nlp_res.general_query and not nlp_res.transactions and not nlp_res.ai_insight:
            return self.handle_query(nlp_res.general_query, cycle)

        responses = []
        if nlp_res.transactions:
            for tx in nlp_res.transactions:
                target_cycle = cycle
                # Allow targeting a specific cycle id (historical edits)
                if getattr(tx, "cycle_id", None) and tx.cycle_id != cycle.id:
                    from database import Cycle as DbCycle
                    hist_cycle = self.db.query(DbCycle).filter(
                        DbCycle.id == tx.cycle_id,
                        DbCycle.user_id == self.user_id
                    ).first()
                    if hist_cycle:
                        target_cycle = hist_cycle

                if tx.confidence_score < 0.5:
                    responses.append(f"I need more clarification on: {tx.intent}")
                    continue

                if tx.type == TransactionType.SALARY:
                    responses.append(self.handle_salary(tx, target_cycle))
                elif tx.type == TransactionType.EXPENSE:
                    responses.append(self.handle_expense(tx, target_cycle))
                elif tx.type == TransactionType.INCOME:
                    responses.append(self.handle_additional_income(tx, target_cycle))
                elif tx.type == TransactionType.ALLOCATE_BUDGET:
                    responses.append(self.handle_allocation(tx, target_cycle))
                elif tx.type == TransactionType.CORRECTION:
                    responses.append(self.handle_correction(tx, target_cycle))
                elif tx.type == TransactionType.DELETE:
                    responses.append(self.handle_delete(tx, target_cycle))
                elif tx.type == TransactionType.DELETE_BUDGET:
                    responses.append(self.handle_delete_budget(tx, target_cycle))

                if target_cycle.id != cycle.id:
                    self.recalculate_cycle_aggregates(target_cycle)

        final_response = "\n".join(responses) if responses else ""
        if nlp_res.ai_insight:
            final_response = (final_response + "\n\n" + nlp_res.ai_insight if final_response else nlp_res.ai_insight)

        return final_response.strip() if final_response else "Done!"

    def handle_salary(self, tx: NLPTransaction, cycle: Cycle) -> str:
        """Record salary as income — no cycle closing, just adds to running balance."""
        tx_date = datetime.strptime(tx.date, "%Y-%m-%dT%H:%M:%S") if tx.date else datetime.utcnow()
        db_tx = Transaction(
            cycle_id=cycle.id,
            type=TransactionType.SALARY,
            category="salary",
            amount=tx.amount,
            date=tx_date,
            source=TransactionSource.MAIN_BALANCE,
            description=tx.intent or "Salary credited",
            confidence_score=tx.confidence_score,
        )
        cycle.salary_amount += tx.amount
        cycle.total_income_other_than_salary += tx.amount
        self.db.add(db_tx)
        self.db.commit()
        new_balance = self.calculate_current_balance(cycle)
        return f"💰 Salary of ₹{tx.amount:,.0f} recorded! Your running balance is now ₹{new_balance:,.0f}."

    def handle_expense(self, tx: NLPTransaction, cycle: Cycle) -> str:
        balance = self.calculate_current_balance(cycle)
        budget_msg = ""
        if tx.category:
            from database import CategoryBudget
            cat_budget = self.db.query(CategoryBudget).filter(
                CategoryBudget.cycle_id == cycle.id,
                CategoryBudget.category_name.ilike(tx.category)
            ).first()
            if cat_budget:
                cat_budget.spent_amount += tx.amount
                remaining_budget = cat_budget.allocated_amount - cat_budget.spent_amount
                if remaining_budget < 0:
                    budget_msg = f" (⚠️ Exceeded {tx.category} budget by ₹{abs(remaining_budget):,.0f})"
                else:
                    budget_msg = f" (₹{remaining_budget:,.0f} left in {tx.category} envelope)"

        tx_date = datetime.strptime(tx.date, "%Y-%m-%dT%H:%M:%S") if tx.date else datetime.utcnow()

        db_tx = Transaction(
            cycle_id=cycle.id,
            type=TransactionType.EXPENSE,
            category=tx.category,
            amount=tx.amount,
            date=tx_date,
            source=TransactionSource.MAIN_BALANCE,
            description=tx.intent,
            confidence_score=tx.confidence_score,
        )
        cycle.total_expenses += tx.amount
        self.db.add(db_tx)
        self.db.commit()
        new_balance = self.calculate_current_balance(cycle)
        return f"✅ Recorded ₹{tx.amount:,.0f} for {tx.category or 'expense'}. Balance: ₹{new_balance:,.0f}.{budget_msg}"

    def handle_allocation(self, tx: NLPTransaction, cycle: Cycle) -> str:
        if not tx.category:
            return "Please specify a category to allocate to (e.g., 'allocate 5000 to food')."

        from database import CategoryBudget
        cat_budget = self.db.query(CategoryBudget).filter(
            CategoryBudget.cycle_id == cycle.id,
            CategoryBudget.category_name.ilike(tx.category)
        ).first()

        if cat_budget:
            cat_budget.allocated_amount += tx.amount
        else:
            cat_budget = CategoryBudget(
                cycle_id=cycle.id,
                category_name=tx.category.lower(),
                allocated_amount=tx.amount,
                spent_amount=0.0,
            )
            self.db.add(cat_budget)

        self.db.commit()
        remaining = cat_budget.allocated_amount - cat_budget.spent_amount
        return f"📋 Allocated ₹{tx.amount:,.0f} to '{tx.category}' envelope! (₹{remaining:,.0f} available to spend)"

    def handle_additional_income(self, tx: NLPTransaction, cycle: Cycle) -> str:
        tx_date = datetime.strptime(tx.date, "%Y-%m-%dT%H:%M:%S") if tx.date else datetime.utcnow()
        db_tx = Transaction(
            cycle_id=cycle.id,
            type=TransactionType.INCOME,
            category=tx.category,
            amount=tx.amount,
            date=tx_date,
            source=TransactionSource.OTHER_INCOME,
            description=tx.intent,
            confidence_score=tx.confidence_score,
        )
        cycle.total_income_other_than_salary += tx.amount
        self.db.add(db_tx)
        self.db.commit()
        new_balance = self.calculate_current_balance(cycle)
        return f"💰 Added ₹{tx.amount:,.0f} income from {tx.category or 'other'}. Balance: ₹{new_balance:,.0f}."

    def handle_correction(self, tx: NLPTransaction, cycle: Cycle) -> str:
        if not tx.category:
            return "Please specify which expense category to correct."

        latest_tx = self.db.query(Transaction).filter(
            Transaction.cycle_id == cycle.id,
            Transaction.type == TransactionType.EXPENSE,
            Transaction.category.ilike(tx.category),
        ).order_by(Transaction.id.desc()).first()

        if not latest_tx:
            return f"Couldn't find a recent '{tx.category}' expense to correct."

        old_amount = latest_tx.amount
        new_amount = tx.amount
        difference = new_amount - old_amount

        latest_tx.amount = new_amount
        latest_tx.description = f"{latest_tx.description} (corrected from ₹{old_amount})"
        cycle.total_expenses += difference

        from database import CategoryBudget
        cat_budget = self.db.query(CategoryBudget).filter(
            CategoryBudget.cycle_id == cycle.id,
            CategoryBudget.category_name.ilike(tx.category),
        ).first()

        budget_msg = ""
        if cat_budget:
            cat_budget.spent_amount += difference
            budget_msg = f" (Envelope updated: ₹{max(0, cat_budget.allocated_amount - cat_budget.spent_amount):,.0f} left)"

        self.db.commit()
        return f"✏️ Corrected '{tx.category}' from ₹{old_amount:,.0f} → ₹{new_amount:,.0f}. Balance: ₹{self.calculate_current_balance(cycle):,.0f}.{budget_msg}"

    def handle_delete(self, tx: NLPTransaction, cycle: Cycle) -> str:
        query = self.db.query(Transaction).filter(Transaction.cycle_id == cycle.id)
        if tx.category:
            query = query.filter(Transaction.category.ilike(f"%{tx.category}%"))
        if tx.amount > 0:
            query = query.filter(Transaction.amount == tx.amount)

        latest_tx = query.order_by(Transaction.id.desc()).first()
        if not latest_tx:
            return "Could not find a matching transaction to delete."

        if latest_tx.type == TransactionType.EXPENSE:
            cycle.total_expenses -= latest_tx.amount
            from database import CategoryBudget
            if latest_tx.category:
                cat_budget = self.db.query(CategoryBudget).filter(
                    CategoryBudget.cycle_id == cycle.id,
                    CategoryBudget.category_name.ilike(latest_tx.category),
                ).first()
                if cat_budget:
                    cat_budget.spent_amount -= latest_tx.amount
        elif latest_tx.type == TransactionType.INCOME:
            cycle.total_income_other_than_salary -= latest_tx.amount

        self.db.delete(latest_tx)
        self.db.commit()
        return f"🗑 Deleted '{latest_tx.category}' (₹{latest_tx.amount:,.0f}). Balance: ₹{self.calculate_current_balance(cycle):,.0f}."

    def handle_delete_budget(self, tx: NLPTransaction, cycle: Cycle) -> str:
        from database import CategoryBudget
        if not tx.category:
            return "Please specify which budget envelope to remove."

        budget = self.db.query(CategoryBudget).filter(
            CategoryBudget.cycle_id == cycle.id,
            CategoryBudget.category_name.ilike(tx.category),
        ).first()

        if not budget:
            return f"No envelope found for '{tx.category}'."

        cat_name = budget.category_name
        self.db.delete(budget)
        self.db.commit()
        return f"🗑 Removed '{cat_name}' envelope. Balance: ₹{self.calculate_current_balance(cycle):,.0f}."

    def handle_query(self, query: str, cycle: Cycle) -> str:
        bal = self.calculate_current_balance(cycle)
        from database import CategoryBudget
        budgets = self.db.query(CategoryBudget).filter(CategoryBudget.cycle_id == cycle.id).all()

        response = f"**Available Balance**: ₹{bal:,.0f}"
        if budgets:
            response += "\n\n**Budget Envelopes**:"
            for b in budgets:
                remaining = b.allocated_amount - b.spent_amount
                if remaining > 0:
                    response += f"\n- {b.category_name.capitalize()}: ₹{remaining:,.0f} remaining"
        return response
