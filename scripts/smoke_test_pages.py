import http.cookiejar
import json
import os
import time
import urllib.error
import urllib.request


BASE_URL = os.environ.get("PAGES_BASE_URL", "http://127.0.0.1:8788").rstrip("/")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "")


def request(client, path, method="GET", payload=None, headers=None):
    request_headers = dict(headers or {})
    body = None
    if payload is not None:
        body = json.dumps(payload).encode("utf-8")
        request_headers["Content-Type"] = "application/json"
    outgoing = urllib.request.Request(
        BASE_URL + path,
        data=body,
        method=method,
        headers=request_headers,
    )
    try:
        with client.open(outgoing) as response:
            content = response.read()
            is_json = "application/json" in response.headers.get("Content-Type", "")
            return response.status, json.loads(content) if is_json else content
    except urllib.error.HTTPError as error:
        content = error.read()
        return error.code, json.loads(content) if content else None


def main():
    if not ADMIN_PASSWORD:
        raise SystemExit("Set ADMIN_PASSWORD to the local Pages dev password first.")

    client = urllib.request.build_opener(
        urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar())
    )
    status, health = request(client, "/health")
    assert status == 200 and health["status"] == "ok", health

    status, login = request(
        client,
        "/api/login",
        "POST",
        {"password": ADMIN_PASSWORD},
        {"Origin": BASE_URL},
    )
    assert status == 200, login

    status, session = request(client, "/api/session")
    assert status == 200 and session["authenticated"], session
    csrf_token = session["csrfToken"]

    label = f"Pages Smoke {int(time.time())}"
    status, created = request(
        client,
        "/api/codes",
        "POST",
        {"labels": [label]},
        {"Origin": BASE_URL, "X-CSRF-Token": csrf_token},
    )
    assert status == 201, created
    token = created["codes"][0]["url"].split("token=", 1)[1]

    status, svg = request(client, f"/qr/{token}.svg")
    assert status == 200 and label.encode("utf-8") in svg, "named QR SVG was not returned"

    first_status, first = request(client, f"/api/redeem/{token}", "POST")
    second_status, second = request(client, f"/api/redeem/{token}", "POST")
    assert first_status == 200 and first["status"] == "accepted", first
    assert second_status == 409 and second["status"] == "used", second
    print("PASS: Pages health, admin session, QR creation/SVG, and one-use redemption")


if __name__ == "__main__":
    main()