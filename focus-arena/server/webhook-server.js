#!/usr/bin/env node
/*
 * FOCUS ARENA — servidor opcional (Node puro, zero dependências).
 *
 * O que ele faz:
 *  1. Serve os arquivos estáticos do jogo (a pasta focus-arena/).
 *  2. Recebe o webhook da sua IA de leitura do WhatsApp:
 *       POST /api/whatsapp   body: { from, text, urgency: "low"|"normal"|"high" }
 *     e guarda numa fila em memória. O jogo busca via GET /api/whatsapp?since=<ts>.
 *  3. Faz proxy autenticado pro ClickUp em /api/clickup/* (resolve CORS e mantém
 *     o token só no servidor).
 *
 * Como rodar:
 *     CLICKUP_TOKEN=pk_xxx node server/webhook-server.js
 *     # depois abra http://localhost:4173
 *
 * Variáveis de ambiente (todas opcionais):
 *     PORT                     porta (default 4173)
 *     CLICKUP_TOKEN            token pessoal do ClickUp (habilita o proxy /api/clickup)
 *     WHATSAPP_SHARED_SECRET   se definido, exige header  x-fa-secret  no POST do webhook
 */
"use strict";

const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const PORT = process.env.PORT || 4173;
const CLICKUP_TOKEN = process.env.CLICKUP_TOKEN || "";
const WA_SECRET = process.env.WHATSAPP_SHARED_SECRET || "";
const ROOT = path.resolve(__dirname, "..");

// fila de mensagens do WhatsApp (em memória, cap 200)
let waQueue = [];

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-fa-secret");
}

function sendJson(res, code, obj) {
  cors(res);
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => { data += c; if (data.length > 1e6) req.destroy(); });
    req.on("end", () => resolve(data));
  });
}

// ---- proxy ClickUp ----
function proxyClickUp(req, res, restPath) {
  if (!CLICKUP_TOKEN) return sendJson(res, 501, { error: "CLICKUP_TOKEN não configurado no servidor" });
  readBody(req).then((body) => {
    const target = "https://api.clickup.com/api/v2/" + restPath;
    const u = new URL(target);
    const opts = {
      method: req.method,
      hostname: u.hostname,
      path: u.pathname + u.search,
      headers: { Authorization: CLICKUP_TOKEN, "Content-Type": "application/json" },
    };
    const preq = https.request(opts, (pres) => {
      cors(res);
      res.writeHead(pres.statusCode, { "Content-Type": "application/json; charset=utf-8" });
      pres.pipe(res);
    });
    preq.on("error", (e) => sendJson(res, 502, { error: "Falha no proxy ClickUp", detail: String(e) }));
    if (body && (req.method === "POST" || req.method === "PUT")) preq.write(body);
    preq.end();
  });
}

// ---- estáticos ----
function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === "/") rel = "/index.html";
  const filePath = path.join(ROOT, rel);
  // proteção contra path traversal
  if (!filePath.startsWith(ROOT)) { res.writeHead(403); return res.end("Forbidden"); }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); return res.end("Not found"); }
    cors(res);
    res.writeHead(200, { "Content-Type": MIME[path.extname(filePath)] || "application/octet-stream" });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://localhost");
  const p = u.pathname;

  if (req.method === "OPTIONS") { cors(res); res.writeHead(204); return res.end(); }

  // saúde
  if (p === "/api/health") return sendJson(res, 200, { ok: true, clickup: !!CLICKUP_TOKEN });

  // webhook WhatsApp — entrada (sua IA faz POST aqui)
  if (p === "/api/whatsapp" && req.method === "POST") {
    if (WA_SECRET && req.headers["x-fa-secret"] !== WA_SECRET) return sendJson(res, 401, { error: "secret inválido" });
    const body = await readBody(req);
    let msg = {};
    try { msg = JSON.parse(body || "{}"); } catch (e) { return sendJson(res, 400, { error: "JSON inválido" }); }
    const item = {
      id: "wa_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
      from: msg.from || msg.sender || "Desconhecido",
      text: msg.text || msg.body || msg.message || "",
      urgency: ["low", "normal", "high"].includes(msg.urgency) ? msg.urgency : "normal",
      ts: Date.now(),
    };
    waQueue.push(item);
    waQueue = waQueue.slice(-200);
    return sendJson(res, 200, { queued: true, id: item.id });
  }

  // webhook WhatsApp — leitura (o jogo busca por aqui)
  if (p === "/api/whatsapp" && req.method === "GET") {
    const since = Number(u.searchParams.get("since") || 0);
    const messages = waQueue.filter((m) => m.ts > since);
    return sendJson(res, 200, { messages });
  }

  // proxy ClickUp
  if (p.startsWith("/api/clickup/")) {
    return proxyClickUp(req, res, p.replace("/api/clickup/", "") + u.search);
  }

  // estáticos
  if (req.method === "GET") return serveStatic(req, res, p);

  res.writeHead(405); res.end("Method not allowed");
});

server.listen(PORT, () => {
  console.log("\n🎯 FOCUS ARENA rodando em  http://localhost:" + PORT);
  console.log("   ClickUp proxy:  " + (CLICKUP_TOKEN ? "ativo ✅" : "desativado (defina CLICKUP_TOKEN)"));
  console.log("   Webhook WhatsApp (POST):  http://localhost:" + PORT + "/api/whatsapp");
  console.log("   Secret do webhook: " + (WA_SECRET ? "exigido 🔒" : "não exigido"));
  console.log("");
});
