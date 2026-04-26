/**
 * MasterHttpRelayVPN — CIDR-Exact Edition (Telegram-Aware + Cache + Retry)
 *
 * DEPLOY:
 * 1. Project Settings → Runtime: Google Apps Script V8
 * 2. Deploy → New deployment → Web app → Anyone
 * 3. Update /exec URL in your Python client config
 */

const AUTH_KEY    = "amirrezaisbest";
const WORKER_URL  = "https://xxxxxxxxxxxxxxxxxxxxxx.workers.dev";
const WORKER_AUTH = "CHANGE_TO_STRONG_WORKER_AUTH";
const DEBUG       = false;
const CACHE_TTL   = 15;
const MAX_RETRY   = 2;

const SKIP_HEADERS = {
  host: 1, connection: 1, "content-length": 1,
  "transfer-encoding": 1, "proxy-connection": 1, "proxy-authorization": 1,
  priority: 1, te: 1, "x-worker-auth": 1,
};

/* ─── Exact Telegram CIDRs (RIPE/BGP verified) ─── */
const TG_CIDRS = [
  "149.154.160.0/22", "149.154.164.0/22",
  "149.154.168.0/22", "149.154.172.0/22",
  "91.108.4.0/22",    "91.108.8.0/22",
  "91.108.56.0/22",   "95.161.64.0/20"
];

/* ─── Utils ─── */
function _log(msg) { if (DEBUG) console.log(msg); }
function _err(msg) { console.error(msg); }

function _ipToLong(ip) {
  var p = ip.split(".");
  return ((parseInt(p[0], 10) << 24) | (parseInt(p[1], 10) << 16) |
          (parseInt(p[2], 10) << 8)  |  parseInt(p[3], 10)) >>> 0;
}

function _isInCidr(ip, cidr) {
  var parts = cidr.split("/");
  var base  = _ipToLong(parts[0]);
  var ipL   = _ipToLong(ip);
  var bits  = parseInt(parts[1], 10);
  var mask  = bits === 0 ? 0 : (-1 << (32 - bits)) >>> 0;
  return (ipL & mask) === (base & mask);
}

function _isTelegramDC(url) {
  if (!url || typeof url !== "string") return false;
  try {
    var host = url.replace(/^https?:\/\//i, "").split("/")[0].split(":")[0];
    if (!/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return false;
    for (var i = 0; i < TG_CIDRS.length; i++) {
      if (_isInCidr(host, TG_CIDRS[i])) return true;
    }
    return false;
  } catch (e) { return false; }
}

function _mustBypassWorker(req) {
  if (Array.isArray(req.q)) {
    for (var i = 0; i < req.q.length; i++) {
      if (_isTelegramDC(req.q[i].u)) return true;
    }
    return false;
  }
  return _isTelegramDC(req.u);
}

/* ─── Cache ─── */
function _cacheKey(req) {
  var m = (req.m || "GET").toUpperCase();
  if (m !== "GET") return null;
  if (_isTelegramDC(req.u)) return null;
  var raw = m + "|" + (req.u || "") + "|" + (req.ct || "");
  var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, raw);
  return digest.map(function(b) {
    return (b < 0 ? b + 256 : b).toString(16).padStart(2, "0");
  }).join("");
}

function _cacheGet(req) {
  var key = _cacheKey(req);
  if (!key) return null;
  var hit = CacheService.getScriptCache().get(key);
  return hit ? JSON.parse(hit) : null;
}

function _cachePut(req, res) {
  var key = _cacheKey(req);
  if (!key || res.e) return;
  var payload = JSON.stringify(res);
  if (payload.length > 95000) return;
  CacheService.getScriptCache().put(key, payload, CACHE_TTL);
}

/* ─── Entry Points ─── */
function doPost(e) {
  _log("[Relay] Request at " + new Date().toISOString());
  try {
    if (!e.postData || !e.postData.contents) return _json({ e: "missing body" });
    var req = JSON.parse(e.postData.contents);
    if (req.k !== AUTH_KEY) return _json({ e: "unauthorized" });

    var isBatch = Array.isArray(req.q);

    if (!isBatch) {
      var cached = _cacheGet(req);
      if (cached) {
        _log("[Cache] Hit for " + req.u);
        return _json(cached);
      }
    }

    var bypass = _mustBypassWorker(req);

    if (!bypass) {
      try {
        var w = _callWorker(e.postData.contents);
        if (w.ok) {
          _log("[Relay] Worker success");
          if (!isBatch) _cachePut(req, w.data);
          return _json(w.data);
        }
        _log("[Relay] Worker failed (" + w.reason + "), fallback");
      } catch (err) {
        _err("[Relay] Worker exception: " + err);
      }
    } else {
      _log("[Relay] Bypassing Worker for Telegram DC");
    }

    if (isBatch) return _doBatch(req.q);
    var resultObj = _fetchDirect(req);
    _cachePut(req, resultObj);
    return _json(resultObj);

  } catch (fatal) {
    _err("[Relay] Fatal: " + fatal);
    return _json({ e: String(fatal) });
  }
}

function doGet(e) {
  var workerStatus = "Unknown";
  var workerLatency = "-";
  var workerDns = "-";
  
  try {
    var start = Date.now();
    var w = _callWorker(JSON.stringify({ k: AUTH_KEY, u: "https://1.1.1.1", m: "HEAD" }));
    workerLatency = (Date.now() - start) + "ms";
    workerStatus = w.ok ? "Online" : "Error: " + w.reason;
    workerDns = w.ok && w.data && w.data.h ? "Resolved" : "Unknown";
  } catch (ex) {
    workerStatus = "Unreachable: " + ex.message;
  }

  var html = "<!DOCTYPE html><html><head><meta charset='UTF-8'><style>" +
    "body{font-family:sans-serif;max-width:800px;margin:40px auto;padding:0 20px}" +
    "h2{color:#2c3e50} .ok{color:green} .err{color:red} .box{background:#f4f4f4;padding:15px;border-radius:8px;margin:10px 0}" +
    "code{background:#e8e8e8;padding:2px 6px;border-radius:4px;font-size:90%}" +
    "table{border-collapse:collapse;width:100%} td,th{border:1px solid #ddd;padding:8px;text-align:left}" +
    "th{background:#2c3e50;color:#fff}</style></head><body>" +
    "<h2>🚀 MasterHttpRelay CF Worker</h2>" +
    "<div class='box'>" +
    "<p><strong>Status:</strong> <span class='ok'>Active (CIDR-Optimized)</span></p>" +
    "<p><strong>Worker:</strong> <span class='" + (workerStatus === "Online" ? "ok" : "err") + "'>" + workerStatus + "</span></p>" +
    "<p><strong>Worker Latency:</strong> <code>" + workerLatency + "</code></p>" +
    "<p><strong>Server Time:</strong> " + new Date().toISOString() + "</p>" +
    "</div>" +
    "<div class='box'>" +
    "<h3>⚙️ Configuration</h3>" +
    "<table>" +
    "<tr><th>Setting</th><th>Value</th></tr>" +
    "<tr><td>DEBUG</td><td>" + DEBUG + "</td></tr>" +
    "<tr><td>CACHE_TTL</td><td>" + CACHE_TTL + "s</td></tr>" +
    "<tr><td>MAX_RETRY</td><td>" + MAX_RETRY + "</td></tr>" +
    "<tr><td>TG_CIDRS</td><td>" + TG_CIDRS.length + " subnets</td></tr>" +
    "</table></div>" +
    "<div class='box'>" +
    "<h3>🌐 Telegram CIDRs (Exact)</h3>" +
    "<ul>" + TG_CIDRS.map(function(c){ return "<li><code>" + c + "</code></li>"; }).join("") + "</ul>" +
    "</div>" +
    "<div class='box'>" +
    "<h3>📊 Cache</h3>" +
    "<p>Script cache is active. Max 100 KB per entry. Telegram traffic is never cached.</p>" +
    "</div>" +
    "</body></html>";

  return HtmlService.createHtmlOutput(html);
}

/* ─── Worker Bridge ─── */
function _callWorker(payload) {
  var opts = {
    method: "post",
    contentType: "application/json",
    payload: payload,
    muteHttpExceptions: true,
    headers: { "X-Worker-Auth": WORKER_AUTH }
  };
  var resp = UrlFetchApp.fetch(WORKER_URL, opts);
  var code = resp.getResponseCode();
  var text = resp.getContentText();

  if (code !== 200) return { ok: false, reason: "http:" + code };

  try {
    var data = JSON.parse(text);
    if (data.e) return { ok: false, reason: "err:" + data.e };
    if (data.s && data.s >= 400) return { ok: false, reason: "tgt:" + data.s };
    if (Array.isArray(data.q)) {
      for (var i = 0; i < data.q.length; i++) {
        var it = data.q[i];
        if (it.e || (it.s && it.s >= 400)) {
          return { ok: false, reason: "batch:" + (it.s || it.e) };
        }
      }
    }
    return { ok: true, data: data };
  } catch (e) {
    return { ok: false, reason: "json" };
  }
}

/* ─── Direct Fallback ─── */
function _fetchDirect(req) {
  if (!req.u || typeof req.u !== "string" || !/^https?:\/\//i.test(req.u)) {
    return { e: "bad url" };
  }
  try {
    var opts = _buildOpts(req);
    _log("[Direct] Fetching: " + req.u);
    var resp = _fetchRetry(req.u, opts);
    var code = resp.getResponseCode();
    var headers = _cleanHeaders(_respHeaders(resp));
    var bodyB64 = Utilities.base64Encode(resp.getContent());
    _log("[Direct] Response: " + code);
    return { s: code, h: headers, b: bodyB64 };
  } catch (err) {
    _err("[Direct] Error: " + err);
    return { e: String(err) };
  }
}

function _fetchRetry(url, opts) {
  var lastErr;
  for (var i = 0; i < MAX_RETRY; i++) {
    try {
      return UrlFetchApp.fetch(url, opts);
    } catch (e) {
      lastErr = e;
      if (i < MAX_RETRY - 1) Utilities.sleep(500 * (i + 1));
    }
  }
  throw lastErr;
}

function _doBatch(items) {
  var fetchList = [];
  var errMap = {};

  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    if (!it.u || typeof it.u !== "string" || !/^https?:\/\//i.test(it.u)) {
      errMap[i] = "bad url";
      continue;
    }
    var o = _buildOpts(it);
    o.url = it.u;
    fetchList.push({ idx: i, opt: o });
  }

  var responses = [];
  if (fetchList.length > 0) {
    try {
      responses = UrlFetchApp.fetchAll(fetchList.map(function (x) { return x.opt; }));
    } catch (allErr) {
      _err("[Direct] fetchAll failed, sequential fallback");
      for (var k = 0; k < fetchList.length; k++) {
        try {
          responses.push(UrlFetchApp.fetch(fetchList[k].opt.url, fetchList[k].opt));
        } catch (seqErr) {
          responses.push({
            getResponseCode: function () { return 0; },
            getContent: function () { return Utilities.newBlob("").getBytes(); },
            getHeaders: function () { return {}; }
          });
        }
      }
    }
  }

  var results = [];
  var rIdx = 0;
  for (var i = 0; i < items.length; i++) {
    if (errMap.hasOwnProperty(i)) {
      results.push({ e: errMap[i] });
      continue;
    }
    var resp = responses[rIdx++];
    try {
      results.push({
        s: resp.getResponseCode(),
        h: _cleanHeaders(_respHeaders(resp)),
        b: Utilities.base64Encode(resp.getContent()),
      });
    } catch (e) {
      results.push({ e: String(e) });
    }
  }
  return _json({ q: results });
}

/* ─── Helpers ─── */
function _buildOpts(req) {
  var opts = {
    method: (req.m || "GET").toUpperCase(),
    muteHttpExceptions: true,
    followRedirects: req.r !== false,
    validateHttpsCertificates: true,
  };

  if (req.h && typeof req.h === "object") {
    var clean = {};
    for (var k in req.h) {
      if (req.h.hasOwnProperty(k) && !SKIP_HEADERS[k.toLowerCase()]) {
        clean[k] = req.h[k];
      }
    }
    if (Object.keys(clean).length > 0) opts.headers = clean;
  }

  if (req.b && typeof req.b === "string" && req.b.length > 0) {
    try {
      opts.payload = Utilities.base64Decode(req.b);
      if (req.ct) opts.contentType = req.ct;
    } catch (decErr) {
      _err("[BuildOpts] Base64 decode failed: " + decErr);
      throw new Error("bad body");
    }
  }
  return opts;
}

function _cleanHeaders(headers) {
  var h = {};
  for (var k in headers) {
    if (!headers.hasOwnProperty(k)) continue;
    var kl = k.toLowerCase();
    if (kl === "content-encoding" || kl === "transfer-encoding") continue;
    h[k] = headers[k];
  }
  return h;
}

function _respHeaders(resp) {
  try { return resp.getHeaders(); } catch (e1) {
    try { return resp.getAllHeaders(); } catch (e2) { return {}; }
  }
}

function _json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}