import React, { useEffect, useState } from "react";

const API_BASE = "http://127.0.0.1:4000/api";


function App() {
  const [trades, setTrades] = useState([]);
  const [portfolio, setPortfolio] = useState(null);
  const [fetchError, setFetchError] = useState(null);

  const [form, setForm] = useState({
    symbol: "",
    quantity: "",
    price: "",
    type: "BUY",
  });

  // helper: safely parse numbers, return 0 if input is empty or invalid
  function parseNumber(v) {
    if (v === "" || v === null || v === undefined) return 0;
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  async function loadTrades() {
    try {
      const res = await fetch(`${API_BASE}/trades`);
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      setTrades(data || []);
    } catch (err) {
      console.error("loadTrades error", err);
      setTrades([]);
      setFetchError(String(err));
    }
  }

  async function loadPortfolio() {
    try {
      const res = await fetch(`${API_BASE}/portfolio`);
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      setPortfolio(data);
      setFetchError(null);
    } catch (err) {
      console.error("loadPortfolio error", err);
      setFetchError(String(err));
      setPortfolio({ portfolio: [], totalValue: 0 });
    }
  }

  useEffect(() => {
    loadTrades();
    loadPortfolio();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submitTrade(e) {
    e.preventDefault();

    // simple validation
    if (!form.symbol || form.symbol.trim() === "") {
      alert("Please enter a symbol.");
      return;
    }

    const body = {
      symbol: form.symbol.trim().toUpperCase(),
      quantity: parseNumber(form.quantity),
      price: parseNumber(form.price),
      type: form.type,
    };

    try {
      const res = await fetch(`${API_BASE}/trades`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`POST /trades failed: ${res.status} ${txt}`);
      }

      // clear form
      setForm({ symbol: "", quantity: "", price: "", type: "BUY" });

      // reload lists
      await loadTrades();
      await loadPortfolio();
    } catch (err) {
      console.error("submitTrade error", err);
      alert("Failed to submit trade. See console for details.");
      setFetchError(String(err));
    }
  }

  return (
    <div style={{ maxWidth: 900, margin: "2rem auto", fontFamily: "system-ui, sans-serif" }}>
      <h1>Cloud Portfolio Tracker</h1>

      <section>
        <h2>Add Trade</h2>
        <form onSubmit={submitTrade} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input
            required
            placeholder="Symbol"
            value={form.symbol}
            onChange={(e) => setForm({ ...form, symbol: e.target.value })}
            style={{ minWidth: 120 }}
          />
          <input
            required
            type="number"
            step="0.0001"
            placeholder="Qty"
            value={form.quantity}
            onChange={(e) => setForm({ ...form, quantity: e.target.value })}
            style={{ width: 120 }}
          />
          <input
            required
            type="number"
            step="0.01"
            placeholder="Price"
            value={form.price}
            onChange={(e) => setForm({ ...form, price: e.target.value })}
            style={{ width: 120 }}
          />
          <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            <option>BUY</option>
            <option>SELL</option>
          </select>
          <button type="submit">Add</button>
        </form>
      </section>

      <section style={{ marginTop: 20 }}>
        <h2>Portfolio</h2>

        {fetchError && (
          <div style={{ color: "tomato", marginBottom: 8 }}>
            API error: {fetchError}
          </div>
        )}

        {portfolio ? (
          <>
            <div style={{ marginBottom: 8 }}>Total Value: ${Number(portfolio.totalValue || 0).toFixed(2)}</div>

            {portfolio.portfolio.length === 0 ? (
              <div>No holdings yet.</div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", border: "1px solid #ddd" }}>
                <thead>
                  <tr>
                    <th>Symbol</th>
                    <th>Qty</th>
                    <th>Avg Price</th>
                    <th>Current</th>
                    <th>Market Value</th>
                  </tr>
                </thead>
                <tbody>
                  {portfolio.portfolio.map((p) => (
                    <tr key={p.symbol}>
                      <td>{p.symbol}</td>
                      <td>{p.netQty}</td>
                      <td>{p.avgPrice !== null ? Number(p.avgPrice).toFixed(2) : "N/A"}</td>
                      <td>{p.currentPrice !== null ? Number(p.currentPrice).toFixed(2) : "N/A"}</td>
                      <td>{p.marketValue !== null ? Number(p.marketValue).toFixed(2) : "N/A"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        ) : (
          <p>Loading portfolio...</p>
        )}
      </section>

      <section style={{ marginTop: 20 }}>
        <h2>Trades</h2>
        {trades.length === 0 ? (
          <div>No trades yet. Use the form above to add one.</div>
        ) : (
          <ul>
            {trades.map((t) => (
              <li key={t.id}>
                {t.symbol} {t.type} {t.quantity} @ {t.price} ({new Date(t.executed_at).toLocaleString()})
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export default App;
