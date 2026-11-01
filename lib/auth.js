const crypto = require("node:crypto");

const ALLOWED_ORIGINS = new Set([
  "https://dbiraud1-ops.github.io",
  "https://agencia-secreta-backend.vercel.app"
]);

function cors(req, res) {
  const origin = req.headers.origin;
  if (!origin || !ALLOWED_ORIGINS.has(origin)) return false;
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Credentials", "false");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Vary", "Origin");
  return true;
}

function bodyOf(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return {};
}

function sign(payload) {
  const secret = process.env.AGENCY_SESSION_SECRET;
  if (!secret) throw new Error("Falta configurar AGENCY_SESSION_SECRET.");
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto.createHmac("sha256", secret).update(encoded).digest("base64url");
  return encoded + "." + signature;
}

function verify(token) {
  const secret = process.env.AGENCY_SESSION_SECRET;
  if (!secret || typeof token !== "string") return false;
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const expected = crypto.createHmac("sha256", secret).update(parts[0]).digest();
  let actual;
  try { actual = Buffer.from(parts[1], "base64url"); } catch { return false; }
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return false;
  try {
    const payload = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    return payload.role === "director" && Number(payload.exp) > Date.now();
  } catch { return false; }
}

function bearer(req) {
  const value = req.headers.authorization || "";
  return value.startsWith("Bearer ") ? value.slice(7) : "";
}

module.exports = { ALLOWED_ORIGINS, cors, bodyOf, sign, verify, bearer };