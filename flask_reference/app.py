"""
Short.ly — Single-File Distributed URL Shortener (Python Flask Reference)
=======================================================================
Note: In the AI Studio Node.js runtime, the live server runs via server.ts.
This standalone `app.py` provides the exact equivalent single-file Flask
architecture ready to run locally with `pip install flask qrcode[pil]`.

Distributed Systems Concepts Demonstrated:
1. Counter + Base62 Encoding: Bijective counter permutation mapped to 6-char Base62.
2. Cache-Aside Redis Simulation: In-memory dict checked O(1) before DB lookup.
3. Range-Based SQLite Sharding:
   - Keys starting with A-M (or 0-4) -> DB 1 (shard_1_am.db)
   - Keys starting with N-Z (or 5-9) -> DB 2 (shard_2_nz.db)
4. Round-Robin Load Balancing: Cycles sequentially across Server 1, Server 2, Server 3.
5. HTTP 301 Permanent Redirects with click counting and daily analytics.
"""

from __future__ import annotations

import base64
import datetime as dt
import io
import os
import re
import sqlite3
from typing import Any

from flask import Flask, jsonify, redirect, render_template_string, request
import qrcode

app = Flask(__name__)

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
os.makedirs(DATA_DIR, exist_ok=True)

SHARD_1_PATH = os.path.join(DATA_DIR, "shard_1_am.db")
SHARD_2_PATH = os.path.join(DATA_DIR, "shard_2_nz.db")
META_DB_PATH = os.path.join(DATA_DIR, "meta.db")

# ---------------------------------------------------------------------------
# 1. DISTRIBUTED ID GENERATION: Counter + Base62 Encoding
# ---------------------------------------------------------------------------
BASE62_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
BASE = len(BASE62_ALPHABET)
CODE_SPACE = BASE ** 6
COUNTER_STRIDE = 2654435761  # Coprime to 62^6 for collision-free bijection
COUNTER_OFFSET = 179424673
RESERVED_CODES = {"api", "dashboard", "analytics", "cluster", "health"}


def encode_base62(num: int, min_len: int = 6) -> str:
    if num == 0:
        return BASE62_ALPHABET[0] * min_len
    chars: list[str] = []
    while num > 0:
        chars.append(BASE62_ALPHABET[num % BASE])
        num //= BASE
    encoded = "".join(reversed(chars))
    return encoded.rjust(min_len, BASE62_ALPHABET[0])


def generate_short_code(counter: int) -> str:
    permuted = (counter * COUNTER_STRIDE + COUNTER_OFFSET) % CODE_SPACE
    return encode_base62(permuted, 6)


# ---------------------------------------------------------------------------
# 2. HORIZONTAL SHARDING: A-M -> DB 1, N-Z -> DB 2
# ---------------------------------------------------------------------------
def get_shard_info(short_code: str) -> tuple[str, str, str]:
    first = (short_code or "").strip()[:1].upper()
    if ("A" <= first <= "M") or ("0" <= first <= "4"):
        return ("DB_1", "DB 1 (A-M)", SHARD_1_PATH)
    return ("DB_2", "DB 2 (N-Z)", SHARD_2_PATH)


def init_databases() -> None:
    schema = """
    CREATE TABLE IF NOT EXISTS links (
        short_code TEXT PRIMARY KEY,
        long_url TEXT NOT NULL,
        clicks INTEGER NOT NULL DEFAULT 0,
        is_custom_alias INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
    );
    """
    for db_path in (SHARD_1_PATH, SHARD_2_PATH):
        with sqlite3.connect(db_path) as conn:
            conn.executescript(schema)

    with sqlite3.connect(META_DB_PATH) as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS counters (name TEXT PRIMARY KEY, value INTEGER NOT NULL);
            CREATE TABLE IF NOT EXISTS clicks_daily (day TEXT PRIMARY KEY, clicks INTEGER NOT NULL DEFAULT 0);
            INSERT OR IGNORE INTO counters (name, value) VALUES ('url_seq', 1000);
            """
        )


def next_counter() -> int:
    with sqlite3.connect(META_DB_PATH) as conn:
        cur = conn.execute(
            "UPDATE counters SET value = value + 1 WHERE name = 'url_seq' RETURNING value"
        )
        row = cur.fetchone()
        conn.commit()
        return int(row[0])


# ---------------------------------------------------------------------------
# 3. REDIS CACHE SIMULATION (In-Memory Dictionary) & ROUND-ROBIN BALANCER
# ---------------------------------------------------------------------------
REDIS_CACHE: dict[str, str] = {}
CACHE_STATS = {"hits": 0, "misses": 0}

SERVER_NODES = ["Server 1", "Server 2", "Server 3"]
NODE_COUNTS = {name: 0 for name in SERVER_NODES}
_lb_index = 0


def next_server_node() -> str:
    global _lb_index
    node = SERVER_NODES[_lb_index]
    NODE_COUNTS[node] += 1
    _lb_index = (_lb_index + 1) % len(SERVER_NODES)
    return node


def make_qr_data_url(target_url: str) -> str:
    img = qrcode.make(target_url)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    encoded = base64.b64encode(buf.getvalue()).decode("ascii")
    return f"data:image/png;base64,{encoded}"


@app.post("/api/shorten")
def api_shorten() -> Any:
    payload = request.get_json(silent=True) or {}
    long_url = str(payload.get("url", "")).strip()
    custom_alias = str(payload.get("customAlias", "")).strip()

    if not long_url:
        return jsonify({"error": "Please enter a valid URL."}), 400
    if not re.match(r"^https?://", long_url, re.IGNORECASE):
        long_url = f"https://{long_url}"

    if custom_alias:
        if not re.match(r"^[a-zA-Z0-9_-]{3,32}$", custom_alias) or custom_alias.lower() in RESERVED_CODES:
            return jsonify({"error": "Invalid or reserved custom alias."}), 400
        short_code = custom_alias
        is_custom = 1
    else:
        short_code = generate_short_code(next_counter())
        is_custom = 0

    shard_id, shard_label, db_path = get_shard_info(short_code)
    created_at = dt.datetime.now(dt.timezone.utc).isoformat()
    node = next_server_node()

    with sqlite3.connect(db_path) as conn:
        existing = conn.execute(
            "SELECT 1 FROM links WHERE short_code = ?", (short_code,)
        ).fetchone()
        if existing:
            return jsonify({"error": "Short code already exists."}), 409
        conn.execute(
            "INSERT INTO links (short_code, long_url, clicks, is_custom_alias, created_at) VALUES (?, ?, 0, ?, ?)",
            (short_code, long_url, is_custom, created_at),
        )
        conn.commit()

    # Write-through into simulated Redis cache
    REDIS_CACHE[short_code] = long_url
    short_href = f"{request.host_url.rstrip('/')}/{short_code}"

    return (
        jsonify(
            {
                "shortCode": short_code,
                "shortUrl": f"short.ly/{short_code}",
                "longUrl": long_url,
                "shardId": shard_id,
                "shardLabel": shard_label,
                "serverNode": node,
                "qrDataUrl": make_qr_data_url(short_href),
            }
        ),
        201,
    )


@app.get("/<short_code>")
def redirect_short_link(short_code: str) -> Any:
    node = next_server_node()
    shard_id, _, db_path = get_shard_info(short_code)

    # Check Redis cache first
    if short_code in REDIS_CACHE:
        CACHE_STATS["hits"] += 1
        long_url = REDIS_CACHE[short_code]
        cache_header = "HIT"
    else:
        CACHE_STATS["misses"] += 1
        with sqlite3.connect(db_path) as conn:
            row = conn.execute(
                "SELECT long_url FROM links WHERE short_code = ?", (short_code,)
            ).fetchone()
        if not row:
            return jsonify({"error": "Short link not found."}), 404
        long_url = row[0]
        REDIS_CACHE[short_code] = long_url
        cache_header = "MISS"

    with sqlite3.connect(db_path) as conn:
        conn.execute(
            "UPDATE links SET clicks = clicks + 1 WHERE short_code = ?", (short_code,)
        )
        conn.commit()

    today = dt.date.today().isoformat()
    with sqlite3.connect(META_DB_PATH) as conn:
        conn.execute(
            "INSERT INTO clicks_daily (day, clicks) VALUES (?, 1) ON CONFLICT(day) DO UPDATE SET clicks = clicks + 1",
            (today,),
        )
        conn.commit()

    resp = redirect(long_url, code=301)
    resp.headers["X-Served-By"] = node
    resp.headers["X-Cache"] = cache_header
    resp.headers["X-DB-Shard"] = shard_id
    return resp


@app.get("/")
def home_page() -> str:
    return render_template_string(
        "<h1>Short.ly Flask Reference</h1><p>Use POST /api/shorten and GET /&lt;short_code&gt;.</p>"
    )


if __name__ == "__main__":
    init_databases()
    app.run(host="0.0.0.0", port=5000, debug=True)
