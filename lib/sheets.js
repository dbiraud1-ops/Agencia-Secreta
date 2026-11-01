const crypto = require("node:crypto");

const SHEETS = {
  agents: {
    id: "1knpqWSvA_-HV6ds3S1_zfnlGra0Rntruyr5yfxckNLI",
    key: "numero",
    fallback: "numero",
    fields: [
      ["numero", "Id", ["id", "numero", "numero de agente"]],
      ["alias", "Nombre en clave", ["nombre en clave", "alias", "codigo operativo"]],
      ["nombre", "Nombre", ["nombre", "nombre completo"]],
      ["rango", "Rango", ["rango"]],
      ["unidad", "Departamento", ["departamento", "unidad"]],
      ["especialidad", "Especialidad", ["especialidad"]],
      ["estado", "estado", ["estado", "situacion"]],
      ["fecha", "fecha incorporacion", ["fecha incorporacion", "fecha de incorporacion", "fecha"]],
      ["nivel", "nivel acceso", ["nivel acceso", "nivel de acceso", "nivel"]],
      ["observaciones", "observaciones", ["observaciones", "notas"]]
    ],
    safe: ["numero", "alias", "nombre", "rango", "unidad", "especialidad", "estado", "fecha", "nivel", "observaciones"]
  },
  cases: {
    id: "1UggxnFhR_qOjQTvCJB7kMUSJHyTr2S4WpBT7wNM2pzc",
    key: "codigo",
    fallback: "codigo",
    fields: [
      ["codigo", "CÓDIGO", ["codigo", "código", "referencia"]],
      ["titulo", "NOMBRE DE OPERACIÓN", ["nombre de operacion", "titulo", "nombre", "operacion"]],
      ["estado", "ESTADO", ["estado", "situacion"]],
      ["prioridad", "PRIORIDAD", ["prioridad"]],
      ["agente", "AGENTE ASIGNADO", ["agente asignado", "agente", "responsable"]],
      ["descripcion", "RESUMEN", ["resumen", "descripcion", "descripción"]]
    ],
    safe: ["id", "codigo", "titulo", "estado", "prioridad", "agente", "descripcion"]
  },
  notices: {
    id: "1Hn_oprid9VGgd7w5jP654yWw31Ap3cRb6mxYA8kk3Vw",
    key: "id",
    fallback: "titulo",
    fields: [
      ["titulo", "ASUNTO", ["asunto", "titulo", "título"]],
      ["categoria", "TIPO DE AVISO", ["tipo de aviso", "categoria", "categoría", "tipo"]],
      ["estado", "ESTADO", ["estado", "situacion"]],
      ["mensaje", "MENSAJE", ["mensaje", "contenido", "descripcion", "descripción"]]
    ],
    safe: ["id", "titulo", "categoria", "estado", "mensaje"]
  }
};

function norm(value) {
  return String(value || "").trim().toLowerCase().normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}
function col(n) {
  let out = "";
  while (n > 0) { const r = (n - 1) % 26; out = String.fromCharCode(65 + r) + out; n = Math.floor((n - 1) / 26); }
  return out;
}

let cachedToken = null;
let tokenExpiry = 0;
async function googleToken() {
  if (cachedToken && tokenExpiry > Date.now() + 60000) return cachedToken;
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("Falta configurar GOOGLE_SERVICE_ACCOUNT_JSON en Vercel.");
  let account;
  try { account = JSON.parse(raw); } catch { throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON no contiene JSON válido."); }
  if (!account.client_email || !account.private_key) throw new Error("La credencial de Google no contiene client_email y private_key.");
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const claims = Buffer.from(JSON.stringify({
    iss: account.client_email,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600
  })).toString("base64url");
  const unsigned = header + "." + claims;
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(unsigned);
  const assertion = unsigned + "." + signer.sign(account.private_key).toString("base64url");
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion })
  });
  const data = await response.json();
  if (!response.ok || !data.access_token) throw new Error("Google no ha aceptado la credencial de servicio.");
  cachedToken = data.access_token;
  tokenExpiry = Date.now() + Number(data.expires_in || 3600) * 1000;
  return cachedToken;
}

async function sheetsRequest(spreadsheetId, path, options = {}) {
  const token = await googleToken();
  const response = await fetch("https://sheets.googleapis.com/v4/spreadsheets/" + spreadsheetId + path, {
    ...options,
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json", ...(options.headers || {}) }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data.error && data.error.message ? data.error.message : "Error de Google Sheets.";
    throw new Error(message);
  }
  return data;
}

async function syncRecord(type, input) {
  const config = SHEETS[type];
  if (!config) throw new Error("Tipo de registro no permitido.");
  const record = {};
  for (const key of config.safe) {
    if (input[key] !== undefined && input[key] !== null) record[key] = String(input[key]);
  }
  if (type === "agents" && (!record.numero || !record.nombre)) throw new Error("El agente necesita número y nombre.");
  if (type === "cases" && (!record.codigo || !record.titulo)) throw new Error("El caso necesita código y título.");
  if (type === "notices" && (!record.titulo || !record.mensaje)) throw new Error("El aviso necesita asunto y mensaje.");
  // Nunca se acepta ni se envía el campo password.
  const rowsData = await sheetsRequest(config.id, "/values/A:Z?majorDimension=ROWS");
  let rows = rowsData.values || [];
  if (!rows.length) {
    const headers = config.fields.map(f => f[1]);
    if (type !== "agents") headers.push("ID_SISTEMA");
    await sheetsRequest(config.id, "/values/A1:" + col(headers.length) + "1?valueInputOption=RAW", {
      method: "PUT", body: JSON.stringify({ values: [headers] })
    });
    rows = [headers];
  }
  let headers = rows[0].map(v => String(v || ""));
  const mapping = {};
  for (const [key, label, aliases] of config.fields) {
    let index = headers.findIndex(h => aliases.map(norm).includes(norm(h)));
    if (index < 0) {
      headers.push(label);
      index = headers.length - 1;
    }
    mapping[key] = index;
  }
  let idIndex = headers.findIndex(h => ["id sistema", "id sistema agencia", "identificador sistema"].includes(norm(h)));
  if (type !== "agents" && idIndex < 0) {
    headers.push("ID_SISTEMA");
    idIndex = headers.length - 1;
  }
  if (headers.length !== rows[0].length || headers.some((h, i) => h !== rows[0][i])) {
    await sheetsRequest(config.id, "/values/A1:" + col(headers.length) + "1?valueInputOption=RAW", {
      method: "PUT", body: JSON.stringify({ values: [headers] })
    });
  }
  const keyValue = type === "agents" ? record.numero : (record.id || (type === "cases" ? record.codigo : ""));
  if (type === "notices" && !keyValue) throw new Error("El aviso no tiene identificador local.");
  let rowIndex = -1;
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] || [];
    const sameId = type !== "agents" && idIndex >= 0 && String(row[idIndex] || "") === String(keyValue || "");
    const sameNatural = String(row[mapping[config.fallback]] || "").trim().toLowerCase() === String(record[config.fallback] || "").trim().toLowerCase();
    if (sameId || sameNatural) { rowIndex = i; break; }
  }
  const output = rowIndex >= 0 ? [...(rows[rowIndex] || [])] : [];
  while (output.length < headers.length) output.push("");
  for (const [key] of config.fields) {
    if (record[key] !== undefined) output[mapping[key]] = record[key];
  }
  if (type !== "agents" && idIndex >= 0) output[idIndex] = String(keyValue);
  const rowNumber = rowIndex >= 0 ? rowIndex + 1 : rows.length + 1;
  const range = "A" + rowNumber + ":" + col(headers.length) + rowNumber;
  if (rowIndex >= 0) {
    await sheetsRequest(config.id, "/values/" + range + "?valueInputOption=RAW", {
      method: "PUT", body: JSON.stringify({ values: [output] })
    });
  } else {
    await sheetsRequest(config.id, "/values/A:Z:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS", {
      method: "POST", body: JSON.stringify({ values: [output] })
    });
  }
  return { ok: true, action: rowIndex >= 0 ? "updated" : "inserted", type };
}

module.exports = { syncRecord };