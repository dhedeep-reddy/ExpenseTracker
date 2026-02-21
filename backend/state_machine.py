from sqlalchemy.orm import Session
from database import Cycle, Transaction, CycleStatus, TransactionType, TransactionSource
from schemas import NLPResponse, NLPTransaction
from datetime import datetime

class ExpenseStateMachine:
    def __init__(self, db: Session, user_id: int):
        self.db = db
        self.user_id = user_id

    def get_active_cycle(self) -> Cycle:
        cycle = self.db.query(Cycle).filter(Cycle.user_id == self.user_id, Cycle.status != CycleStatus.CLOSED).order_by(Cycle.id.desc()).first()
        if not cycle:
            cycle = Cycle(user_id=self.user_id, status=CycleStatus.ACTIVE)
            self.db.add(cycle)
            self.db.commit()
            self.db.refresh(cycle)
        return cycle

    def calculate_current_balance(self, cycle: Cycle) -> float:
        unspent_allocated = 0.0
        from database import CategoryBudget
        budgets = self.db.query(CategoryBudget).filter(CategoryBudget.cycle_id == cycle.id).all()
        for b in budgets:
            if b.allocated_amount > b.spent_amount:
                unspent_allocated += (b.allocated_amount - b.spent_amount)
                
        return cycle.opening_balance + cycle.total_income_other_than_salary - cycle.total_expenses - unspent_allocated

    def recalculate_cycle_aggregates(self, cycle: Cycle):
        """Wipes and re-sums cycle aggregates from ground truth Transaction rows."""
        # 1. Reset aggregates
        cycle.total_expenses = 0.0
        cycle.total_income_other_than_salary = 0.0
        
        from database import CategoryBudget
        budgets = self.db.query(CategoryBudget).filter(CategoryBudget.cycle_id == cycle.id).all()
        for b in budgets:
            b.spent_amount = 0.0
            
        # 2. Iterate transactions
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
                cycle.salary_amount = tx.amount
                
        self.db.commit()

    def process_nlp_response(self, nlp_res: NLPResponse, cycle: Cycle) -> str:
        if nlp_res.clarification_needed:
            return nlp_res.clarification_needed
            
        if nlp_res.general_query and not nlp_res.transactions and not nlp_res.ai_insight:
            return self.handle_query(nlp_res.general_query, cycle)

        responses = []
        if nlp_res.transactions:
            from database import Cycle as DbCycle
            for tx in nlp_res.transactions:
                target_cycle = cycle
                # Check for historical routing
                if getattr(tx, "cycle_id", None) and tx.cycle_id != cycle.id:
                    hist_cycle = self.db.query(DbCycle).filter(DbCycle.id == tx.cycle_id, DbCycle.user_id == cycle.user_id).first()
                    if hist_cycle:
                        target_cycle = hist_cycle

                if tx.confidence_score < 0.5:
                    responses.append(f"I need more clarification on: {tx.intent}")
                    continue
                elif tx.confidence_score <= 0.85:
                    # Assuming confirmation for now to keep flow smooth
                    pass
                
                if tx.type == TransactionType.SALARY:
                    res = self.handle_salary(tx, target_cycle)
                    responses.append(res)
                elif tx.type == TransactionType.EXPENSE:
                    res = self.handle_expense(tx, target_cycle)
                    responses.append(res)
                elif tx.type == TransactionType.INCOME:
                    res = self.handle_additional_income(tx, target_cycle)
                    responses.append(res)
                elif tx.type == TransactionType.ALLOCATE_BUDGET:
                    res = self.handle_allocation(tx, target_cycle)
                    responses.append(res)
                elif tx.type == TransactionType.CORRECTION:
                    res = self.handle_correction(tx, target_cycle)
                    responses.append(res)
                elif tx.type == TransactionType.DELETE:
                    res = self.handle_delete(tx, target_cycle)
                    responses.append(res)
                    
                # Mechanical Recalculation mapping if a historical cycle was touched natively
                if target_cycle.id != cycle.id:
                    self.recalculate_cycle_aggregates(target_cycle)
        
        # Combine transaction results with AI insight
        final_response = ""
        if responses:
            final_response += "\n".join(responses)
            
        if nlp_res.ai_insight:
            final_response = final_response + "\n\n" + nlp_res.ai_insight if final_response else nlp_res.ai_insight
            
        return final_response.strip() if final_response else "No valid transactions found."

    def handle_salary(self, tx: NLPTransaction, current_cycle: Cycle) -> str:
        if tx.is_partial_salary:
            return self.handle_additional_income(tx, current_cycle)

        if current_cycle.salary_amount > 0:
            current_balance = self.calculate_current_balance(current_cycle)
            current_cycle.status = CycleStatus.CLOSED
            current_cycle.end_date = datetime.utcnow()
            self.db.commit()
            
            new_cycle = Cycle(
                user_id=self.user_id,
                salary_amount=tx.amount,
                salary_credit_date=datetime.utcnow(),
                opening_balance=tx.amount,
                status=CycleStatus.ACTIVE
            )
            self.db.add(new_cycle)
            self.db.commit()
            
            if current_balance > 0:
                new_cycle.status = CycleStatus.CARRY_FORWARD_DECISION_PENDING
                self.db.commit()
                return f"Salary of ₹{tx.amount} credited. You have ₹{current_balance} remaining from last cycle. What would you like to do? (Carry forward, Move to savings, Invest, Reset)"
            elif current_balance < 0:
                return f"Salary of ₹{tx.amount} credited. You overspent ₹{abs(current_balance)} last cycle. Should this be deducted from the new salary? Or was it covered by credit/loan?"
            else:
                return f"Started a new cycle with salary ₹{tx.amount}."
        else:
            current_cycle.salary_amount = tx.amount
            current_cycle.salary_credit_date = datetime.utcnow()
            current_cycle.opening_balance = tx.amount
            self.db.commit()
            return f"Salary of ₹{tx.amount} recorded. New cycle started!"

    def handle_expense(self, tx: NLPTransaction, cycle: Cycle) -> str:
        if cycle.status == CycleStatus.CARRY_FORWARD_DECISION_PENDING:
            return "Please decide what to do with the remaining balance from the last cycle before adding new expenses (e.g., 'Carry forward')."
            
        current_balance = self.calculate_current_balance(cycle)
        
        # Check against category budget first
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
                    budget_msg = f" (Warning: You exceeded your {tx.category} budget by ₹{abs(remaining_budget)})"
                else:
                    budget_msg = f" (₹{remaining_budget} left in {tx.category} envelope)"

        # Parse LLM date or use now
        tx_date = datetime.strptime(tx.date, "%Y-%m-%dT%H:%M:%S") if tx.date else datetime.utcnow()

        if tx.amount <= current_balance:
            db_tx = Transaction(
                cycle_id=cycle.id,
                type=TransactionType.EXPENSE,
                category=tx.category,
                amount=tx.amount,
                date=tx_date,
                source=TransactionSource.MAIN_BALANCE,
                description=tx.intent,
                confidence_score=tx.confidence_score
            )
            cycle.total_expenses += tx.amount
            self.db.add(db_tx)
            self.db.commit()
            return f"Recorded expense of ₹{tx.amount} for {tx.category}. Remaining total balance: ₹{self.calculate_current_balance(cycle)}.{budget_msg}"
        else:
            missing_amount = tx.amount - current_balance
            cycle.status = CycleStatus.DEFICIT_PENDING_SOURCE
            
            if current_balance > 0:
                tx_main = Transaction(
                    cycle_id=cycle.id,
                    type=TransactionType.EXPENSE,
                    category=tx.category,
                    amount=current_balance,
                    date=tx_date,
                    source=TransactionSource.MAIN_BALANCE,
                    description=tx.intent + " (Partial main balance)",
                    confidence_score=tx.confidence_score
                )
                cycle.total_expenses += current_balance
                self.db.add(tx_main)
            self.db.commit()
            return f"Your balance is ₹{current_balance} but this expense is ₹{tx.amount}. Where is the remaining ₹{missing_amount} coming from? (Credit card, Borrowed, Savings, etc.){budget_msg}"

    def handle_allocation(self, tx: NLPTransaction, cycle: Cycle) -> str:
        if not tx.category:
            return "Please specify a category to allocate the budget to (e.g., 'allocate 5000 to food')."
            
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
                spent_amount=0.0
            )
            self.db.add(cat_budget)
            
        self.db.commit()
        remaining = cat_budget.allocated_amount - cat_budget.spent_amount
        return f"Allocated ₹{tx.amount} to your '{tx.category}' envelope! (Total available in this category: ₹{remaining})"

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
            confidence_score=tx.confidence_score
        )
        cycle.total_income_other_than_salary += tx.amount
        self.db.add(db_tx)
        self.db.commit()
        return f"Added additional income of ₹{tx.amount} from {tx.category}. New balance: ₹{self.calculate_current_balance(cycle)}."

    def handle_correction(self, tx: NLPTransaction, cycle: Cycle) -> str:
        if not tx.category:
            return "Please specify which expense category you are trying to correct."

        # Find the latest expense transaction for this category in the current cycle
        latest_tx = self.db.query(Transaction).filter(
            Transaction.cycle_id == cycle.id,
            Transaction.type == TransactionType.EXPENSE,
            Transaction.category.ilike(tx.category)
        ).order_by(Transaction.id.desc()).first()

        if not latest_tx:
            return f"I couldn't find any recent expense for '{tx.category}' to correct."

        old_amount = latest_tx.amount
        new_amount = tx.amount
        difference = new_amount - old_amount

        # Update the transaction record
        latest_tx.amount = new_amount
        latest_tx.description = f"{latest_tx.description} (Corrected from {old_amount})"
        latest_tx.date = datetime.utcnow()

        # Update cycle totals
        cycle.total_expenses += difference

        # Restore/Deduct from envelope budget if it exists
        from database import CategoryBudget
        cat_budget = self.db.query(CategoryBudget).filter(
            CategoryBudget.cycle_id == cycle.id, 
            CategoryBudget.category_name.ilike(tx.category)
        ).first()
        
        budget_msg = ""
        if cat_budget:
            cat_budget.spent_amount += difference
            remaining = cat_budget.allocated_amount - cat_budget.spent_amount
            budget_msg = f" (Envelope updated: ₹{remaining} left)"

        self.db.commit()
        
        return f"Correction applied: Changed the latest '{tx.category}' expense from ₹{old_amount} to ₹{new_amount}. Remaining balance is now ₹{self.calculate_current_balance(cycle)}.{budget_msg}"

    def handle_delete(self, tx: NLPTransaction, cycle: Cycle) -> str:
        query = self.db.query(Transaction).filter(Transaction.cycle_id == cycle.id)
        
        if tx.category:
            query = query.filter(Transaction.category.ilike(f"%{tx.category}%"))
        if tx.amount > 0:
            query = query.filter(Transaction.amount == tx.amount)
            
        latest_tx = query.order_by(Transaction.id.desc()).first()
        
        if not latest_tx:
            return "Could not find a matching transaction to delete."
            
        desc = f"'{latest_tx.category}' (₹{latest_tx.amount})"
        
        if latest_tx.type == TransactionType.EXPENSE:
            cycle.total_expenses -= latest_tx.amount
            from database import CategoryBudget
            if latest_tx.category:
                cat_budget = self.db.query(CategoryBudget).filter(
                    CategoryBudget.cycle_id == cycle.id, 
                    CategoryBudget.category_name.ilike(latest_tx.category)
                ).first()
                if cat_budget:
                    cat_budget.spent_amount -= latest_tx.amount
                    
        elif latest_tx.type == TransactionType.INCOME:
            cycle.total_income_other_than_salary -= latest_tx.amount
            
        self.db.delete(latest_tx)
        self.db.commit()
        
        return f"Successfully deleted the transaction for {desc}. Remaining balance is now ₹{self.calculate_current_balance(cycle)}."

    def handle_query(self, query: str, cycle: Cycle) -> str:
        bal = self.calculate_current_balance(cycle)
        from database import CategoryBudget
        budgets = self.db.query(CategoryBudget).filter(CategoryBudget.cycle_id == cycle.id).all()
        
        allocated_msg = ""
        total_unspent_allocated = 0.0
        for b in budgets:
            remaining = b.allocated_amount - b.spent_amount
            if remaining > 0:
                allocated_msg += f"\n- {b.category_name.capitalize()}: ₹{remaining}"
                total_unspent_allocated += remaining
                
        total_money = bal + total_unspent_allocated
        
        response = f"Here is your financial breakdown:\n- **Available Balance**: ₹{bal}"
        if allocated_msg:
            response += f"\n\n**Allocated Envelopes**:{allocated_msg}"
        response += f"\n\n**Total Money** (Available + Envelopes): ₹{total_money}"
        
        return response
