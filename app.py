import hmac
import os
import secrets
import sqlite3
import textwrap
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from xml.etree import ElementTree as ET

import qrcode
import qrcode.image.svg
from flask import Flask, abort, jsonify, redirect, render_template, request, session, url_for
from werkzeug.middleware.proxy_fix import ProxyFix


ROOT = Path(__file__).resolve().parent
DATABASE = Path(os.environ.get("QR_DATABASE", ROOT / "data" / "codes.sqlite3"))
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD")
if not ADMIN_PASSWORD:
    raise RuntimeError("ADMIN_PASSWORD environment variable is required.")
BASE_URL = os.environ.get("BASE_URL", "").rstrip("/")

app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", secrets.token_hex(32))
app.config.update(
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    SESSION_COOKIE_SECURE=os.environ.get("SESSION_COOKIE_SECURE", "").lower() == "true",
)
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1)


def connect_db():
    DATABASE.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DATABASE, timeout=10)
    connection.row_factory = sqlite3.Row
    return connection


@contextmanager
def db_connection():
    connection = connect_db()
    try:
        with connection:
            yield connection
    finally:
        connection.close()


def init_db():
    with db_connection() as connection:
        connection.execute(
            """CREATE TABLE IF NOT EXISTS codes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                token TEXT NOT NULL UNIQUE,
                label TEXT NOT NULL,
                created_at TEXT NOT NULL,
                used_at TEXT
            )"""
        )


def is_admin():
    return session.get("is_admin") is True


def get_csrf_token():
    if "csrf_token" not in session:
        session["csrf_token"] = secrets.token_urlsafe(32)
    return session["csrf_token"]


def valid_csrf_token(token):
    expected = session.get("csrf_token", "")
    return bool(expected) and hmac.compare_digest(token, expected)


def code_url(token):
    origin = BASE_URL or request.url_root.rstrip("/")
    return f"{origin}{url_for('redeem_page', token=token)}"


@app.get("/health")
def health():
    with db_connection() as connection:
        connection.execute("SELECT 1")
    return jsonify(status="ok")


@app.get("/login")
def login_page():
    if is_admin():
        return redirect(url_for("dashboard"))
    return render_template("login.html", error=None, csrf_token=get_csrf_token())


@app.post("/login")
def login():
    if not valid_csrf_token(request.form.get("csrf_token", "")):
        abort(400)
    password = request.form.get("password", "")
    if hmac.compare_digest(password, ADMIN_PASSWORD):
        session.clear()
        session["is_admin"] = True
        get_csrf_token()
        return redirect(url_for("dashboard"))
    return render_template(
        "login.html", error="Modpas la pa kòrèk.", csrf_token=get_csrf_token()
    ), 401


@app.post("/logout")
def logout():
    if not valid_csrf_token(request.form.get("csrf_token", "")):
        abort(400)
    session.clear()
    return redirect(url_for("login_page"))


@app.get("/")
def dashboard():
    if not is_admin():
        return redirect(url_for("login_page"))
    with db_connection() as connection:
        rows = connection.execute("SELECT * FROM codes ORDER BY id DESC").fetchall()
    codes = [
        {
            "label": row["label"],
            "created_at": row["created_at"],
            "used_at": row["used_at"],
            "token": row["token"],
            "url": code_url(row["token"]),
        }
        for row in rows
    ]
    return render_template("dashboard.html", codes=codes, csrf_token=get_csrf_token())


@app.post("/api/codes")
def create_codes():
    if not is_admin():
        abort(401)
    if not valid_csrf_token(request.headers.get("X-CSRF-Token", "")):
        abort(400)
    data = request.get_json(silent=True) or {}
    raw_labels = data.get("labels", [])
    if not isinstance(raw_labels, list) or not all(isinstance(line, str) for line in raw_labels):
        return jsonify(error="Lis la dwe gen tèks sèlman."), 400
    labels = [line.strip() for line in raw_labels if line.strip()]
    if not labels:
        return jsonify(error="Ekri omwen yon non oswa id."), 400
    if len(labels) > 500:
        return jsonify(error="Ou ka kreye jiska 500 kòd alafwa."), 400

    created_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
    codes = [{"label": label, "token": secrets.token_urlsafe(24)} for label in labels]
    with db_connection() as connection:
        connection.executemany(
            "INSERT INTO codes (token, label, created_at) VALUES (?, ?, ?)",
            [(code["token"], code["label"], created_at) for code in codes],
        )
    return jsonify(
        codes=[{"label": code["label"], "url": code_url(code["token"])} for code in codes]
    ), 201


@app.get("/qr/<token>.svg")
def qr_image(token):
    with db_connection() as connection:
        code = connection.execute(
            "SELECT label FROM codes WHERE token = ?", (token,)
        ).fetchone()
    if not code:
        abort(404)

    qr = qrcode.QRCode(
        error_correction=qrcode.constants.ERROR_CORRECT_H,
        box_size=10,
        border=4,
    )
    qr.add_data(code_url(token))
    qr.make(fit=True)
    image = qr.make_image(image_factory=qrcode.image.svg.SvgPathImage)

    namespace = "http://www.w3.org/2000/svg"
    ET.register_namespace("", namespace)
    root = ET.fromstring(image.to_string())
    min_x, min_y, width, height = map(float, root.attrib["viewBox"].split())
    center_x = min_x + width / 2
    center_y = min_y + height / 2
    lines = textwrap.wrap(code["label"], width=18, break_long_words=True) or [code["label"]]
    if len(lines) > 3:
        lines = lines[:2] + [lines[2][:15] + "..."]

    box_width = width * 0.76
    font_size = max(1.8, min(3.2, box_width / (max(map(len, lines)) * 0.62)))
    line_height = font_size * 1.2
    box_height = len(lines) * line_height + 2
    ET.SubElement(
        root,
        f"{{{namespace}}}rect",
        {
            "x": str(center_x - box_width / 2),
            "y": str(center_y - box_height / 2),
            "width": str(box_width),
            "height": str(box_height),
            "rx": "1.2",
            "fill": "#fffefa",
            "stroke": "#176a53",
            "stroke-width": "0.45",
        },
    )
    text = ET.SubElement(
        root,
        f"{{{namespace}}}text",
        {
            "x": str(center_x),
            "y": str(center_y - (len(lines) - 1) * line_height / 2 + font_size * 0.35),
            "text-anchor": "middle",
            "font-family": "Arial, sans-serif",
            "font-size": str(font_size),
            "font-weight": "700",
            "fill": "#202522",
        },
    )
    for index, line in enumerate(lines):
        span = ET.SubElement(
            text,
            f"{{{namespace}}}tspan",
            {"x": str(center_x), "dy": "0" if index == 0 else str(line_height)},
        )
        span.text = line
    title = ET.SubElement(root, f"{{{namespace}}}title")
    title.text = code["label"]

    response = app.response_class(
        ET.tostring(root, encoding="utf-8", xml_declaration=True),
        mimetype="image/svg+xml",
    )
    response.headers["Cache-Control"] = "no-store"
    return response


@app.get("/redeem/<token>")
def redeem_page(token):
    with db_connection() as connection:
        code = connection.execute(
            "SELECT label, used_at FROM codes WHERE token = ?", (token,)
        ).fetchone()
    if not code:
        return render_template("redeem.html", state="invalid", label=None, token=token)
    state = "used" if code["used_at"] else "pending"
    return render_template("redeem.html", state=state, label=code["label"], token=token)


@app.post("/api/redeem/<token>")
def redeem(token):
    used_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
    with db_connection() as connection:
        cursor = connection.execute(
            "UPDATE codes SET used_at = ? WHERE token = ? AND used_at IS NULL",
            (used_at, token),
        )
        if cursor.rowcount == 1:
            row = connection.execute("SELECT label FROM codes WHERE token = ?", (token,)).fetchone()
            return jsonify(status="accepted", label=row["label"])
        exists = connection.execute("SELECT 1 FROM codes WHERE token = ?", (token,)).fetchone()
    return jsonify(status="used" if exists else "invalid"), 409


init_db()


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "5000")), debug=False)