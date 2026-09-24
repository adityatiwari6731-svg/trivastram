// ==============================================================================
// SUPABASE EDGE FUNCTION: sync-products
// Deployed to: https://<PROJECT-REF>.supabase.co/functions/v1/sync-products
// ==============================================================================
// 1. Receives webhook pushes from Qikink when a new product is published.
// 2. OR can be invoked with GET / POST to fetch the latest catalog from Qikink API
//    and sync directly into the Supabase `products` & `product_variants` tables.
// ==============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

const QIKINK_API_URL = Deno.env.get("QIKINK_API_URL") || "https://api.qikink.com"
const QIKINK_CLIENT_ID = Deno.env.get("QIKINK_CLIENT_ID") || ""
const QIKINK_CLIENT_SECRET = Deno.env.get("QIKINK_CLIENT_SECRET") || ""

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS })
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  )

  try {
    let productsToSync = []

    // Check if request body contains a direct webhook payload from Qikink
    if (req.method === "POST") {
      try {
        const body = await req.json()
        if (body && (body.product || body.products || body.id)) {
          // Direct webhook payload
          productsToSync = Array.isArray(body.products) ? body.products : [body.product || body]
        }
      } catch (_) {
        // No JSON body, fallback to fetching from Qikink API
      }
    }

    // If no products in webhook body, fetch directly from Qikink API
    if (productsToSync.length === 0 && QIKINK_CLIENT_ID && QIKINK_CLIENT_SECRET) {
      console.log("Fetching live products from Qikink API...")
      const qikinkRes = await fetch(`${QIKINK_API_URL}/api/products`, {
        method: "GET",
        headers: {
          "client-id": QIKINK_CLIENT_ID,
          "client-secret": QIKINK_CLIENT_SECRET,
          "Accept": "application/json"
        }
      })

      if (qikinkRes.ok) {
        const qikinkData = await qikinkRes.json()
        productsToSync = qikinkData.products || qikinkData.data || []
      } else {
        console.warn("Could not fetch products from Qikink API:", await qikinkRes.text())
      }
    }

    if (productsToSync.length === 0) {
      return new Response(
        JSON.stringify({ message: "No products found to sync or credentials not yet configured." }),
        { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      )
    }

    const syncedResults = []

    // Upsert each product into Supabase
    for (const qp of productsToSync) {
      const qikinkId = String(qp.id || qp.product_id)
      const title = qp.name || qp.title || "KRAAL Graphic Drop"
      const slug = (qp.slug || title.toLowerCase().replace(/[^a-z0-9]+/g, "-")).replace(/(^-|-$)/g, "")
      
      // Extract images/mockups
      const images = []
      if (Array.isArray(qp.images)) {
        qp.images.forEach((img: any) => {
          if (typeof img === "string") images.push(img)
          else if (img.src) images.push(img.src)
          else if (img.url) images.push(img.url)
        })
      } else if (qp.image) {
        images.push(qp.image)
      }

      // Default price or calculate markup (e.g. Qikink base cost + ₹500 margin)
      const baseCost = Number(qp.base_price || qp.price || 499)
      const sellingPrice = qp.selling_price || (baseCost + 500)
      const mrp = qp.mrp || (sellingPrice + 700)

      // Sizes
      const sizes = qp.sizes || ["S", "M", "L", "XL", "XXL"]

      // 1. Upsert into public.products
      const { data: productRow, error: pErr } = await supabase
        .from("products")
        .upsert({
          qikink_product_id: qikinkId,
          name: title,
          slug: slug,
          category: qp.category || "oversized-tees",
          category_label: qp.category_label || "Oversized Tees",
          description: qp.description || "Authentic heavy-GSM streetwear piece designed for the modern underground.",
          price: sellingPrice,
          mrp: mrp,
          qikink_base_price: baseCost,
          images: images.length > 0 ? images : ["https://images.unsplash.com/photo-1576566588028-4147f3842f27?auto=format&fit=crop&w=800&q=80"],
          sizes: sizes,
          gsm: qp.gsm || "240 GSM Heavyweight Cotton",
          fit: qp.fit || "Oversized Fit",
          is_active: true,
          updated_at: new Date().toISOString()
        }, { onConflict: "qikink_product_id" })
        .select()
        .single()

      if (pErr) {
        console.error("Error upserting product:", pErr)
        continue
      }

      // 2. Upsert variants if available
      if (Array.isArray(qp.variants) && qp.variants.length > 0) {
        for (const v of qp.variants) {
          await supabase
            .from("product_variants")
            .upsert({
              product_id: productRow.id,
              qikink_variant_id: String(v.id || v.variant_id),
              qikink_sku: v.sku || `${qikinkId}-${v.size || 'M'}`,
              size: v.size || "M",
              color: v.color || "Charcoal",
              inventory_count: v.inventory_count || 999,
              is_available: true
            })
        }
      }

      syncedResults.push({ id: productRow.id, name: productRow.name })
    }

    return new Response(
      JSON.stringify({
        success: true,
        syncedCount: syncedResults.length,
        products: syncedResults
      }),
      { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    )

  } catch (error) {
    console.error("Sync error:", error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    )
  }
})
