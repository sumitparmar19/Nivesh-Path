"""MongoDB access for the AI service: the durable source of truth that survives redeploys.

DigitalOcean App Platform wipes the container filesystem on every deploy, so ChromaDB is
treated as a rebuildable cache. Trades are read from the `purchases` collection that the
Node backend writes, and behavioral-pattern results (panic sells, FOMO buys, holding periods)
are stored as structured documents in `behavioral_patterns`, so nothing important lives only
in Chroma.
"""

from __future__ import annotations

import logging
from collections.abc import Iterator
from datetime import datetime, timezone
from typing import Any

from bson import ObjectId
from pymongo import ASCENDING, DESCENDING, MongoClient
from pymongo.database import Database

from config import Settings
from schemas import Transaction

logger = logging.getLogger(__name__)

TRADES_COLLECTION = "purchases"  # written by the Node backend (Mongoose model "Purchase")
PATTERNS_COLLECTION = "behavioral_patterns"


def connect(settings: Settings) -> Database | None:
    """Open the shared MongoDB database, or return None when MONGO_URL is not configured."""
    if not settings.mongo_url:
        return None
    client: MongoClient = MongoClient(settings.mongo_url, serverSelectionTimeoutMS=5000, tz_aware=True)
    if settings.mongo_db_name:
        return client[settings.mongo_db_name]
    # Mongoose uses the database named in the URI path, or "test" when there is none.
    return client.get_default_database(default="test")


def _user_filter(user_id: str) -> dict[str, Any]:
    """Match a userId stored as an ObjectId (Mongoose) or as a plain string."""
    if ObjectId.is_valid(user_id):
        return {"userId": {"$in": [ObjectId(user_id), user_id]}}
    return {"userId": user_id}


def document_to_transaction(doc: dict[str, Any]) -> Transaction | None:
    """Convert a `purchases` document to a Transaction; returns None for malformed rows."""
    try:
        tx_type = str(doc.get("transactionType") or "buy").lower()
        return Transaction(
            symbol=str(doc["name"]).upper(),
            quantity=float(doc["quantity"]),
            price=float(doc["price"]),
            transaction_type="sell" if tx_type == "sell" else "buy",
            timestamp=doc.get("timestamp"),
        )
    except (KeyError, TypeError, ValueError) as exc:
        logger.warning("Skipping malformed trade %s: %s", doc.get("_id"), exc)
        return None


class TradeStore:
    """Read-only view over the trades the Node backend stores in MongoDB."""

    def __init__(self, db: Database) -> None:
        self._trades = db[TRADES_COLLECTION]

    def transactions_for(self, user_id: str) -> list[Transaction]:
        """All of one user's trades, oldest first."""
        cursor = self._trades.find(_user_filter(user_id)).sort("timestamp", ASCENDING)
        return [tx for doc in cursor if (tx := document_to_transaction(doc)) is not None]

    def transactions_by_user(self) -> Iterator[tuple[str, list[Transaction]]]:
        """Yield (user_id, trades) for every user that has trades; legacy rows without a userId are skipped."""
        cursor = self._trades.find({"userId": {"$exists": True, "$ne": None}}).sort(
            [("userId", ASCENDING), ("timestamp", ASCENDING)]
        )
        current: str | None = None
        batch: list[Transaction] = []
        for doc in cursor:
            user_id = str(doc["userId"])
            if user_id != current:
                if current is not None and batch:
                    yield current, batch
                current, batch = user_id, []
            tx = document_to_transaction(doc)
            if tx is not None:
                batch.append(tx)
        if current is not None and batch:
            yield current, batch


class PatternStore:
    """Durable store for behavioral-pattern results, one document per (user, pattern type)."""

    def __init__(self, db: Database) -> None:
        self._patterns = db[PATTERNS_COLLECTION]

    def ensure_indexes(self) -> None:
        """Create the lookup indexes (idempotent)."""
        self._patterns.create_index([("user_id", ASCENDING), ("pattern_type", ASCENDING)], unique=True)
        self._patterns.create_index([("user_id", ASCENDING), ("updated_at", DESCENDING)])

    def upsert(self, user_id: str, pattern_type: str, result: dict[str, Any]) -> None:
        """Save the latest result of one detector (e.g. "panic_sell") for a user."""
        self._patterns.update_one(
            {"user_id": user_id, "pattern_type": pattern_type},
            {"$set": {"result": result, "updated_at": datetime.now(timezone.utc)}},
            upsert=True,
        )

    def for_user(self, user_id: str) -> list[dict[str, Any]]:
        """All stored pattern results for a user, newest first (without Mongo's _id)."""
        cursor = self._patterns.find({"user_id": user_id}, {"_id": False}).sort("updated_at", DESCENDING)
        return list(cursor)
