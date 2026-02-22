from datetime import datetime
from enum import Enum
from typing import List, Optional
from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Enum as SQLEnum, Boolean, Text, create_engine
from sqlalchemy.orm import declarative_base, relationship, sessionmaker

Base = declarative_base()

class CycleStatus(str, Enum):
    ACTIVE = "ACTIVE"
    DEFICIT_PENDING_SOURCE = "DEFICIT_PENDING_SOURCE"
    CARRY_FORWARD_DECISION_PENDING = "CARRY_FORWARD_DECISION_PENDING"
    CLOSED = "CLOSED"

class TransactionType(str, Enum):
    INCOME = "INCOME"
    EXPENSE = "EXPENSE"
    SALARY = "SALARY"
    CORRECTION = "CORRECTION"
    ALLOCATE_BUDGET = "ALLOCATE_BUDGET"
    DELETE = "DELETE"
    DELETE_BUDGET = "DELETE_BUDGET"

class TransactionSource(str, Enum):
    MAIN_BALANCE = "MAIN_BALANCE"
    CREDIT_CARD = "CREDIT_CARD"
    BORROWED = "BORROWED"
    SAVINGS = "SAVINGS"
    FAMILY_SUPPORT = "FAMILY_SUPPORT"
    LOAN = "LOAN"
    OTHER_INCOME = "OTHER_INCOME"

class ReminderType(str, Enum):
    LOAN = "LOAN"
    BILL = "BILL"
    SUBSCRIPTION = "SUBSCRIPTION"
    CUSTOM = "CUSTOM"

class User(Base):
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True)
    username = Column(String, unique=True, nullable=False, index=True)
    password_hash = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    cycles = relationship("Cycle", back_populates="user")
    reminders = relationship("Reminder", back_populates="user")

class Cycle(Base):
    __tablename__ = "cycles"
    
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    start_date = Column(DateTime, default=datetime.utcnow)
    end_date = Column(DateTime, nullable=True)
    
    salary_amount = Column(Float, default=0.0)
    salary_credit_date = Column(DateTime, nullable=True)
    opening_balance = Column(Float, default=0.0)
    carry_forward_amount = Column(Float, default=0.0)
    
    # Aggregates updated during cycle
    total_expenses = Column(Float, default=0.0)
    total_income_other_than_salary = Column(Float, default=0.0)
    
    # Separate Buckets
    savings_balance = Column(Float, default=0.0)
    investment_balance = Column(Float, default=0.0)
    credit_card_due = Column(Float, default=0.0)
    borrowed_amount = Column(Float, default=0.0)
    
    status = Column(SQLEnum(CycleStatus), default=CycleStatus.ACTIVE)
    
    user = relationship("User", back_populates="cycles")
    transactions = relationship("Transaction", back_populates="cycle")
    budgets = relationship("CategoryBudget", back_populates="cycle")

class CategoryBudget(Base):
    __tablename__ = "category_budgets"
    
    id = Column(Integer, primary_key=True)
    cycle_id = Column(Integer, ForeignKey("cycles.id"))
    category_name = Column(String, nullable=False)
    allocated_amount = Column(Float, default=0.0)
    spent_amount = Column(Float, default=0.0)
    
    cycle = relationship("Cycle", back_populates="budgets")


class Transaction(Base):
    __tablename__ = "transactions"
    
    id = Column(Integer, primary_key=True)
    cycle_id = Column(Integer, ForeignKey("cycles.id"))
    
    type = Column(SQLEnum(TransactionType), nullable=False)
    category = Column(String, nullable=True)
    amount = Column(Float, nullable=False)
    date = Column(DateTime, default=datetime.utcnow)
    source = Column(SQLEnum(TransactionSource), default=TransactionSource.MAIN_BALANCE)
    
    description = Column(String, nullable=True)
    confidence_score = Column(Float, nullable=True)
    
    cycle = relationship("Cycle", back_populates="transactions")

class Reminder(Base):
    __tablename__ = "reminders"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    title = Column(String, nullable=False)
    amount = Column(Float, default=0.0)
    due_date = Column(DateTime, nullable=True)
    type = Column(SQLEnum(ReminderType), default=ReminderType.CUSTOM)
    is_paid = Column(Boolean, default=False)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="reminders")

# Database initialization
import os
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///expense_tracker.db")

# Railway provides postgres:// but SQLAlchemy needs postgresql://
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, connect_args=connect_args, echo=False)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def init_db():
    Base.metadata.create_all(bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
