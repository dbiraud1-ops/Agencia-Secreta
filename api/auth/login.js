const crypto = require("node:crypto");
const { cors, bodyOf, sign } = require("../../lib/auth");

module.exports = async function handler(req, res) {
  if (!cors(req, res)) return res.status(403).json({ error: "Origen no autorizado." });
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido." });
  const expected = process.env.AGENCY_ADMIN_PASSWORD;
  if (!expected) return res.status(503).json({ error: "Falta configurar la contraseña administrativa en Vercel." });
  const { password } = bodyOf(req);
  if (typeof password !== "string" || password.length > 256) return res.status(400).json({ error: "Solicitud no válida." });
  const a = Buffer.from(password);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ error: "Contraseña de Director incorrecta." });
  }
  try {
    const token = sign({ role: "director", exp: Date.now() + 4 * 60 * 60 * 1000 });
    return res.status(200).json({ ok: true, token, expiresIn: 14400 });
  } catch (error) {
    return res.status(503).json({ error: error.message });
  }
};