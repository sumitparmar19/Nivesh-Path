// Turns a list of buy/sell transactions into current holdings with average cost.

function buildHoldings(transactions) {
  const bySymbol = new Map();
  const ordered = [...transactions].sort(
    (a, b) => new Date(a.timestamp || a.createdAt || 0) - new Date(b.timestamp || b.createdAt || 0)
  );

  for (const tx of ordered) {
    const symbol = String(tx.name || tx.symbol || "").toUpperCase();
    const qty = Number(tx.quantity);
    const price = Number(tx.price);
    if (!symbol || !(qty > 0) || !(price > 0)) continue;

    const pos = bySymbol.get(symbol) || { symbol, quantity: 0, cost: 0 };
    if (tx.transactionType === "sell") {
      const sold = Math.min(qty, pos.quantity);
      const avg = pos.quantity ? pos.cost / pos.quantity : 0;
      pos.quantity -= sold;
      pos.cost -= sold * avg;
    } else {
      pos.quantity += qty;
      pos.cost += qty * price;
    }
    bySymbol.set(symbol, pos);
  }

  return [...bySymbol.values()]
    .filter((p) => p.quantity > 1e-9)
    .map((p) => ({
      symbol: p.symbol,
      quantity: Number(p.quantity.toFixed(6)),
      avg_price: Number((p.cost / p.quantity).toFixed(4)),
    }));
}

module.exports = { buildHoldings };
