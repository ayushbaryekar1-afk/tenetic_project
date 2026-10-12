"""Demo mode: realistic mock answers so the whole app works before Databricks is configured."""
import asyncio
import random

from models.chat import AgentReply

_RULES = [
    (
        ("total sales", "total revenue", "sales total"),
        "Sales Genie",
        "Based on the connected data, the total sales are **₹24.6 Cr**.\n\n"
        "Want me to break this down by region, product line, or month?",
    ),
    (
        ("region", "regional", "underperform"),
        "Sales Genie",
        "Here is a sample regional breakdown (demo data):\n\n"
        "| Region | Sales | Share |\n|---|---|---|\n"
        "| West | ₹8.9 Cr | 36% |\n| South | ₹6.8 Cr | 28% |\n"
        "| North | ₹5.4 Cr | 22% |\n| East | ₹3.5 Cr | 14% |\n\n"
        "East has the smallest share of sales.",
    ),
    (
        ("trend", "monthly", "month"),
        "Finance Genie",
        "Monthly revenue has grown steadily across the last four quarters in this demo dataset, "
        "with the largest jump in the most recent quarter.\n\n"
        "In live mode this answer comes from your Databricks tables.",
    ),
    (
        ("customer", "client"),
        "Customer Genie",
        "Top customers (demo data):\n\n"
        "1. Northwind Traders\n2. Contoso Retail\n3. Fabrikam Industries\n\n"
        "I can also show retention or churn if you'd like.",
    ),
    (
        ("inventory", "stock"),
        "Inventory Genie",
        "Inventory levels look healthy overall in this demo dataset. "
        "Three SKUs are below their reorder threshold and flagged for review.",
    ),
]

_GREETING = (
    "Hello! I'm the Tenetic AI assistant. Ask me about sales, customers, inventory, "
    "or finance and I'll route the question to the right Genie agent."
)


async def generate_demo_response(message: str) -> AgentReply:
    await asyncio.sleep(random.uniform(0.6, 1.4))  # feel like a real round trip
    text = message.lower()

    for keywords, agent, answer in _RULES:
        if any(k in text for k in keywords):
            return AgentReply(text=answer, agent=f"{agent} (demo)")

    if text.strip() in {"hi", "hello", "hey"} or "help" in text:
        return AgentReply(text=_GREETING, agent="Super Agent (demo)")

    snippet = message if len(message) <= 160 else message[:157] + "..."
    return AgentReply(
        text=(
            f"This is a demo response to: *\"{snippet}\"*\n\n"
            "Demo mode is on, so no Databricks call was made. "
            "Set `DEMO_MODE=false` in your `.env` to query your real Super Agent."
        ),
        agent="Super Agent (demo)",
    )
