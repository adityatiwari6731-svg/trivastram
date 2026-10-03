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

// Qikink Configuration
const QIKINK_CONFIG = {
  CLIENT_ID: process.env.QIKINK_CLIENT_ID || "945377554359654",
  CLIENT_SECRET: process.env.QIKINK_CLIENT_SECRET || "81bdf9c8896f90a1189abd24950f631ad79c4fdeac8c99fe08ec30c77e2b1fb8",
  ENV: process.env.QIKINK_ENV || "sandbox" // "sandbox" or "live"
};

const QIKINK_BASE_URL = QIKINK_CONFIG.ENV === 'live' 
  ? 'https://api.qikink.com' 
  : 'https://sandbox.qikink.com';

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
 * Fetch fresh Qikink AccessToken using ClientId + ClientSecret
 */
async function getQikinkAccessToken() {
  const tokenUrl = `${QIKINK_BASE_URL}/api/token`;
  const params = new URLSearchParams();
  params.append('ClientId', QIKINK_CONFIG.CLIENT_ID);
  params.append('client_secret', QIKINK_CONFIG.CLIENT_SECRET);

  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString()
  });

  const data = await res.json();
  if (!res.ok || !data.Accesstoken) {
    throw new Error('Qikink Auth Failed: ' + JSON.stringify(data));
  }
  return data.Accesstoken;
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

      // 1. Obtain Access Token
      const accessToken = await getQikinkAccessToken();

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

      console.log('[Qikink Bridge] Sending Order to Qikink Open API:', `${QIKINK_BASE_URL}/api/order/create`, cleanOrderNumber);

      const qikinkRes = await fetch(`${QIKINK_BASE_URL}/api/order/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'ClientId': QIKINK_CONFIG.CLIENT_ID,
          'Accesstoken': accessToken
        },
        body: JSON.stringify(qikinkPayload)
      });

      const qikinkData = await qikinkRes.json();
      console.log('[Qikink Bridge] Qikink Response:', qikinkData);

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

    const accessToken = await getQikinkAccessToken();
    const trackUrl = `${QIKINK_BASE_URL}/api/order/track?order_id=${encodeURIComponent(qikinkOrderId)}`;

    const qkRes = await fetch(trackUrl, {
      headers: {
        'ClientId': QIKINK_CONFIG.CLIENT_ID,
        'Accesstoken': accessToken
      }
    });

    const data = await qkRes.json();
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

