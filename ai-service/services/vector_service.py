"""ChromaDB-backed store of user transaction history, used for RAG retrieval.

Embeddings are computed locally with a feature-hashing vectorizer, so the service
needs no model download and no extra API key. Swap `embed_texts` for a hosted
embedding model later if you want semantic (not just lexical) similarity.
"""

from __future__ import annotations

import hashlib
import logging
import math
import re
from typing import Any

import chromadb
from langchain_core.documents import Document

from config import Settings
from schemas import Holding, Transaction

logger = logging.getLogger(__name__)

EMBEDDING_DIM = 384
COLLECTION_NAME = "transactions"
_TOKEN_RE = re.compile(r"[a-z0-9]+")


def embed_texts(texts: list[str]) -> list[list[float]]:
    """Hash unigrams and bigrams into a fixed-size, L2-normalised vector."""
    vectors: list[list[float]] = []
    for text in texts:
        tokens = _TOKEN_RE.findall(text.lower())
        features = tokens + [f"{a}_{b}" for a, b in zip(tokens, tokens[1:])]
        vec = [0.0] * EMBEDDING_DIM
        for feat in features:
            digest = hashlib.md5(feat.encode()).digest()
            index = int.from_bytes(digest[:4], "little") % EMBEDDING_DIM
            vec[index] += 1.0 if digest[4] & 1 else -1.0
        norm = math.sqrt(sum(v * v for v in vec)) or 1.0
        vectors.append([v / norm for v in vec])
    return vectors


def transaction_to_document(user_id: str, tx: Transaction) -> Document:
    """Render a transaction as a LangChain Document with searchable text."""
    when = tx.timestamp.date().isoformat() if tx.timestamp else "unknown date"
    text = (
        f"{tx.transaction_type.upper()} {tx.quantity:g} shares of {tx.symbol.upper()} "
        f"at ${tx.price:,.2f} (total ${tx.quantity * tx.price:,.2f}) on {when}"
    )
    return Document(
        page_content=text,
        metadata={
            "user_id": user_id,
            "symbol": tx.symbol.upper(),
            "transaction_type": tx.transaction_type,
        },
    )


def _make_client(settings: Settings) -> Any:
    """Pick a Chroma client: remote server, on-disk, or in-memory."""
    if settings.chroma_host:
        return chromadb.HttpClient(host=settings.chroma_host, port=settings.chroma_port)
    if settings.chroma_persist_dir:
        return chromadb.PersistentClient(path=settings.chroma_persist_dir)
    return chromadb.EphemeralClient()


_SAFE_ID = re.compile(r"[^A-Za-z0-9_-]")


def collection_name_for(user_id: str) -> str:
    """Each user gets their own Chroma collection, so one user's trades can never be retrieved for another."""
    safe = _SAFE_ID.sub("_", user_id or "anonymous")[:48] or "anonymous"
    return f"{COLLECTION_NAME}_user_{safe}"


class VectorService:
    """Per-user trade journal stored in Chroma (one collection per user)."""

    def __init__(self, settings: Settings, client: Any | None = None) -> None:
        self._client = client or _make_client(settings)

    def _collection(self, user_id: str, create: bool) -> Any | None:
        name = collection_name_for(user_id)
        if create:
            return self._client.get_or_create_collection(
                name=name, embedding_function=None, metadata={"hnsw:space": "cosine"}
            )
        try:
            return self._client.get_collection(name=name, embedding_function=None)
        except Exception:  # no trades stored for this user yet
            return None

    def add_transactions(self, user_id: str, transactions: list[Transaction]) -> int:
        """Embed and upsert transactions into the user's collection; returns how many were stored."""
        docs = [transaction_to_document(user_id, tx) for tx in transactions]
        ids = [
            hashlib.sha1(
                f"{user_id}|{tx.symbol}|{tx.transaction_type}|{tx.quantity}|{tx.price}|"
                f"{tx.timestamp.isoformat() if tx.timestamp else d.page_content}".encode()
            ).hexdigest()
            for tx, d in zip(transactions, docs)
        ]
        self._collection(user_id, create=True).upsert(
            ids=ids,
            documents=[d.page_content for d in docs],
            metadatas=[d.metadata for d in docs],
            embeddings=embed_texts([d.page_content for d in docs]),
        )
        return len(docs)

    def count(self, user_id: str) -> int:
        """How many trades are embedded for the user (0 when the collection is missing or unreadable)."""
        collection = self._collection(user_id, create=False)
        try:
            return collection.count() if collection is not None else 0
        except Exception:
            logger.exception("Could not count vectors for user")
            return 0

    def has_history(self, user_id: str) -> bool:
        """True when the user's collection exists and holds at least one trade."""
        return self.count(user_id) > 0

    def delete_user(self, user_id: str) -> bool:
        """Forget one user's trades (account reset or deletion); returns False if there was nothing to delete."""
        try:
            self._client.delete_collection(collection_name_for(user_id))
            return True
        except Exception:  # collection did not exist
            return False

    def clear(self) -> None:
        """Drop every per-user collection (used to simulate a cold start in tests)."""
        prefix = f"{COLLECTION_NAME}_user_"
        for collection in self._client.list_collections():
            name = getattr(collection, "name", collection)
            if str(name).startswith(prefix):
                self._client.delete_collection(name)

    def search(self, user_id: str, holdings: list[Holding], question: str | None, k: int = 6) -> list[Document]:
        """Return the user's own past transactions most relevant to their holdings/question."""
        collection = self._collection(user_id, create=False)
        if collection is None:
            return []
        query = " ".join(h.symbol.upper() for h in holdings)
        if question:
            query = f"{question} {query}"
        try:
            count = collection.count()
            if count == 0:
                return []
            result = collection.query(query_embeddings=embed_texts([query]), n_results=min(k, count))
        except Exception:  # a Chroma hiccup must not break analysis
            logger.exception("Vector search failed")
            return []
        documents = (result.get("documents") or [[]])[0]
        metadatas = (result.get("metadatas") or [[]])[0]
        return [Document(page_content=d, metadata=m or {}) for d, m in zip(documents, metadatas)]
