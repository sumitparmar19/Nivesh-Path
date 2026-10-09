"""Claude-powered portfolio advisor.

LangChain (`ChatPromptTemplate`) builds the prompt from metrics + retrieved history;
the official Anthropic SDK makes the call and validates the reply against the
`AIInsight` schema with structured outputs.
"""

from __future__ import annotations

import json
import logging

import anthropic
from langchain_core.messages import SystemMessage
from langchain_core.prompts import ChatPromptTemplate

from config import Settings
from schemas import AIInsight, BehaviorCoaching, BehaviorRequest, PortfolioMetrics
from services.behavior_coach import facts_block

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are Nivesh-Path's portfolio analyst. You explain a retail investor's \
US-equity portfolio in plain, encouraging language.

Ground every statement in the metrics and transaction history you are given; the \
numbers are already computed, so do not recalculate them. Position weights (`weight_pct`) \
are shares of the WHOLE account, cash included; `invested_weight_pct` is the share of the \
money invested in stocks only - if you mention it, say so explicitly. A large cash share is \
the investor's choice, not a risk. Judge concentration only with `concentration_level`, \
which is already computed from the largest stock's share of the account (over 35% low, \
50% medium, 65% high; "none" means not concentrated). Set `diversification_score` to the \
given value. Tailor recommendations to the stated risk profile, keep them specific (name \
the symbol), and give at most five. If the user asked a question, answer it in `answer`.

This is a paper-trading account with virtual money: no taxes, fees or real money are involved, so never \
mention tax consequences, tax-loss harvesting or trading costs.

This is educational content, not personalised financial advice; never promise returns."""

HUMAN_PROMPT = """Risk profile: {risk_profile}

Portfolio metrics (JSON):
{metrics_json}

Relevant past transactions:
{history}

User question: {question}"""

PROMPT = ChatPromptTemplate.from_messages([("system", SYSTEM_PROMPT), ("human", HUMAN_PROMPT)])

BEHAVIOR_SYSTEM_PROMPT = """You are Nivesh-Path's behavioral finance coach. Retail investors lose money mostly \
through habits such as panic selling, FOMO buying and putting too much into one stock. You help one investor \
see their own habits, using evidence from their own paper trades.

Use only the facts given; every number is already computed, so never recalculate or invent figures. Speak \
to the investor in second person ("You tend to..."), cite at least one of their trades by symbol, and be \
honest but kind. If there are no concerning patterns, say so briefly. The suggestion must be one concrete \
habit for their next trade. This is educational content, not financial advice; never promise returns.

This is a paper-trading account with virtual money: no taxes, fees or real money are involved, so never \
mention tax consequences, tax-loss harvesting or trading costs."""

BEHAVIOR_HUMAN_PROMPT = """The investor's trading behavior:
{facts}"""

BEHAVIOR_PROMPT = ChatPromptTemplate.from_messages([("system", BEHAVIOR_SYSTEM_PROMPT), ("human", BEHAVIOR_HUMAN_PROMPT)])


class LLMUnavailableError(RuntimeError):
    """Raised when Claude cannot produce an insight; callers fall back to rules."""


class LLMService:
    """Generates `AIInsight`s with Claude."""

    def __init__(self, settings: Settings, client: anthropic.Anthropic | None = None) -> None:
        self.model = settings.claude_model
        self.effort = settings.claude_effort
        if client is not None:
            self._client: anthropic.Anthropic | None = client
        elif settings.anthropic_api_key:
            self._client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
        else:
            self._client = None

    @property
    def available(self) -> bool:
        """True when an Anthropic client is configured."""
        return self._client is not None

    def generate_insight(
        self,
        metrics: PortfolioMetrics,
        history: list[str],
        risk_profile: str,
        question: str | None,
    ) -> tuple[AIInsight, str]:
        """Return (insight, model that served it); raises LLMUnavailableError on any failure."""
        if self._client is None:
            raise LLMUnavailableError("ANTHROPIC_API_KEY is not configured")

        messages = PROMPT.format_messages(
            risk_profile=risk_profile,
            metrics_json=json.dumps(metrics.model_dump(), indent=2),
            history="\n".join(f"- {line}" for line in history) or "- (no history yet)",
            question=question or "(none)",
        )
        return self._parse(messages, AIInsight)

    def generate_behavior_coaching(self, req: BehaviorRequest) -> tuple[BehaviorCoaching, str]:
        """Return (coaching, model) for the Behavioral Mirror; raises LLMUnavailableError on any failure."""
        if self._client is None:
            raise LLMUnavailableError("ANTHROPIC_API_KEY is not configured")
        return self._parse(BEHAVIOR_PROMPT.format_messages(facts=facts_block(req)), BehaviorCoaching)

    def _parse(self, messages: list, output_format: type) -> tuple:
        """Send the LangChain-built messages to Claude and validate the reply against `output_format`."""
        assert self._client is not None
        system = next(str(m.content) for m in messages if isinstance(m, SystemMessage))
        user = next(str(m.content) for m in messages if not isinstance(m, SystemMessage))

        try:
            response = self._client.beta.messages.parse(
                model=self.model,
                max_tokens=16000,
                system=system,
                messages=[{"role": "user", "content": user}],
                output_format=output_format,
                output_config={"effort": self.effort},
                # Re-run on Anthropic's recommended model if a safety classifier declines.
                betas=["server-side-fallback-2026-07-01"],
                fallbacks="default",
            )
        except anthropic.RateLimitError as exc:
            raise LLMUnavailableError("Claude rate limit reached") from exc
        except anthropic.APIStatusError as exc:
            raise LLMUnavailableError(f"Claude API error {exc.status_code}") from exc
        except anthropic.APIConnectionError as exc:
            raise LLMUnavailableError("Could not reach the Claude API") from exc

        if response.stop_reason == "refusal":
            raise LLMUnavailableError("Claude declined to answer")
        if response.parsed_output is None:
            raise LLMUnavailableError(f"No structured output (stop_reason={response.stop_reason})")
        # `response.model` names the fallback model if one stepped in.
        return response.parsed_output, response.model or self.model
