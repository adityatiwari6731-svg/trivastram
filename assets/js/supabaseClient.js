/**
 * TRIVASTRAM STREETWEAR - SUPABASE & QIKINK INTEGRATION CLIENT
 * Handles:
 * 1. Fetching live products synced from Qikink (via Supabase `products` table)
 * 2. Automated checkout order saving & auto-dispatch to Qikink
 * 3. Real-time order tracking & AWB courier sync
 */

const KRAAL_SUPABASE_CONFIG = {
  URL: "https://fbhhuugexwgsgcgwmypi.supabase.co",
  ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZiaGh1dWdleHdnc2djZ3dteXBpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwMDg4NzAsImV4cCI6MjEwNTU4NDg3MH0.-loawnEmOpBzhArmgCZp3tM7mRYilHPkXkoesiKisAE"
};

const KRAAL_QIKINK_CONFIG = {
  CLIENT_ID: "945377554359654",
  CLIENT_SECRET: "592e7a2fdcbe2e04b7f016710f732a5e6591ba246e3a6b0abbfdbcd04436f4de",
  ENV: "live"     // "sandbox" for testing, "live" for production
};

let supabaseClient = null;

// Initialize Supabase Client
function getSupabaseClient() {
  if (supabaseClient) return supabaseClient;
  
  if (typeof window.supabase !== 'undefined' && 
      KRAAL_SUPABASE_CONFIG.URL !== "https://YOUR_SUPABASE_PROJECT_ID.supabase.co" &&
      KRAAL_SUPABASE_CONFIG.ANON_KEY !== "YOUR_SUPABASE_ANON_PUBLIC_KEY") {
    supabaseClient = window.supabase.createClient(
      KRAAL_SUPABASE_CONFIG.URL, 
      KRAAL_SUPABASE_CONFIG.ANON_KEY
    );
  }
  return supabaseClient;
}

function isSupabaseConfigured() {
  return KRAAL_SUPABASE_CONFIG.URL !== "https://YOUR_SUPABASE_PROJECT_ID.supabase.co" &&
         KRAAL_SUPABASE_CONFIG.ANON_KEY !== "YOUR_SUPABASE_ANON_PUBLIC_KEY";
}

/**
 * Fetch all active products synced from Qikink in Supabase
 */
async function fetchProductsFromSupabase() {
  const client = getSupabaseClient();
  if (!client) return null;

  try {
    const { data, error } = await client
      .from('products')
      .select('*, product_variants(*)')
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (error) {
      console.warn("Could not fetch products from Supabase:", error);
      return null;
    }

    if (data && data.length > 0) {
      // Map Supabase rows into TRIVASTRAM product format
      return data.map(p => ({
        id: p.id,
        qikinkProductId: p.qikink_product_id,
        name: p.name,
        category: p.category || 'oversized-tees',
        categoryLabel: p.category_label || 'Oversized Tees',
        price: Number(p.price),
        mrp: Number(p.mrp),
        discount: p.mrp > p.price ? Math.round(((p.mrp - p.price) / p.mrp) * 100) + "% OFF" : "BEST VALUE",
        rating: 4.8,
        reviewsCount: 120,
        badge: p.badge || "NEW DROP",
        badgeType: "badge-primary",
        fit: p.fit || "Oversized Fit",
        gsm: p.gsm || "Heavyweight Cotton",
        color: (p.colors && p.colors[0]) || "Charcoal",
        sizes: p.sizes || ["S", "M", "L", "XL", "XXL"],
        images: p.images && p.images.length > 0 ? p.images : ["https://images.unsplash.com/photo-1576566588028-4147f3842f27?auto=format&fit=crop&w=800&q=80"],
        description: p.description || "",
        specs: {
          "Fit": p.fit || "Super Oversized Drop-Shoulder",
          "Fabric": "100% Combed Heavy Cotton",
          "Fulfillment": "Direct Print on Demand via Qikink",
          "Wash Care": "Machine wash cold inside out, do not iron on print"
        },
        featured: p.featured,
        variants: p.product_variants || []
      }));
    }
    return null;
  } catch (err) {
    console.error("Error in fetchProductsFromSupabase:", err);
    return null;
  }
}

/**
 * Manually trigger Qikink Product Sync via Edge Function
 */
async function syncProductsFromQikink() {
  const client = getSupabaseClient();
  if (!client) {
    alert("Please configure your Supabase credentials in assets/js/supabaseClient.js first.");
    return false;
  }

  try {
    const res = await client.functions.invoke('sync-products');
    console.log("Qikink sync response:", res);
    return res.data;
  } catch (err) {
    console.error("Failed to trigger product sync:", err);
    throw err;
  }
}

/**
 * Saves a completed checkout order to Supabase & triggers auto-push to Qikink
 */
async function placeOrderWithBackend(orderData, items) {
  const client = getSupabaseClient();

  if (!client) {
    console.warn("⚠️ Supabase credentials not configured yet. Running in demo mode.");
    return {
      success: true,
      mode: 'mock',
      orderNumber: orderData.order_number,
      orderId: 'mock-' + Date.now()
    };
  }

  try {
    // Sanitize numeric fields to avoid constraint violations
    orderData.subtotal = Number(orderData.subtotal || orderData.grand_total || 0);
    orderData.grand_total = Number(orderData.grand_total || 0);
    orderData.discount = Number(orderData.discount || 0);
    orderData.shipping_fee = Number(orderData.shipping_fee || 0);

    // 1. Insert into public.orders table
    const { data: order, error: orderErr } = await client
      .from('orders')
      .insert([orderData])
      .select()
      .single();

    if (orderErr) {
      console.error("Error creating order record in Supabase:", orderErr);
      throw new Error(orderErr.message || "Database insert error: " + JSON.stringify(orderErr));
    }

    // 2. Insert line items
    const orderItems = items.map(item => ({
      order_id: order.id,
      product_id: String(item.id || item.product?.id || 'item'),
      product_name: item.product ? item.product.name : 'TRIVASTRAM Streetwear Piece',
      size: item.size || 'M',
      quantity: Number(item.quantity) || 1,
      unit_price: Number(item.product ? item.product.price : item.price) || 0,
      subtotal: Number(item.subtotalSelling || (item.product ? item.product.price * item.quantity : 0)),
      qikink_sku: item.product?.qikinkSku || (item.product?.variants && item.product.variants.find(v => v.size === item.size)?.qikink_sku) || null,
      design_front_url: item.product?.designFrontUrl || null,
      design_back_url: item.product?.designBackUrl || null
    }));

    const { error: itemsErr } = await client
      .from('order_items')
      .insert(orderItems);

    if (itemsErr) {
      console.error("Error saving order items:", itemsErr);
    }

    // 3. AUTOMATICALLY PUSH TO QIKINK
    if (KRAAL_QIKINK_CONFIG.CLIENT_ID && KRAAL_QIKINK_CONFIG.CLIENT_SECRET) {
      try {
        const qikinkRes = await pushOrderToQikinkAPI(order, orderItems);
        console.log("⚡ Qikink API Dispatch Response:", qikinkRes);

        if (qikinkRes && (qikinkRes.order_id || qikinkRes.status_code === "200")) {
          const qikinkId = String(qikinkRes.order_id || '');
          await client.from('orders').update({
            qikink_order_id: qikinkId,
            qikink_status: 'in_production',
            status: 'pushed_to_qikink',
            updated_at: new Date().toISOString()
          }).eq('id', order.id);
          console.log("✅ Order successfully synced to Qikink POD! ID:", qikinkId);
        }
      } catch (podErr) {
        console.warn("Qikink auto-dispatch notification:", podErr);
      }
    } else {
      console.log("ℹ️ Add your Qikink Client Secret in assets/js/supabaseClient.js to auto-send orders to Qikink.");
    }

    return {
      success: true,
      mode: 'live',
      orderNumber: order.order_number,
      orderId: order.id
    };

  } catch (error) {
    console.error("Order placement failed:", error);
    throw error;
  }
}

/**
 * Dispatch Order to Qikink Open API via TRIVASTRAM Server Bridge (Bypasses browser CORS & protects secret)
 */
async function pushOrderToQikinkAPI(order, lineItems, options = {}) {
  // Use relative bridge endpoint to work across localhost, remote preview domains, and production
  const bridgeUrl = '/api/qikink/push-order';

  try {
    const res = await fetch(bridgeUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        order, 
        lineItems,
        forceNewDispatch: !!options.forceNewDispatch
      })
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok && !data.already_exists) {
      throw new Error(data.error || data.message || `Server error (${res.status})`);
    }

    return data;

  } catch (fetchErr) {
    if (fetchErr.message && fetchErr.message.includes('Failed to fetch')) {
      throw new Error(
        "TRIVASTRAM POD Server Bridge is not running.\n\nPlease start the server by double-clicking 'start-server.bat' in your trivastram folder (or run 'node server.js')."
      );
    }
    throw fetchErr;
  }
}

/**
 * Fetch an order for tracking status
 */
async function getOrderByNumber(orderNumber) {
  const client = getSupabaseClient();
  if (!client) return null;

  const { data, error } = await client
    .from('orders')
    .select('*, order_items(*)')
    .eq('order_number', orderNumber.trim())
    .single();

  if (error) {
    console.error("Failed to fetch order:", error);
    return null;
  }
  return data;
}

window.trivastramSupabase = {
  getSupabaseClient,
  isSupabaseConfigured,
  fetchProductsFromSupabase,
  syncProductsFromQikink,
  placeOrderWithBackend,
  getOrderByNumber
};
window.kraalSupabase = window.trivastramSupabase;

