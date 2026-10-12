"""Cold-start rebuild of the ChromaDB RAG index from the durable trade history.

ChromaDB lives on the container filesystem, which DigitalOcean wipes on every deploy. The trades are
durable elsewhere, so at boot we re-embed every user's trades: through the Node web service's /internal API
when WEB_INTERNAL_URL is set (it reads whichever ledger holds the money, MongoDB or Postgres), else from the
`purchases` collection in MongoDB directly. main.py runs this once in a background thread; it can also be run
by hand:

    python startup.py
"""

from __future__ import annotations

import logging
import time
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone

from services.mongo_store import TradeStore
from services.web_trades import TradeSource
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
    finished_at: str | None = None  # ISO 8601 UTC; the counts are from this moment (start-up), not live
    error: str | None = None
    failed_users: list[str] = field(default_factory=list)

    def as_dict(self) -> dict[str, object]:
        return asdict(self)


def rebuild_user(vectors: VectorService, trades: TradeSource, user_id: str) -> int:
    """Re-index one user's trades from the trade source; returns how many were embedded."""
    transactions = trades.transactions_for(user_id)
    for start in range(0, len(transactions), BATCH_SIZE):
        vectors.add_transactions(user_id, transactions[start : start + BATCH_SIZE])
    return len(transactions)


def rebuild_vector_index(
    vectors: VectorService, trades: TradeSource | None, report: RebuildReport | None = None
) -> RebuildReport:
    """Re-populate every user's Chroma collection from MongoDB.

    Upserts use deterministic ids, so running this twice (or alongside live ingests) never
    duplicates trades. One user's failure is logged and skipped; it never aborts the rest.
    """
    report = report or RebuildReport()
    if trades is None:
        report.status = "disabled"
        logger.info("No trade source (WEB_INTERNAL_URL or MONGO_URL) configured; skipping ChromaDB rebuild")
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
    report.finished_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
    logger.info(
        "ChromaDB rebuild %s: %d users, %d trades in %.2fs",
        report.status, report.users, report.transactions, report.seconds,
    )
    return report


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    from config import get_settings
    from services.mongo_store import connect

    from services.web_trades import HttpTradeStore

    settings = get_settings()
    source: TradeSource | None
    if settings.web_internal_url and settings.ai_internal_token:
        source = HttpTradeStore(settings.web_internal_url, settings.ai_internal_token)
    else:
        db = connect(settings)
        source = TradeStore(db) if db is not None else None
    result = rebuild_vector_index(VectorService(settings), source)
    print(result.as_dict())
    raise SystemExit(0 if result.status in ("ok", "disabled") else 1)
