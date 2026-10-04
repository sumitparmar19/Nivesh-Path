"""Cold-start rebuild of the ChromaDB RAG index from MongoDB.

ChromaDB lives on the container filesystem, which DigitalOcean wipes on every deploy. MongoDB
Atlas is external and durable, so at boot we re-embed every user's trades from the `purchases`
collection. main.py runs this once in a background thread; it can also be run by hand:

    python startup.py
"""

from __future__ import annotations

import logging
import time
from dataclasses import asdict, dataclass, field

from services.mongo_store import TradeStore
from services.vector_service import VectorService

logger = logging.getLogger("ai-service.startup")

BATCH_SIZE = 500


@dataclass
class RebuildReport:
    """Outcome of one rebuild, exposed on /health so deploy problems are visible."""

    status: str = "pending"  # pending | running | ok | failed | disabled
    users: int = 0
    transactions: int = 0
    seconds: float = 0.0
    error: str | None = None
    failed_users: list[str] = field(default_factory=list)

    def as_dict(self) -> dict[str, object]:
        return asdict(self)


def rebuild_user(vectors: VectorService, trades: TradeStore, user_id: str) -> int:
    """Re-index one user's trades from MongoDB; returns how many were embedded."""
    transactions = trades.transactions_for(user_id)
    for start in range(0, len(transactions), BATCH_SIZE):
        vectors.add_transactions(user_id, transactions[start : start + BATCH_SIZE])
    return len(transactions)


def rebuild_vector_index(
    vectors: VectorService, trades: TradeStore | None, report: RebuildReport | None = None
) -> RebuildReport:
    """Re-populate every user's Chroma collection from MongoDB.

    Upserts use deterministic ids, so running this twice (or alongside live ingests) never
    duplicates trades. One user's failure is logged and skipped; it never aborts the rest.
    """
    report = report or RebuildReport()
    if trades is None:
        report.status = "disabled"
        logger.info("MONGO_URL not set; skipping ChromaDB rebuild")
        return report

    report.status = "running"
    started = time.monotonic()
    try:
        for user_id, transactions in trades.transactions_by_user():
            try:
                for start in range(0, len(transactions), BATCH_SIZE):
                    vectors.add_transactions(user_id, transactions[start : start + BATCH_SIZE])
                report.users += 1
                report.transactions += len(transactions)
            except Exception:
                logger.exception("Rebuild failed for one user")
                report.failed_users.append(user_id)
        report.status = "ok"
    except Exception as exc:  # MongoDB unreachable etc. - the service still runs, just without history
        logger.exception("ChromaDB rebuild from MongoDB failed")
        report.status, report.error = "failed", type(exc).__name__
    report.seconds = round(time.monotonic() - started, 3)
    logger.info(
        "ChromaDB rebuild %s: %d users, %d trades in %.2fs",
        report.status, report.users, report.transactions, report.seconds,
    )
    return report


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    from config import get_settings
    from services.mongo_store import connect

    settings = get_settings()
    db = connect(settings)
    result = rebuild_vector_index(VectorService(settings), TradeStore(db) if db is not None else None)
    print(result.as_dict())
    raise SystemExit(0 if result.status in ("ok", "disabled") else 1)
