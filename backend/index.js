// backend/index.js
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { Pool } from 'pg';
import fetch from 'node-fetch'; // if using Node 18+ you can remove this and use global fetch

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

/**
 * Simple in-memory cache to avoid hitting API rate limits.
 * Cache structure: { SYMBOL: { price: number|null, ts: epoch_ms } }
 */
const priceCache = {};
const CACHE_TTL_MS = 60_000; // 60 seconds

async function fetchCurrentPrice(symbol) {
  const key = String(symbol).toUpperCase();
  const now = Date.now();

  // return cached if fresh
  const cached = priceCache[key];
  if (cached && now - cached.ts < CACHE_TTL_MS) return cached.price;

  const apiKey = process.env.ALPHA_VANTAGE_KEY;
  if (!apiKey) {
    // store null so repeated calls don't repeatedly error
    priceCache[key] = { price: null, ts: now };
    return null;
  }

  const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(
    key
  )}&apikey=${apiKey}`;

  try {
    const res = await fetch(url);
    const data = await res.json();

    const quote = data['Global Quote'] || {};
    const priceStr = quote['05. price'] ?? null;
    const price = priceStr ? parseFloat(priceStr) : null;

    priceCache[key] = { price, ts: now };
    return price;
  } catch (err) {
    console.error('Price fetch error for', key, err);
    priceCache[key] = { price: null, ts: now };
    return null;
  }
}

/* ---------- Routes ---------- */

// health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// create trade
app.post('/api/trades', async (req, res) => {
  try {
    const { symbol, quantity, price, type } = req.body;
    if (!symbol || !quantity || !price || !type) {
      return res.status(400).json({ error: 'Missing fields: symbol, quantity, price, type' });
    }

    const result = await pool.query(
      `INSERT INTO trades (symbol, quantity, price, type) VALUES ($1,$2,$3,$4) RETURNING *`,
      [String(symbol).toUpperCase(), quantity, price, String(type).toUpperCase()]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error('POST /api/trades error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// list trades
app.get('/api/trades', async (req, res) => {
  try {
    const result = await pool.query(`SELECT * FROM trades ORDER BY executed_at DESC`);
    res.json(result.rows);
  } catch (err) {
    console.error('GET /api/trades error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// aggregated portfolio with live prices
app.get('/api/portfolio', async (req, res) => {
  try {
    const agg = await pool.query(`
      SELECT symbol,
        SUM(CASE WHEN type='BUY' THEN quantity ELSE -quantity END) AS net_qty,
        AVG(price) AS avg_price
      FROM trades
      GROUP BY symbol
      HAVING SUM(CASE WHEN type='BUY' THEN quantity ELSE -quantity END) <> 0
    `);

    const rows = agg.rows;
    const portfolio = [];

    // fetch prices sequentially (simple). For many symbols consider parallel + rate limit guard.
    for (const r of rows) {
      const symbol = r.symbol;
      const netQty = parseFloat(r.net_qty);
      const avgPrice = r.avg_price !== null ? parseFloat(r.avg_price) : null;
      const currentPrice = await fetchCurrentPrice(symbol);
      const marketValue = currentPrice !== null ? Number((netQty * currentPrice).toFixed(4)) : null;

      portfolio.push({
        symbol,
        netQty,
        avgPrice,
        currentPrice,
        marketValue,
      });
    }

    const totalValue = portfolio.reduce((acc, p) => acc + (p.marketValue || 0), 0);
    res.json({ portfolio, totalValue });
  } catch (err) {
    console.error('GET /api/portfolio error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// optional: delete a trade
app.delete('/api/trades/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query(`DELETE FROM trades WHERE id = $1`, [id]);
    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/trades/:id error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ---------- Start server ---------- */
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Backend running on port ${PORT}`));
