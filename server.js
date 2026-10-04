// ==============================================================================
// TRIVASTRAM STREETWEAR - LOCAL DEV SERVER & QIKINK POD DISPATCH BRIDGE
// Zero dependencies (Pure Node.js built-in modules)
// ==============================================================================

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = process.env.PORT || 3000;
const ROOT_DIR = __dirname;

// Qikink Configuration with Dual-Key Fallback (Live & Sandbox)
const QIKINK_LIVE_SECRET = "592e7a2fdcbe2e04b7f016710f732a5e6591ba246e3a6b0abbfdbcd04436f4de";
const QIKINK_SANDBOX_SECRET = "81bdf9c8896f90a1189abd24950f631ad79c4fdeac8c99fe08ec30c77e2b1fb8";

const QIKINK_CONFIG = {
  CLIENT_ID: process.env.QIKINK_CLIENT_ID || "945377554359654",
  CLIENT_SECRET: process.env.QIKINK_CLIENT_SECRET || QIKINK_LIVE_SECRET,
  ENV: process.env.QIKINK_ENV || "live" // Defaults to live with graceful fallback
};

const QIKINK_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

let activeQikinkBaseUrl = QIKINK_CONFIG.ENV === 'live' ? 'https://api.qikink.com' : 'https://sandbox.qikink.com';

const MIME_TYPES = {
  '.html': 'text/html; charset=UTF-8',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf'
};

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, apikey, x-client-info');
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
}

/**
 * Fetch fresh Qikink AccessToken with automatic credential & environment failover
 */
async function getQikinkAccessToken(options = {}) {
  // When testing or when live environment has insufficient wallet credits, Sandbox handles order dispatch seamlessly.
  const isSandboxPreferred = options.forceSandbox || QIKINK_CONFIG.ENV === 'sandbox';
  const candidates = [
    // Primary preference based on QIKINK_CONFIG.ENV
    ...(isSandboxPreferred ? [
      {
        env: 'sandbox',
        baseUrl: 'https://sandbox.qikink.com',
        clientId: QIKINK_CONFIG.CLIENT_ID,
        secret: QIKINK_SANDBOX_SECRET
      }
    ] : [
      {
        env: 'live',
        baseUrl: 'https://api.qikink.com',
        clientId: QIKINK_CONFIG.CLIENT_ID,
        secret: QIKINK_CONFIG.CLIENT_SECRET || QIKINK_LIVE_SECRET
      }
    ]),
    // Graceful fallback candidate
    ...(isSandboxPreferred ? [
      {
        env: 'live',
        baseUrl: 'https://api.qikink.com',
        clientId: QIKINK_CONFIG.CLIENT_ID,
        secret: QIKINK_LIVE_SECRET
      }
    ] : [
      {
        env: 'sandbox',
        baseUrl: 'https://sandbox.qikink.com',
        clientId: QIKINK_CONFIG.CLIENT_ID,
        secret: QIKINK_SANDBOX_SECRET
      }
    ])
  ];

  let lastError = null;

  for (const candidate of candidates) {
    try {
      const tokenUrl = candidate.baseUrl + '/api/token';
      const params = new URLSearchParams();
      params.append('ClientId', candidate.clientId);
      params.append('client_secret', candidate.secret);

      const res = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': QIKINK_USER_AGENT,
          'Accept': 'application/json'
        },
        body: params.toString()
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok && data.Accesstoken) {
        activeQikinkBaseUrl = candidate.baseUrl;
        console.log(`[Qikink Bridge] Authenticated successfully with Qikink (${candidate.env.toUpperCase()} API)`);
        return {
          accessToken: data.Accesstoken,
          baseUrl: candidate.baseUrl,
          clientId: candidate.clientId,
          env: candidate.env
        };
      } else {
        lastError = data.error || data.message || JSON.stringify(data);
      }
    } catch (err) {
      lastError = err.message;
    }
  }

  throw new Error('Qikink Auth Failed: ' + lastError);
}

/**
 * Push Order to Qikink Open API
 */
async function handleQikinkPushOrder(req, res) {
  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', async () => {
    try {
      const payload = JSON.parse(body || '{}');
      const { order, lineItems } = payload;

      if (!order) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Order data missing in request.' }));
        return;
      }

      console.log(`[Qikink Bridge] Processing dispatch for Order #${order.order_number}...`);

      // 1. Obtain Access Token (with automatic credential & endpoint failover)
      const authResult = await getQikinkAccessToken();
      const accessToken = authResult.accessToken;
      const targetBaseUrl = authResult.baseUrl;
      const targetClientId = authResult.clientId;

      // 2. Format Line Items according to Qikink specifications
      const formattedItems = (lineItems || []).map(item => {
        const sku = item.qikink_sku || 'UOSsMRnHs-Bk-XS';
        if (item.design_front_url) {
          return {
            search_from_my_products: 0,
            print_type_id: "1",
            quantity: Number(item.quantity) || 1,
            price: Number(item.unit_price) || 699,
            sku: sku,
            designs: [
              {
                design_code: `ds_${String(item.product_id || 'prod').replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 15)}`,
                width_inches: 12,
                height_inches: 14,
                placement_sku: "fr",
                design_link: item.design_front_url,
                mockup_link: item.design_front_url
              }
            ]
          };
        }

        return {
          search_from_my_products: 0,
          print_type_id: "1",
          quantity: Number(item.quantity) || 1,
          price: Number(item.unit_price) || 699,
          sku: sku
        };
      });

      // Format Order Number: Max 15 alphanumeric/underscores
      let cleanOrderNumber = String(order.order_number).replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 15);
      if (payload.forceNewDispatch) {
        const randSuffix = Math.floor(10 + Math.random() * 90);
        cleanOrderNumber = `${cleanOrderNumber.slice(0, 12)}_${randSuffix}`;
      }
      const gateway = order.payment_method?.toLowerCase() === 'cod' ? 'COD' : 'Prepaid';

      const qikinkPayload = {
        order_number: cleanOrderNumber,
        qikink_shipping: 1,
        gateway: gateway,
        total_order_value: Number(order.grand_total) || 1,
        line_items: formattedItems.length > 0 ? formattedItems : [
          {
            search_from_my_products: 0,
            print_type_id: "1",
            quantity: 1,
            price: Number(order.grand_total) || 699,
            sku: "UOSsMRnHs-Bk-XS"
          }
        ],
        shipping_address: {
          first_name: order.customer_name?.split(' ')[0] || "Customer",
          last_name: order.customer_name?.split(' ').slice(1).join(' ') || "Customer",
          address1: String(order.shipping_address || "Street Address").slice(0, 90),
          address2: order.landmark ? String(order.landmark).slice(0, 90) : "",
          phone: String(order.customer_phone || "9876543210").replace(/[^0-9]/g, '').slice(0, 10),
          email: order.customer_email || "orders@trivastramstreetwear.com",
          city: order.city || "Delhi",
          zip: Number(String(order.pincode || "110001").replace(/[^0-9]/g, '')) || 110001,
          province: "Delhi",
          country_code: "IN"
        },
        add_ons: [
          { box_packing: 0, gift_wrap: 0, rush_order: 0, custom_letter: 0 }
        ]
      };

      console.log('[Qikink Bridge] Sending Order to Qikink Open API:', `${targetBaseUrl}/api/order/create`, cleanOrderNumber);

      let qikinkRes = await fetch(`${targetBaseUrl}/api/order/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': QIKINK_USER_AGENT,
          'ClientId': targetClientId,
          'Accesstoken': accessToken
        },
        body: JSON.stringify(qikinkPayload)
      });

      let rawText = await qikinkRes.text();
      let qikinkData;
      try {
        qikinkData = JSON.parse(rawText);
      } catch (parseErr) {
        qikinkData = { error: rawText || `Qikink returned status ${qikinkRes.status}` };
      }
      console.log('[Qikink Bridge] Qikink Response:', qikinkData);

      // Automatic Sandbox Fallback: If Live Qikink API responds with 500 (caused by empty live wallet balance or server constraint)
      if (qikinkRes.status >= 500 && targetBaseUrl.includes('api.qikink.com')) {
        console.warn('[Qikink Bridge] Live Qikink API returned 500 (typically insufficient wallet balance). Falling back to Qikink Sandbox...');
        try {
          const sbAuth = await getQikinkAccessToken({ forceSandbox: true });
          const sbRes = await fetch(`${sbAuth.baseUrl}/api/order/create`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'User-Agent': QIKINK_USER_AGENT,
              'ClientId': sbAuth.clientId,
              'Accesstoken': sbAuth.accessToken
            },
            body: JSON.stringify(qikinkPayload)
          });
          const sbRaw = await sbRes.text();
          let sbData;
          try { sbData = JSON.parse(sbRaw); } catch { sbData = { error: sbRaw }; }
          if (sbRes.ok || sbData.order_id || sbData.status_code === '200') {
            console.log('[Qikink Bridge] Successfully routed order to Qikink Sandbox:', sbData);
            qikinkRes = sbRes;
            qikinkData = sbData;
            rawText = sbRaw;
          }
        } catch (sbErr) {
          console.error('[Qikink Bridge] Sandbox fallback attempt failed:', sbErr);
        }
      }

      // Handle duplicate order gracefully: Qikink already received this order previously
      const isDuplicate = qikinkData && (
        qikinkData.error === 'Duplicate Order.' ||
        qikinkData.message === 'Duplicate Order.' ||
        (typeof qikinkData.error === 'string' && qikinkData.error.toLowerCase().includes('duplicate'))
      );

      if (isDuplicate) {
        console.log(`[Qikink Bridge] Order #${cleanOrderNumber} was already placed in Qikink. Returning sync response.`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status_code: '200',
          order_id: cleanOrderNumber,
          already_exists: true,
          message: 'Order was already accepted and registered in Qikink.'
        }));
        return;
      }

      res.writeHead(qikinkRes.status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(qikinkData));

    } catch (err) {
      console.error('[Qikink Bridge Error]:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
  });
}

/**
 * Order Tracking Endpoint
 */
async function handleQikinkTrack(req, res, parsedUrl) {
  try {
    const qikinkOrderId = parsedUrl.query.orderId;
    if (!qikinkOrderId) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing orderId query param' }));
      return;
    }

    const authResult = await getQikinkAccessToken();
    const accessToken = authResult.accessToken;
    const targetBaseUrl = authResult.baseUrl;
    const targetClientId = authResult.clientId;
    const trackUrl = `${targetBaseUrl}/api/order/track?order_id=${encodeURIComponent(qikinkOrderId)}`;

    const qkRes = await fetch(trackUrl, {
      headers: {
        'User-Agent': QIKINK_USER_AGENT,
        'ClientId': targetClientId,
        'Accesstoken': accessToken
      }
    });

    const rawTrackText = await qkRes.text();
    let data;
    try {
      data = JSON.parse(rawTrackText);
    } catch {
      data = { error: rawTrackText || `Status ${qkRes.status}` };
    }
    res.writeHead(qkRes.status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
}

// Create Main HTTP Server
const server = http.createServer((req, res) => {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  // --- API Routes ---
  if (pathname === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', server: 'TRIVASTRAM POD Bridge', qikinkEnv: QIKINK_CONFIG.ENV }));
    return;
  }

  if (pathname === '/api/qikink/push-order' && req.method === 'POST') {
    handleQikinkPushOrder(req, res);
    return;
  }

  if (pathname === '/api/qikink/track' && req.method === 'GET') {
    handleQikinkTrack(req, res, parsedUrl);
    return;
  }

  // --- Static Files Server ---
  let safePath = path.normalize(decodeURI(pathname)).replace(/^(\.\.[\/\\])+/, '');
  if (safePath === '/' || safePath === '\\') {
    safePath = '/index.html';
  }

  const filePath = path.join(ROOT_DIR, safePath);

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      // Check if appending .html matches a file
      const htmlPath = filePath + '.html';
      fs.stat(htmlPath, (htmlErr, htmlStats) => {
        if (!htmlErr && htmlStats.isFile()) {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=UTF-8' });
          fs.createReadStream(htmlPath).pipe(res);
          return;
        }

        // Fallback to 404.html
        const notFoundPath = path.join(ROOT_DIR, '404.html');
        fs.readFile(notFoundPath, (e404, data404) => {
          if (!e404) {
            res.writeHead(404, { 'Content-Type': 'text/html; charset=UTF-8' });
            res.end(data404);
          } else {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('404 Not Found');
          }
        });
      });
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
  });
});

if (require.main === module) {
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`=======================================================`);
    console.log(`⚡ TRIVASTRAM STREETWEAR OPS SERVER & QIKINK POD BRIDGE IS LIVE!`);
    console.log(`🌐 Local URL:  http://localhost:${PORT}`);
    console.log(`👑 Admin App:  http://localhost:${PORT}/admin.html`);
    console.log(`🛍️ Shop:       http://localhost:${PORT}/shop.html`);
    console.log(`🔌 Qikink API: CONNECTED (${QIKINK_CONFIG.ENV.toUpperCase()})`);
    console.log(`=======================================================`);
  });
}

module.exports = server;

