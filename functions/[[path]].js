import QRCode from "qrcode";

const COOKIE_NAME = "qr_admin";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_LIMIT = 8;
const encoder = new TextEncoder();

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...headers,
    },
  });
}

function base64Url(bytes) {
  let binary = "";
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function randomToken(size = 32) {
  return base64Url(crypto.getRandomValues(new Uint8Array(size)));
}

async function hash(value) {
  return base64Url(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
}

async function sameSecret(left, right) {
  const [a, b] = await Promise.all([hash(left), hash(right)]);
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) {
    difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return difference === 0;
}

function requestIsSameOrigin(request) {
  return request.headers.get("Origin") === new URL(request.url).origin;
}

function cookieValue(request, name) {
  const prefix = `${name}=`;
  const item = (request.headers.get("Cookie") || "")
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));
  return item ? item.slice(prefix.length) : null;
}

function sessionCookie(token, maxAge, secure = true) {
  const secureFlag = secure ? "; Secure" : "";
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly${secureFlag}; SameSite=Strict; Max-Age=${maxAge}`;
}

async function getSession(request, env) {
  const token = cookieValue(request, COOKIE_NAME);
  if (!token) return null;
  const tokenHash = await hash(token);
  const row = await env.DB.prepare(
    "SELECT csrf_token FROM sessions WHERE token_hash = ? AND expires_at > ?",
  ).bind(tokenHash, new Date().toISOString()).first();
  return row ? { tokenHash, csrfToken: row.csrf_token } : null;
}

async function requireSession(request, env) {
  const session = await getSession(request, env);
  if (!session) return { response: json({ error: "Ou bezwen konekte." }, 401) };
  if (request.method !== "GET" && !requestIsSameOrigin(request)) {
    return { response: json({ error: "Demann sa a pa soti nan sit la." }, 403) };
  }
  if (request.method === "GET") return { session };
  const csrf = request.headers.get("X-CSRF-Token") || "";
  if (!await sameSecret(csrf, session.csrfToken)) {
    return { response: json({ error: "Sesyon an ekspire. Konekte ankò." }, 403) };
  }
  return { session };
}

async function recordFailedLogin(env, ip, now) {
  const windowEndsAt = now + LOGIN_WINDOW_MS;
  await env.DB.prepare(
    `INSERT INTO login_attempts (ip, attempts, window_ends_at)
     VALUES (?, 1, ?)
     ON CONFLICT(ip) DO UPDATE SET
       attempts = CASE WHEN login_attempts.window_ends_at <= ? THEN 1 ELSE login_attempts.attempts + 1 END,
       window_ends_at = CASE WHEN login_attempts.window_ends_at <= ? THEN excluded.window_ends_at ELSE login_attempts.window_ends_at END`,
  ).bind(ip, windowEndsAt, now, now).run();
}

function escapeXml(value) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&apos;",
  })[character]);
}

function wrapLabel(label) {
  const lines = [];
  let line = "";
  for (const word of label.trim().split(/\s+/)) {
    if (line && line.length + word.length + 1 > 18) {
      lines.push(line);
      line = "";
    }
    if (word.length > 18) {
      if (line) lines.push(line);
      line = word.slice(0, 18);
      for (let offset = 18; offset < word.length; offset += 18) {
        lines.push(line);
        line = word.slice(offset, offset + 18);
      }
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  if (lines.length > 3) lines.splice(2, lines.length - 2, `${lines[2].slice(0, 15)}...`);
  return lines.length ? lines : [label];
}

async function namedQrSvg(content, label) {
  const svg = await QRCode.toString(content, {
    type: "svg",
    errorCorrectionLevel: "H",
    margin: 4,
    width: 512,
    color: { dark: "#202522", light: "#fffefa" },
  });
  const viewBox = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
  if (!viewBox) throw new Error("QR SVG is missing its viewBox.");
  const width = Number(viewBox[1]);
  const height = Number(viewBox[2]);
  const lines = wrapLabel(label);
  const centerX = width / 2;
  const centerY = height / 2;
  const boxWidth = width * 0.5;
  const maxLineLength = Math.max(...lines.map((line) => line.length));
  const fontSize = Math.max(1.2, Math.min(2.1, boxWidth / (maxLineLength * 0.62)));
  const lineHeight = fontSize * 1.2;
  const boxHeight = lines.length * lineHeight + 1.5;
  const startY = centerY - ((lines.length - 1) * lineHeight) / 2 + fontSize * 0.35;
  const tspans = lines.map((line, index) =>
    `<tspan x="${centerX}" dy="${index === 0 ? 0 : lineHeight}">${escapeXml(line)}</tspan>`,
  ).join("");
  const labelLayer = `<rect x="${centerX - boxWidth / 2}" y="${centerY - boxHeight / 2}" width="${boxWidth}" height="${boxHeight}" rx="1" fill="#fffefa" stroke="#176a53" stroke-width="0.2"/><text x="${centerX}" y="${startY}" text-anchor="middle" font-family="Arial, sans-serif" font-size="${fontSize}" font-weight="700" fill="#202522">${tspans}</text><title>${escapeXml(label)}</title>`;
  return svg.replace("</svg>", `${labelLayer}</svg>`);
}

async function handleRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname;

  if (path === "/health") {
    await env.DB.prepare("SELECT 1").first();
    return json({ status: "ok" });
  }

  const legacyRedeem = path.match(/^\/redeem\/([A-Za-z0-9_-]+)\/?$/);
  if (legacyRedeem) {
    const target = new URL("/redeem", url);
    target.searchParams.set("token", legacyRedeem[1]);
    return Response.redirect(target, 302);
  }

  if (path === "/api/session" && request.method === "GET") {
    const session = await getSession(request, env);
    return session
      ? json({ authenticated: true, csrfToken: session.csrfToken })
      : json({ authenticated: false }, 401);
  }

  if (path === "/api/login" && request.method === "POST") {
    if (!requestIsSameOrigin(request)) return json({ error: "Demann sa a pa soti nan sit la." }, 403);
    if (!env.ADMIN_PASSWORD) return json({ error: "Modpas admin lan poko konfigire." }, 503);
    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    const now = Date.now();
    const limit = await env.DB.prepare(
      "SELECT attempts, window_ends_at FROM login_attempts WHERE ip = ?",
    ).bind(ip).first();
    if (limit && limit.window_ends_at > now && limit.attempts >= LOGIN_LIMIT) {
      return json({ error: "Twòp tantativ. Eseye ankò pita." }, 429);
    }
    const body = await request.json().catch(() => null);
    const password = typeof body?.password === "string" ? body.password : "";
    if (!await sameSecret(password, env.ADMIN_PASSWORD)) {
      await recordFailedLogin(env, ip, now);
      return json({ error: "Modpas la pa kòrèk." }, 401);
    }
    await env.DB.prepare("DELETE FROM login_attempts WHERE ip = ?").bind(ip).run();
    await env.DB.prepare("DELETE FROM sessions WHERE expires_at <= ?").bind(new Date(now).toISOString()).run();
    const sessionToken = randomToken();
    const tokenHash = await hash(sessionToken);
    const csrfToken = randomToken(24);
    const expiresAt = new Date(now + SESSION_TTL_MS).toISOString();
    await env.DB.prepare(
      "INSERT INTO sessions (token_hash, csrf_token, expires_at) VALUES (?, ?, ?)",
    ).bind(tokenHash, csrfToken, expiresAt).run();
    return json(
      { authenticated: true },
      200,
      { "Set-Cookie": sessionCookie(sessionToken, SESSION_TTL_MS / 1000, env.SESSION_COOKIE_SECURE !== "false") },
    );
  }

  if (path === "/api/logout" && request.method === "POST") {
    const auth = await requireSession(request, env);
    if (auth.response) return auth.response;
    await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(auth.session.tokenHash).run();
    return json({ ok: true }, 200, {
      "Set-Cookie": sessionCookie("", 0, env.SESSION_COOKIE_SECURE !== "false"),
    });
  }

  if (path === "/api/codes" && request.method === "GET") {
    const auth = await requireSession(request, env);
    if (auth.response) return auth.response;
    const result = await env.DB.prepare(
      "SELECT id, token, label, created_at, used_at FROM codes ORDER BY id DESC",
    ).all();
    const codes = result.results.map((code) => ({
      ...code,
      url: `${url.origin}/redeem?token=${encodeURIComponent(code.token)}`,
    }));
    return json({ codes });
  }

  if (path === "/api/codes" && request.method === "POST") {
    const auth = await requireSession(request, env);
    if (auth.response) return auth.response;
    const body = await request.json().catch(() => null);
    if (!Array.isArray(body?.labels) || !body.labels.every((label) => typeof label === "string")) {
      return json({ error: "Lis la dwe gen tèks sèlman." }, 400);
    }
    const labels = body.labels.map((label) => label.trim()).filter(Boolean);
    if (!labels.length) return json({ error: "Ekri omwen yon non oswa id." }, 400);
    if (labels.length > 500) return json({ error: "Ou ka kreye jiska 500 kòd alafwa." }, 400);
    if (labels.some((label) => label.length > 200)) {
      return json({ error: "Non oswa id yo pa dwe depase 200 karaktè." }, 400);
    }

    const createdAt = new Date().toISOString();
    const codes = labels.map((label) => ({ label, token: randomToken(24) }));
    await env.DB.batch(codes.map((code) =>
      env.DB.prepare(
        "INSERT INTO codes (token, label, created_at, used_at) VALUES (?, ?, ?, NULL)",
      ).bind(code.token, code.label, createdAt),
    ));
    return json({
      codes: codes.map((code) => ({
        label: code.label,
        url: `${url.origin}/redeem?token=${encodeURIComponent(code.token)}`,
      })),
    }, 201);
  }

  const qrMatch = path.match(/^\/qr\/([A-Za-z0-9_-]+)\.svg$/);
  if (qrMatch && request.method === "GET") {
    const code = await env.DB.prepare("SELECT label FROM codes WHERE token = ?").bind(qrMatch[1]).first();
    if (!code) return new Response("Not found", { status: 404 });
    const redeemUrl = new URL("/redeem", url);
    redeemUrl.searchParams.set("token", qrMatch[1]);
    return new Response(await namedQrSvg(redeemUrl.toString(), code.label), {
      headers: {
        "Content-Type": "image/svg+xml; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  const redeemMatch = path.match(/^\/api\/redeem\/([A-Za-z0-9_-]+)\/?$/);
  if (redeemMatch && request.method === "POST") {
    const token = redeemMatch[1];
    const usedAt = new Date().toISOString();
    const update = await env.DB.prepare(
      "UPDATE codes SET used_at = ? WHERE token = ? AND used_at IS NULL",
    ).bind(usedAt, token).run();
    if (update.meta.changes === 1) {
      const code = await env.DB.prepare("SELECT label FROM codes WHERE token = ?").bind(token).first();
      return json({ status: "accepted", label: code.label });
    }
    const exists = await env.DB.prepare("SELECT 1 AS found FROM codes WHERE token = ?").bind(token).first();
    return json({ status: exists ? "used" : "invalid" }, 409);
  }

  return context.next();
}

export async function onRequest(context) {
  try {
    return await handleRequest(context);
  } catch (error) {
    console.error("Pages Function error", error);
    return json({ error: "Sèvis la rankontre yon pwoblèm." }, 500);
  }
}