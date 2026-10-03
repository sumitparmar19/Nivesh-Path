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


class VectorService:
    """Thin wrapper around a Chroma collection keyed by user."""

    def __init__(self, settings: Settings, client: Any | None = None) -> None:
        self._client = client or _make_client(settings)
        self._collection = self._client.get_or_create_collection(
            name=COLLECTION_NAME,
            embedding_function=None,
            metadata={"hnsw:space": "cosine"},
        )

    def add_transactions(self, user_id: str, transactions: list[Transaction]) -> int:
        """Embed and upsert transactions; returns how many were stored."""
        docs = [transaction_to_document(user_id, tx) for tx in transactions]
        ids = [
            hashlib.sha1(f"{user_id}|{d.page_content}".encode()).hexdigest() for d in docs
        ]
        self._collection.upsert(
            ids=ids,
            documents=[d.page_content for d in docs],
            metadatas=[d.metadata for d in docs],
            embeddings=embed_texts([d.page_content for d in docs]),
        )
        return len(docs)

    def search(self, user_id: str, holdings: list[Holding], question: str | None, k: int = 6) -> list[Document]:
        """Return the user's past transactions most relevant to their holdings/question."""
        query = " ".join(h.symbol.upper() for h in holdings)
        if question:
            query = f"{question} {query}"
        try:
            result = self._collection.query(
                query_embeddings=embed_texts([query]),
                n_results=k,
                where={"user_id": user_id},
            )
        except Exception:  # an empty collection or a Chroma hiccup must not break analysis
            logger.exception("Vector search failed")
            return []
        documents = (result.get("documents") or [[]])[0]
        metadatas = (result.get("metadatas") or [[]])[0]
        return [Document(page_content=d, metadata=m or {}) for d, m in zip(documents, metadatas)]
