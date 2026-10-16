"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = __dirname;
const API_BASE = (
  process.env.FC_API_BASE || "https://fabrica-de-calculos.app.trf3.jus.br"
).replace(/\/$/, "");
const API_KEY = process.env.FC_API_KEY || "";
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "127.0.0.1";
const BODY_LIMIT = 6 * 1024 * 1024; // inclui o envelope multipart; a API valida o arquivo .calc em 5 MB

function loadDotEnv() {
  const envPath = path.join(ROOT, ".env");
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (!match || match[1] in process.env) continue;
    let value = match[2];
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] = value;
  }
}
loadDotEnv();
const currentApiBase = (process.env.FC_API_BASE || API_BASE).replace(/\/$/, "");
const currentApiKey = process.env.FC_API_KEY || API_KEY;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
};

function sendJson(res, status, payload, extraHeaders = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    ...extraHeaders,
  });
  res.end(body);
}

function readBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on("data", (chunk) => {
      total += chunk.length;
      if (total > maxBytes) {
        reject(
          Object.assign(new Error("O arquivo enviado é muito grande."), {
            statusCode: 413,
          }),
        );
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function handleApi(req, res) {
  if (req.method === "GET" && req.url === "/api/health") {
    return sendJson(res, 200, {
      service: "Fábrica de Cálculos - cálculo de atrasados RGPS",
      apiKeyConfigured: Boolean(currentApiKey),
      endpoint: `${currentApiBase}/rgps/api/v1/calculos-atrasados/arquivo-calc/calcular`,
      requiresAuthorizedApiKey: true,
    });
  }

  if (req.method !== "POST" || req.url !== "/api/fabrica/calcular-atrasados") {
    return sendJson(res, 404, { message: "Rota não encontrada." });
  }
  if (!currentApiKey) {
    return sendJson(res, 503, {
      message:
        "Chave da API não configurada. Copie .env.example para .env e preencha FC_API_KEY com uma chave autorizada pela plataforma.",
      code: "API_KEY_NOT_CONFIGURED",
    });
  }

  const contentType = req.headers["content-type"] || "";
  if (
    !contentType.toLowerCase().startsWith("multipart/form-data;") ||
    !contentType.includes("boundary=")
  ) {
    return sendJson(res, 400, {
      message:
        'Envie um arquivo .calc usando multipart/form-data no campo "file".',
    });
  }

  let body;
  try {
    body = await readBody(req, BODY_LIMIT);
  } catch (error) {
    if (!res.headersSent && !res.writableEnded) {
      sendJson(res, error.statusCode || 400, {
        message: error.message || "Não foi possível ler o arquivo enviado.",
      });
    }
    return;
  }

  try {
    // Encaminha o mesmo multipart para a API, a credencial existe apenas no servidor.
    const upstream = await fetch(
      `${currentApiBase}/rgps/api/v1/calculos-atrasados/arquivo-calc/calcular`,
      {
        method: "POST",
        headers: {
          "content-type": contentType,
          "x-api-key": currentApiKey,
          accept: "application/json",
        },
        body,
        signal: AbortSignal.timeout(120000),
      },
    );
    const upstreamBody = Buffer.from(await upstream.arrayBuffer());
    const headers = {
      "Content-Type":
        upstream.headers.get("content-type") ||
        "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    };
    const retryAfter = upstream.headers.get("retry-after");
    if (retryAfter) headers["Retry-After"] = retryAfter;
    res.writeHead(upstream.status, headers);
    res.end(upstreamBody);
  } catch (error) {
    const isTimeout =
      error.name === "TimeoutError" || error.name === "AbortError";
    sendJson(res, isTimeout ? 504 : 502, {
      message: isTimeout
        ? "A API demorou demais para responder. Tente novamente mais tarde."
        : "Não foi possível conectar à API da Fábrica de Cálculos. Verifique a conexão e tente novamente.",
      code: isTimeout ? "API_TIMEOUT" : "API_CONNECTION_FAILED",
    });
  }
}

const server = http.createServer(async (req, res) => {
  const pathname = new URL(req.url, "http://localhost").pathname;
  if (pathname.startsWith("/api/")) return handleApi(req, res);
  if (req.method !== "GET" && req.method !== "HEAD") {
    return sendJson(
      res,
      405,
      { message: "Método não permitido." },
      { Allow: "GET, HEAD" },
    );
  }
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return sendJson(res, 400, { message: "Caminho inválido." });
  }
  const relativePath =
    decoded === "/" ? "index.html" : decoded.replace(/^\/+/, "");
  const publicFiles = new Set(["index.html", "style.css", "script.js"]);
  if (!publicFiles.has(relativePath))
    return sendJson(res, 404, { message: "Arquivo não encontrado." });
  const filePath = path.join(ROOT, relativePath);
  fs.stat(filePath, (statError, stat) => {
    if (statError || !stat.isFile())
      return sendJson(res, 404, { message: "Arquivo não encontrado." });
    const stream = fs.createReadStream(filePath);
    res.writeHead(200, {
      "Content-Type":
        MIME[path.extname(filePath).toLowerCase()] ||
        "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store",
    });
    if (req.method === "HEAD") return res.end();
    stream.on("error", () => {
      if (!res.headersSent)
        sendJson(res, 500, { message: "Falha ao ler o arquivo." });
      else res.destroy();
    });
    stream.pipe(res);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`Calculadora disponível em http://localhost:${PORT}`);
  if (!currentApiKey)
    console.warn(
      "FC_API_KEY não configurada. A interface local funciona, mas chamadas à API ficam desabilitadas.",
    );
});
