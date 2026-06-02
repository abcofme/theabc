from datetime import datetime, date
from typing import List, Optional

from sqlalchemy import (
    String, BigInteger, DateTime, func, Date,
    Boolean, Text, ForeignKey, Integer,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import Mapped, relationship
from sqlalchemy.orm import mapped_column

from backend.database.base import Base


class BaseModel(Base):
    __abstract__ = True

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, unique=True, autoincrement=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=func.now(), onupdate=func.now())


class User(BaseModel):
    __tablename__ = "users"

    tg_first_name: Mapped[str] = mapped_column(String(64), nullable=True)
    tg_last_name: Mapped[str] = mapped_column(String(64), nullable=True)
    username: Mapped[str] = mapped_column(String(32), nullable=True)
    registration_date: Mapped[date] = mapped_column(Date(), nullable=True)
    invited_id: Mapped[str] = mapped_column(String(64), nullable=True)
    discount_pct: Mapped[int] = mapped_column(Integer(), nullable=True, default=0)

    admin: Mapped[bool] = mapped_column(Boolean, nullable=True, default=False)
    banned: Mapped[bool] = mapped_column(Boolean, nullable=True, default=False)

    progresses: Mapped[List["Progress"]] = relationship(
        "Progress", back_populates="user",
        # lazy="selectin"
    )

    payments: Mapped[List["Payment"]] = relationship(
        "Payment", back_populates="user",
        # lazy="selectin"
    )


class Category(BaseModel):
    __tablename__ = "categories"

    name: Mapped[str] = mapped_column(String(100), nullable=False)
    price: Mapped[int] = mapped_column(BigInteger(), nullable=False)
    description: Mapped[str] = mapped_column(Text(), nullable=False)

    tests: Mapped[List["Test"]] = relationship(
        "Test", back_populates="category",
        cascade='all, delete-orphan'
        # lazy="selectin"
    )

    payments: Mapped[List["Payment"]] = relationship(
        "Payment", back_populates="category",
        # lazy="selectin"
    )


class Test(BaseModel):
    __tablename__ = "tests"

    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str] = mapped_column(Text(), nullable=True)
    free: Mapped[bool] = mapped_column(Boolean(), default=False)

    order_number: Mapped[int] = mapped_column(Integer(), nullable=True)

    hardcode_test: Mapped[str] = mapped_column(Text(), nullable=True)

    category_id: Mapped[int] = mapped_column(ForeignKey("categories.id", ondelete='CASCADE'))
    category: Mapped["Category"] = relationship(
        "Category", back_populates="tests",
        # lazy="joined"
    )

    questions: Mapped[List["Question"]] = relationship(
        "Question", back_populates="test",
        cascade='all, delete-orphan',
        order_by="Question.id"
        # lazy="selectin"
    )

    progresses: Mapped[List["Progress"]] = relationship(
        "Progress", back_populates="test",
        # lazy="selectin"
    )

    results: Mapped[List["Result"]] = relationship(
        "Result", back_populates="test",
        # lazy="selectin"
    )


class Question(BaseModel):
    __tablename__ = "questions"

    test_id: Mapped[int] = mapped_column(ForeignKey("tests.id", ondelete='CASCADE'))
    test: Mapped["Test"] = relationship(
        "Test", back_populates="questions",
        cascade='delete'
        # lazy="joined"
    )

    name: Mapped[str] = mapped_column(Text(), nullable=False)

    answers: Mapped[List["Answer"]] = relationship(
        "Answer", back_populates="question",
        cascade='all, delete-orphan'
        # lazy="selectin"
    )


class Answer(BaseModel):
    __tablename__ = "answers"

    question_id: Mapped[int] = mapped_column(ForeignKey("questions.id", ondelete='CASCADE'))
    question: Mapped["Question"] = relationship(
        "Question", back_populates="answers",
        # lazy="joined"
    )

    name: Mapped[str] = mapped_column(Text(), nullable=False)
    value: Mapped[int] = mapped_column(Integer(), nullable=False)

    hardcode_value: Mapped[int] = mapped_column(Integer(), nullable=True)


class Progress(BaseModel):
    __tablename__ = "progresses"

    test_id: Mapped[int] = mapped_column(ForeignKey("tests.id"))
    test: Mapped["Test"] = relationship(
        "Test", back_populates="progresses",
        # lazy="joined"
    )

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    user: Mapped["User"] = relationship(
        "User", back_populates="progresses",
        # lazy="joined"
    )

    value: Mapped[int] = mapped_column(Integer(), nullable=True)

    hardcode_value: Mapped[str] = mapped_column(Text(), nullable=True)


class Result(BaseModel):
    __tablename__ = "results"

    test_id: Mapped[int] = mapped_column(ForeignKey("tests.id"))
    test: Mapped["Test"] = relationship(
        "Test", back_populates="results",
        # lazy="joined"
    )

    range_from: Mapped[int] = mapped_column(Integer(), default=0)  # Inclusive
    range_to: Mapped[int] = mapped_column(Integer(), nullable=True)  # Not Inclusive

    name: Mapped[str] = mapped_column(Text(), nullable=True)


class Payment(BaseModel):
    __tablename__ = "payments"

    success: Mapped[bool] = mapped_column(Boolean, default=False)
    url: Mapped[str] = mapped_column(Text(), nullable=True)
    uuid: Mapped[str] = mapped_column(Text(), nullable=True)

    category_id: Mapped[Optional[int]] = mapped_column(ForeignKey("categories.id"))
    category: Mapped[Optional["Category"]] = relationship(
        "Category", back_populates="payments",
        # lazy="joined"
    )

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    user: Mapped["User"] = relationship(
        "User", back_populates="payments",
        # lazy="joined"
    )


class Mailing(BaseModel):
    __tablename__ = "mailings"

    chat_id: Mapped[str] = mapped_column(String(20))
    message_ids: Mapped[list[str]] = mapped_column(ARRAY(String), default=[])

    was_notified: Mapped[bool] = mapped_column(Boolean(), default=False, nullable=False)
    was_stopped: Mapped[bool] = mapped_column(Boolean(), default=False, nullable=True)
    was_deleted: Mapped[bool] = mapped_column(Boolean(), default=False, nullable=True)

    scheduled_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    completed_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)

    sent: Mapped[list] = mapped_column(JSONB(), default=[])

    user_id: Mapped[int] = mapped_column(BigInteger(), nullable=True)


class DiaryEntry(BaseModel):
    __tablename__ = "diary_entries"

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    user: Mapped["User"] = relationship("User")

    date: Mapped[date] = mapped_column(Date(), nullable=False)
    event: Mapped[str] = mapped_column(Text(), nullable=False)
    reaction: Mapped[str] = mapped_column(Text(), nullable=False)
    rating: Mapped[int] = mapped_column(Integer(), nullable=True)
    portrait_match_score: Mapped[int] = mapped_column(Integer(), nullable=True)

class PersonalityPortrait(BaseModel):
    __tablename__ = "personality_portraits"

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    user: Mapped["User"] = relationship("User")
    
    content: Mapped[str] = mapped_column(Text(), nullable=False)
    tests_count: Mapped[int] = mapped_column(Integer(), default=0)