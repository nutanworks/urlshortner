"""
Short.ly — Distributed URL Shortener (Python Flask + MongoDB + Werkzeug Reference)
==================================================================================
Note: In the AI Studio Node.js runtime, the live server runs via server.ts.
This standalone `app.py` provides the exact equivalent Flask architecture
with Werkzeug password hashing, Flask sessions, RBAC, malicious URL blocking,
and MongoDB Atlas persistence (`users`, `links`, `clicks`).

Install dependencies to run locally:
    pip install flask pymongo qrcode[pil] werkzeug
"""

from __future__ import annotations

import base64
import datetime as dt
import io
import os
import re
from functools import wraps
from typing import Any
from urllib.parse import quote_plus

import qrcode
from flask import Flask, jsonify, redirect, render_template_string, request, session
from pymongo import MongoClient, ReturnDocument
from werkzeug.security import check_password_hash, generate_password_hash

app = Flask(__name__)
app.secret_key = os.environ.get("SESSION_SECRET", "shortly-distributed-session-key")

# MongoDB Atlas Connection (URL-encodes '@' in password automatically)
RAW_MONGO_URI = os.environ.get(
    "MONGODB_URI",
    f"mongodb+srv://admin:{quote_plus('Admin@123')}@details.vczgwr8.mongodb.net/shortly?retryWrites=true&w=majority",
)
mongo_client = MongoClient(RAW_MONGO_URI)
mongo_db = mongo_client["shortly"]
users_col = mongo_db["users"]
links_col = mongo_db["links"]
clicks_col = mongo_db["clicks"]
counters_col = mongo_db["counters"]

# ---------------------------------------------------------------------------
# 1. DISTRIBUTED ID GENERATION: Counter + Base62 Encoding & Sharding
# ---------------------------------------------------------------------------
BASE62_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
BASE = len(BASE62_ALPHABET)
CODE_SPACE = BASE ** 6
COUNTER_STRIDE = 2654435761
COUNTER_OFFSET = 179424673
RESERVED_CODES = {"api", "dashboard", "analytics", "cluster", "login", "signup", "health"}
MALICIOUS_TOKENS = ("phishing", "malware", ".exe")


def encode_base62(num: int, min_len: int = 6) -> str:
    if num == 0:
        return BASE62_ALPHABET[0] * min_len
    chars: list[str] = []
    while num > 0:
        chars.append(BASE62_ALPHABET[num % BASE])
        num //= BASE
    return "".join(reversed(chars)).rjust(min_len, BASE62_ALPHABET[0])


def generate_short_code(counter: int) -> str:
    return encode_base62((counter * COUNTER_STRIDE + COUNTER_OFFSET) % CODE_SPACE, 6)


def get_shard_info(short_code: str) -> tuple[str, str]:
    first = (short_code or "").strip()[:1].upper()
    if ("A" <= first <= "M") or ("0" <= first <= "4"):
        return ("DB_1", "DB 1 (A-M)")
    return ("DB_2", "DB 2 (N-Z)")


def next_counter(name: str) -> int:
    doc = counters_col.find_one_and_update(
        {"_id": name},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )
    return int(doc["seq"])


def detect_malicious_url(url: str) -> str | None:
    lower = url.lower()
    for token in MALICIOUS_TOKENS:
        if token in lower:
            return token
    return None


def parse_user_agent(ua: str) -> tuple[str, str]:
    lower = (ua or "").lower()
    if "ipad" in lower or "tablet" in lower:
        device = "Tablet"
    elif "mobile" in lower or "iphone" in lower or "android" in lower:
        device = "Mobile"
    else:
        device = "Desktop"

    if "edg/" in lower or "edge/" in lower:
        browser = "Edge"
    elif "firefox/" in lower:
        browser = "Firefox"
    elif "chrome/" in lower:
        browser = "Chrome"
    elif "safari/" in lower:
        browser = "Safari"
    else:
        browser = "Other"
    return device, browser


def seed_default_accounts() -> None:
    users_col.create_index("email", unique=True)
    links_col.create_index("short_code", unique=True)
    clicks_col.create_index("short_code")

    defaults = [
        ("Admin", "admin@short.ly", "admin123", "admin"),
        ("Standard User", "user@short.ly", "user123", "user"),
    ]
    for name, email, password, role in defaults:
        if not users_col.find_one({"email": email}):
            users_col.insert_one(
                {
                    "id": next_counter("user_id"),
                    "name": name,
                    "email": email,
                    "password_hash": generate_password_hash(password),
                    "role": role,
                }
            )


# ---------------------------------------------------------------------------
# 2. AUTH & RBAC DECORATORS
# ---------------------------------------------------------------------------
def login_required(fn: Any) -> Any:
    @wraps(fn)
    def wrapper(*args: Any, **kwargs: Any) -> Any:
        if "user_email" not in session:
            return jsonify({"error": "Authentication required."}), 401
        return fn(*args, **kwargs)

    return wrapper


def admin_required(fn: Any) -> Any:
    @wraps(fn)
    def wrapper(*args: Any, **kwargs: Any) -> Any:
        if "user_email" not in session:
            return jsonify({"error": "Authentication required."}), 401
        if session.get("user_role") != "admin":
            return jsonify({"error": "Forbidden: Admin privileges required."}), 403
        return fn(*args, **kwargs)

    return wrapper


# ---------------------------------------------------------------------------
# 3. REDIS CACHE SIMULATION & ROUND-ROBIN LOAD BALANCER
# ---------------------------------------------------------------------------
REDIS_CACHE: dict[str, str] = {}
SERVER_NODES = ["Server 1", "Server 2", "Server 3"]
_lb_index = 0


def next_server_node() -> str:
    global _lb_index
    node = SERVER_NODES[_lb_index]
    _lb_index = (_lb_index + 1) % len(SERVER_NODES)
    return node


def make_qr_data_url(target_url: str) -> str:
    img = qrcode.make(target_url)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return f"data:image/png;base64,{base64.b64encode(buf.getvalue()).decode('ascii')}"


# ---------------------------------------------------------------------------
# 4. AUTH ROUTES (SIGNUP / LOGIN / LOGOUT)
# ---------------------------------------------------------------------------
@app.post("/api/auth/signup")
def api_signup() -> Any:
    payload = request.get_json(silent=True) or {}
    name = str(payload.get("name", "")).strip()
    email = str(payload.get("email", "")).strip().lower()
    password = str(payload.get("password", ""))

    if len(name) < 2 or "@" not in email or len(password) < 6:
        return jsonify({"error": "Valid name, email, and 6+ char password required."}), 400
    if users_col.find_one({"email": email}):
        return jsonify({"error": "Email already registered."}), 409

    user_doc = {
        "id": next_counter("user_id"),
        "name": name,
        "email": email,
        "password_hash": generate_password_hash(password),
        "role": "user",
    }
    users_col.insert_one(user_doc)
    session["user_email"] = email
    session["user_name"] = name
    session["user_role"] = "user"
    return jsonify({"user": {"id": user_doc["id"], "name": name, "email": email, "role": "user"}}), 201


@app.post("/api/auth/login")
def api_login() -> Any:
    payload = request.get_json(silent=True) or {}
    email = str(payload.get("email", "")).strip().lower()
    password = str(payload.get("password", ""))

    user = users_col.find_one({"email": email})
    if not user or not check_password_hash(user["password_hash"], password):
        return jsonify({"error": "Invalid email or password."}), 401

    session["user_email"] = user["email"]
    session["user_name"] = user["name"]
    session["user_role"] = user["role"]
    return jsonify(
        {
            "user": {
                "id": user["id"],
                "name": user["name"],
                "email": user["email"],
                "role": user["role"],
            }
        }
    )


@app.post("/api/auth/logout")
def api_logout() -> Any:
    session.clear()
    return jsonify({"ok": True})


# ---------------------------------------------------------------------------
# 5. LINK MANAGEMENT & REDIRECTS
# ---------------------------------------------------------------------------
@app.post("/api/shorten")
@login_required
def api_shorten() -> Any:
    payload = request.get_json(silent=True) or {}
    long_url = str(payload.get("url", "")).strip()
    custom_alias = str(payload.get("customAlias", "")).strip()
    expiry_date = payload.get("expiryDate") or None
    link_password = str(payload.get("linkPassword", "")).strip()

    if not long_url:
        return jsonify({"error": "Please enter a valid URL."}), 400
    threat = detect_malicious_url(long_url)
    if threat:
        return jsonify({"error": f'Blocked malicious URL containing "{threat}".'}), 400
    if not re.match(r"^https?://", long_url, re.IGNORECASE):
        long_url = f"https://{long_url}"

    if custom_alias:
        if not re.match(r"^[a-zA-Z0-9_-]{3,32}$", custom_alias) or custom_alias.lower() in RESERVED_CODES:
            return jsonify({"error": "Invalid or reserved custom alias."}), 400
        if links_col.find_one({"short_code": custom_alias}):
            return jsonify({"error": "Custom alias already exists."}), 409
        short_code = custom_alias
    else:
        short_code = generate_short_code(next_counter("url_seq"))

    shard_id, shard_label = get_shard_info(short_code)
    created_at = dt.datetime.now(dt.timezone.utc).isoformat()
    doc = {
        "id": next_counter("link_id"),
        "user_email": session["user_email"],
        "long_url": long_url,
        "short_code": short_code,
        "clicks": 0,
        "created_at": created_at,
        "expiry_date": expiry_date,
        "password_hash": generate_password_hash(link_password) if link_password else None,
        "shard_id": shard_id,
    }
    links_col.insert_one(doc)
    REDIS_CACHE[short_code] = long_url
    node = next_server_node()
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


@app.patch("/api/links/<short_code>")
@admin_required
def api_edit_link(short_code: str) -> Any:
    payload = request.get_json(silent=True) or {}
    long_url = str(payload.get("url", "")).strip()
    if long_url:
        threat = detect_malicious_url(long_url)
        if threat:
            return jsonify({"error": f'Blocked malicious URL containing "{threat}".'}), 400
    updated = links_col.find_one_and_update(
        {"short_code": short_code},
        {"$set": {"long_url": long_url, "expiry_date": payload.get("expiryDate")}},
        return_document=ReturnDocument.AFTER,
    )
    if not updated:
        return jsonify({"error": "Short link not found."}), 404
    REDIS_CACHE[short_code] = updated["long_url"]
    return jsonify({"ok": True, "shortCode": short_code})


@app.delete("/api/links/<short_code>")
@admin_required
def api_delete_link(short_code: str) -> Any:
    res = links_col.delete_one({"short_code": short_code})
    REDIS_CACHE.pop(short_code, None)
    if res.deleted_count == 0:
        return jsonify({"error": "Short link not found."}), 404
    clicks_col.delete_many({"short_code": short_code})
    return jsonify({"deleted": True, "shortCode": short_code})


@app.get("/<short_code>")
def redirect_short_link(short_code: str) -> Any:
    node = next_server_node()
    link = links_col.find_one({"short_code": short_code})
    if not link:
        return jsonify({"error": "Short link not found."}), 404

    if link.get("expiry_date") and link["expiry_date"] <= dt.datetime.now(dt.timezone.utc).isoformat():
        return jsonify({"error": "Short link has expired."}), 410

    links_col.update_one({"short_code": short_code}, {"$inc": {"clicks": 1}})
    device, browser = parse_user_agent(request.headers.get("User-Agent", ""))
    clicks_col.insert_one(
        {
            "id": next_counter("click_id"),
            "short_code": short_code,
            "clicked_at": dt.datetime.now(dt.timezone.utc).isoformat(),
            "device": device,
            "browser": browser,
        }
    )

    resp = redirect(link["long_url"], code=301)
    resp.headers["X-Served-By"] = node
    resp.headers["X-DB-Shard"] = link.get("shard_id", "DB_1")
    return resp


@app.get("/")
def home_page() -> str:
    return render_template_string(
        "<h1>Short.ly Flask + MongoDB Reference</h1><p>Use /api/auth/login, /api/auth/signup, /api/shorten, and /&lt;short_code&gt;.</p>"
    )


if __name__ == "__main__":
    seed_default_accounts()
    app.run(host="0.0.0.0", port=5000, debug=True)
