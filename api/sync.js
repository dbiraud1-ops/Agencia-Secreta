const { cors, bearer, verify, bodyOf } = require("../lib/auth");
const { syncRecord } = require("../lib/sheets");

module.exports = async function handler(req, res) {
  if (!cors(req, res)) return res.status(403).json({ error: "Origen no autorizado." });
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido." });
  if (!verify(bearer(req))) return res.status(401).json({ error: "Sesión de Director no válida o caducada." });
  const body = bodyOf(req);
  if (!body || !["agents", "cases", "notices"].includes(body.type) || !body.record || typeof body.record !== "object") {
    return res.status(400).json({ error: "Tipo o registro no permitido." });
  }
  try {
    const result = await syncRecord(body.type, body.record);
    return res.status(200).json(result);
  } catch (error) {
    console.error("Google Sheets sync:", error.message);
    return res.status(503).json({ error: error.message || "No se pudo sincronizar con Google Sheets." });
  }
};