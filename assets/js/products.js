/**
 * TRIVASTRAM STREETWEAR - PRODUCT CATALOG DATASET
 * Built for Restless Minds | Streetwear
 * 100% Authentic Live Products Synced with Supabase & Qikink POD.
 * All fake/mock products removed.
 */

// Primary real catalog synced with Qikink & Supabase
const REAL_STORE_PRODUCTS = [
  {
    id: "04665e69-206d-4972-b2ca-a276b746a9bb",
    qikinkProductId: "UOSsMRnHs-Bk-XS",
    qikinkSku: "UOSsMRnHs-Bk-XS",
    name: "Unisex Oversized Standard T-Shirt",
    category: "oversized-tees",
    categoryLabel: "Oversized Tees",
    collection: "Streetwear",
    price: 699,
    mrp: 1000,
    discount: "30% OFF",
    rating: 4.9,
    reviewsCount: 148,
    badge: "BESTSELLER",
    badgeType: "badge-neon",
    fit: "Oversized Boxy Fit",
    gsm: "Heavyweight Combed Cotton",
    color: "Black",
    colors: ["Black", "Charcoal"],
    sizes: ["S", "M", "L", "XL", "XXL"],
    images: [
      "https://qikink-assets.s3.ap-south-1.amazonaws.com/clients/645759/clientProducts/32397189/images/Front_1_c_3.jpg"
    ],
    description: "Authentic streetwear flagship piece. Unisex Oversized Heavyweight Cotton T-Shirt. High density DTF screen print on heavyweight combed cotton with authentic dropped shoulder silhouette and durable ribbed collar. Fulfilled on-demand via Qikink POD.",
    specs: {
      "Fit": "Boxy Drop-Shoulder Oversized",
      "Fabric": "100% Combed Heavy Cotton",
      "Print": "DTF High-Density Screen Print",
      "Fulfillment": "Direct Print on Demand via Qikink",
      "Wash Care": "Machine wash cold inside out, do not iron directly on print"
    },
    featured: true,
    trending: true,
    bestseller: true
  }
];

// Load cached live products from localStorage or fall back to verified real products
function getInitialCatalog() {
  try {
    if (typeof localStorage !== 'undefined') {
      const cached = localStorage.getItem('kraal_cached_products');
      if (cached) {
        const parsed = JSON.parse(cached);
        // Purge any old fake product traces from cache
        const hasFakes = Array.isArray(parsed) && parsed.some(p => 
          p.id === 'trivastram-too-many-thoughts' || 
          p.id === 'trivastram-acid-wash-cyber-tee' ||
          p.id === 'trivastram-overthinker-boxy-hoodie' ||
          p.id === 'trivastram-tactical-parachute-cargo'
        );
        if (hasFakes) {
          localStorage.removeItem('kraal_cached_products');
        } else if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    }
  } catch (e) {
    console.warn("Could not read cached products:", e);
  }
  return REAL_STORE_PRODUCTS;
}

let TRIVASTRAM_PRODUCTS = getInitialCatalog();
let KRAAL_PRODUCTS = TRIVASTRAM_PRODUCTS; // Backwards compatibility


// Helper functions for filtering and lookup
function getProductById(id) {
  if (!id) return null;
  const found = KRAAL_PRODUCTS.find(item => 
    String(item.id) === String(id) || 
    String(item.qikinkProductId) === String(id) ||
    String(item.qikinkSku) === String(id)
  );
  // If an old fake ID was requested, gracefully fallback to the primary real drop
  if (!found && KRAAL_PRODUCTS.length > 0 && String(id).startsWith('trivastram-')) {
    return KRAAL_PRODUCTS[0];
  }
  return found || null;
}

function getProductsByCategory(category) {
  if (!category || category === "all") return KRAAL_PRODUCTS;
  return KRAAL_PRODUCTS.filter(item => item.category === category);
}

function searchProducts(query) {
  if (!query) return [];
  const q = query.toLowerCase().trim();
  return KRAAL_PRODUCTS.filter(item =>
    item.name.toLowerCase().includes(q) ||
    (item.categoryLabel && item.categoryLabel.toLowerCase().includes(q)) ||
    (item.fit && item.fit.toLowerCase().includes(q)) ||
    (item.color && item.color.toLowerCase().includes(q)) ||
    (item.collection && item.collection.toLowerCase().includes(q))
  );
}

// Automatically sync live products from Supabase (synced from Qikink)
async function loadLiveCatalogFromSupabase() {
  if (typeof window !== 'undefined' && window.kraalSupabase && window.kraalSupabase.isSupabaseConfigured()) {
    try {
      const liveItems = await window.kraalSupabase.fetchProductsFromSupabase();
      if (liveItems && liveItems.length > 0) {
        // ONLY use authentic products from Supabase - NO fake padding!
        KRAAL_PRODUCTS = liveItems;
        try {
          localStorage.setItem('kraal_cached_products', JSON.stringify(KRAAL_PRODUCTS));
        } catch (_) {}
        console.log("🔥 Loaded " + KRAAL_PRODUCTS.length + " real drop(s) from Supabase/Qikink!");
        window.dispatchEvent(new CustomEvent('trivastram:products-updated', { detail: { products: KRAAL_PRODUCTS } }));
      }
    } catch (e) {
      console.warn("Using verified real catalog fallback:", e);
    }
  }
  return KRAAL_PRODUCTS;
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    loadLiveCatalogFromSupabase();
  });
}
