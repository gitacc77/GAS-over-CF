/**
 * MasterHttpRelayVPN — Cloudflare Worker Engine
 *
 * این Worker درخواست‌های relay شده از Google Apps Script را پردازش می‌کند.
 * دو حالت را پشتیبانی می‌کند:
 * 1. Single:  { k, m, u, h, b, ct, r } → { s, h, b }
 * 2. Batch:   { k, q: [{...}, ...] }   → { q: [{s,h,b}, ...] }
 *
 * امنیت: فقط درخواست‌هایی که Header "X-Worker-Auth" صحیح دارند پذیرفته می‌شوند.
 */

const WORKER_AUTH = "CHANGE_TO_STRONG_WORKER_AUTH"

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

async function handleRequest(request) {
  if (request.method !== "POST") {
    return jsonResponse({ e: "method not allowed" }, 405)
  }

  // بررسی احراز هویت Worker
  const workerAuth = request.headers.get("X-Worker-Auth")
  if (workerAuth !== WORKER_AUTH) {
    return jsonResponse({ e: "unauthorized worker" }, 403)
  }

  try {
    const req = await request.json()
    
    // Batch mode
    if (Array.isArray(req.q)) {
      return await handleBatch(req.q)
    }
    
    // Single mode
    return await handleSingle(req)
  } catch (err) {
    return jsonResponse({ e: String(err) })
  }
}

async function handleSingle(req) {
  if (!req.u || typeof req.u !== "string" || !req.u.match(/^https?:\/\//i)) {
    return jsonResponse({ e: "bad url" })
  }
  
  try {
    const result = await fetchTarget(req)
    return jsonResponse(result)
  } catch (err) {
    return jsonResponse({ e: String(err) })
  }
}

async function handleBatch(items) {
  // اجرای parallel تمام درخواست‌های batch با Promise.all
  const results = await Promise.all(
    items.map(async (item) => {
      if (!item.u || typeof item.u !== "string" || !item.u.match(/^https?:\/\//i)) {
        return { e: "bad url" }
      }
      try {
        return await fetchTarget(item)
      } catch (err) {
        return { e: String(err) }
      }
    })
  )
  
  return jsonResponse({ q: results })
}

async function fetchTarget(req) {
  const url = req.u
  const method = (req.m || "GET").toUpperCase()
  
  const headers = new Headers()
  const skipHeaders = new Set([
    'host', 'connection', 'content-length', 'transfer-encoding',
    'proxy-connection', 'proxy-authorization', 'priority', 'te'
  ])
  
  // اضافه کردن headerهای دریافتی از کلاینت (به جز موارد ممنوعه)
  if (req.h && typeof req.h === 'object') {
    for (const [key, value] of Object.entries(req.h)) {
      if (!skipHeaders.has(key.toLowerCase())) {
        headers.set(key, value)
      }
    }
  }

  const init = {
    method: method,
    redirect: req.r !== false ? 'follow' : 'manual',
    headers: headers
  }

  // اضافه کردن body در صورت وجود
  if (req.b) {
    init.body = base64ToUint8Array(req.b)
    if (req.ct) {
      headers.set('Content-Type', req.ct)
    }
  }

  // اجرای fetch واقعی
  const response = await fetch(url, init)
  
  // استخراج headerهای پاسخ (با حفظ Set-Cookie چندگانه)
  const respHeaders = {}
  
  if (response.headers.getSetCookie) {
    const setCookies = response.headers.getSetCookie()
    if (setCookies.length > 0) {
      respHeaders['Set-Cookie'] = setCookies
    }
  }
  
  response.headers.forEach((value, key) => {
    if (key.toLowerCase() !== 'set-cookie') {
      respHeaders[key] = value
    }
  })

  // خواندن و encode کردن body
  const bodyBuffer = await response.arrayBuffer()
  const bodyBase64 = arrayBufferToBase64(bodyBuffer)

  return {
    s: response.status,
    h: respHeaders,
    b: bodyBase64
  }
}

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status: status,
    headers: { 'Content-Type': 'application/json' }
  })
}

function base64ToUint8Array(base64) {
  const binaryString = atob(base64)
  const bytes = new Uint8Array(binaryString.length)
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }
  return bytes
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}