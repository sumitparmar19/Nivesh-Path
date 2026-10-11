"""Trade history read from the Node web service's internal API (Phase 3).

The money ledger moves from MongoDB to Postgres, which only the Node service talks to. So instead of reading
the `purchases` collection directly, the AI service asks Node for each user's trades
(`GET /internal/trades/users`, `GET /internal/trades?userId=`), authenticated with the shared
AI_INTERNAL_TOKEN. The answer is the same whichever store holds the trades. `TradeSource` is the small
interface both this class and the MongoDB `TradeStore` implement.
"""

from __future__ import annotations

import logging
import re
import time
from collections.abc import Callable, Iterator
from typing import Any, Protocol

import httpx

from schemas import Transaction

logger = logging.getLogger(__name__)

OBJECT_ID_RE = re.compile(r"^[0-9a-f]{24}$")
# On a deploy both services start together: give the web service up to about a minute to come up.
BOOT_RETRY_DELAYS = (2.0, 4.0, 8.0, 16.0, 30.0)


class TradeSource(Protocol):
    """Where the AI service reads trade history from (Node's internal API, or MongoDB directly)."""

    def transactions_for(self, user_id: str) -> list[Transaction]:
        """All of one user's trades, oldest first."""
        ...

    def transactions_by_user(self) -> Iterator[tuple[str, list[Transaction]]]:
        """Yield (user_id, trades) for every user that has trades."""
        ...


def _to_transaction(row: dict[str, Any]) -> Transaction | None:
    """Convert one trade from the internal API; returns None for a malformed row."""
    try:
        return Transaction(
            symbol=str(row["symbol"]).upper(),
            quantity=float(row["quantity"]),
            price=float(row["price"]),
            transaction_type="sell" if row.get("transaction_type") == "sell" else "buy",
            timestamp=row.get("timestamp"),
        )
    except (KeyError, TypeError, ValueError) as exc:
        logger.warning("Skipping malformed trade %s: %s", row.get("id"), exc)
        return None


class HttpTradeStore:
    """Reads trades through the Node service's token-protected /internal API."""

    def __init__(
        self,
        base_url: str,
        token: str,
        client: httpx.Client | None = None,
        timeout: float = 15.0,
        retry_delays: tuple[float, ...] = BOOT_RETRY_DELAYS,
        sleep: Callable[[float], None] = time.sleep,
    ) -> None:
        self._base = base_url.rstrip("/")
        self._headers = {"X-Internal-Token": token, "Accept": "application/json"}
        self._client = client or httpx.Client(timeout=timeout)
        self._retry_delays = retry_delays
        self._sleep = sleep

    def _get(self, path: str, params: dict[str, str] | None = None) -> dict[str, Any]:
        response = self._client.get(f"{self._base}{path}", params=params, headers=self._headers)
        response.raise_for_status()  # 404 here means the token is missing/wrong on one side
        data: dict[str, Any] = response.json()
        return data

    def transactions_for(self, user_id: str) -> list[Transaction]:
        """All of one user's trades, oldest first ([] for ids that can't be a user, e.g. "anonymous")."""
        if not OBJECT_ID_RE.match(user_id):
            return []
        rows = self._get("/internal/trades", {"userId": user_id}).get("trades", [])
        return [tx for row in rows if (tx := _to_transaction(row)) is not None]

    def _list_users(self) -> list[str]:
        """User ids with trades; retries while the web service is still starting (connection error or 5xx)."""
        for attempt, delay in enumerate((*self._retry_delays, None)):
            try:
                return [str(u) for u in self._get("/internal/trades/users").get("users", [])]
            except (httpx.TransportError, httpx.HTTPStatusError) as exc:
                retryable = isinstance(exc, httpx.TransportError) or exc.response.status_code >= 500
                if delay is None or not retryable:
                    if isinstance(exc, httpx.HTTPStatusError) and exc.response.status_code == 404:
                        logger.error("Web /internal API answered 404: AI_INTERNAL_TOKEN must be the same on both services")
                    raise
                logger.info("Web service not ready (attempt %d): %s; retrying in %.0fs", attempt + 1, exc, delay)
                self._sleep(delay)
        return []  # unreachable; keeps type checkers happy

    def transactions_by_user(self) -> Iterator[tuple[str, list[Transaction]]]:
        """Yield (user_id, trades) for every user that has trades, one request per user."""
        for user_id in self._list_users():
            transactions = self.transactions_for(user_id)
            if transactions:
                yield user_id, transactions
