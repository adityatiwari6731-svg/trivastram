// ==============================================================================
// SUPABASE EDGE FUNCTION: create-qikink-order
// Official Qikink Open API Specification (2026 Release)
// ==============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

// Environments:
// Sandbox: https://sandbox.qikink.com
// Live:    https://api.qikink.com
const QIKINK_ENV = Deno.env.get("QIKINK_ENV") || "sandbox" // "sandbox" or "live"
const QIKINK_BASE_URL = QIKINK_ENV === "live" ? "https://api.qikink.com" : "https://sandbox.qikink.com"
const QIKINK_CLIENT_ID = Deno.env.get("QIKINK_CLIENT_ID") || ""
const QIKINK_CLIENT_SECRET = Deno.env.get("QIKINK_CLIENT_SECRET") || ""

/**
 * Step 1: Obtain Qikink AccessToken via POST /api/token (x-www-form-urlencoded)
 */
async function getQikinkAccessToken(clientId: string, clientSecret: string): Promise<string> {
  const tokenUrl = `${QIKINK_BASE_URL}/api/token`
  const params = new URLSearchParams()
  params.append("ClientId", clientId)
  params.append("client_secret", clientSecret)

  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: params.toString()
  })

  const data = await res.json()
  if (!res.ok || !data.Accesstoken) {
    throw new Error(`Qikink Token Auth failed: ${JSON.stringify(data)}`)
  }
  return data.Accesstoken
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS })
  }

  try {
    const { orderId } = await req.json()
    if (!orderId) {
      return new Response(JSON.stringify({ error: "Missing orderId" }), { status: 400, headers: CORS_HEADERS })
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    )

    // 1. Fetch order from Supabase
    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .select("*, order_items(*)")
      .eq("id", orderId)
      .single()

    if (orderErr || !order) {
      return new Response(JSON.stringify({ error: "Order not found", details: orderErr }), { status: 404, headers: CORS_HEADERS })
    }

    // Format Order Number: Max 15 chars, letters, numbers, and underscore only
    const cleanOrderNumber = String(order.order_number).replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 15)

    // Gateway: Exactly 'COD' or 'Prepaid' (case-sensitive)
    const gateway = order.payment_method?.toLowerCase() === "cod" ? "COD" : "Prepaid"

    // 2. Build line_items according to Qikink Open API specifications
    const lineItems = order.order_items.map((item: any) => {
      // If product was designed in Qikink dashboard, use search_from_my_products = 1
      if (item.qikink_sku && !item.design_front_url) {
        return {
          search_from_my_products: 1,
          quantity: Number(item.quantity) || 1,
          price: Number(item.unit_price) || 999,
          sku: item.qikink_sku
        }
      }

      // If supplying custom print graphics dynamically (search_from_my_products = 0)
      if (item.design_front_url) {
        return {
          search_from_my_products: 0,
          print_type_id: "1", // 1 = DTG, 17 = DTF
          quantity: Number(item.quantity) || 1,
          price: Number(item.unit_price) || 999,
          sku: item.qikink_sku || "MVnHs-Wh-S",
          designs: [
            {
              design_code: `ds_${String(item.product_id).replace(/[^a-zA-Z0-9_]/g, "").slice(0, 15)}`,
              width_inches: 12,
              height_inches: 14,
              placement_sku: "fr", // 'fr' = front, 'bk' = back
              design_link: item.design_front_url,
              mockup_link: item.design_front_url
            }
          ]
        }
      }

      // Plain garment without print
      return {
        search_from_my_products: 0,
        print_type_id: "1",
        quantity: Number(item.quantity) || 1,
        price: Number(item.unit_price) || 999,
        sku: item.qikink_sku || "MVnHs-Wh-S"
      }
    })

    // 3. Build Qikink payload
    const qikinkPayload = {
      order_number: cleanOrderNumber,
      qikink_shipping: 1, // 1 = Qikink handles shipping
      gateway: gateway,
      total_order_value: Number(order.grand_total) || 1,
      line_items: lineItems,
      shipping_address: {
        first_name: order.customer_name?.split(" ")[0] || "Customer",
        last_name: order.customer_name?.split(" ").slice(1).join(" ") || "Customer",
        address1: String(order.shipping_address).slice(0, 90),
        address2: order.landmark ? String(order.landmark).slice(0, 90) : "",
        phone: String(order.customer_phone).replace(/[^0-9]/g, "").slice(0, 10),
        email: order.customer_email || "orders@kraalstreetwear.com",
        city: order.city || "Mumbai",
        zip: Number(String(order.pincode).replace(/[^0-9]/g, "")) || 400050,
        province: "Maharashtra", // State name
        country_code: "IN"
      },
      add_ons: [
        {
          box_packing: 0,
          gift_wrap: 0,
          rush_order: 0,
          custom_letter: 0
        }
      ]
    }

    console.log("Submitting Qikink Order to:", `${QIKINK_BASE_URL}/api/order/create`, qikinkPayload)

    // 4. Authenticate & Dispatch to Qikink
    let qikinkData: any = null
    if (QIKINK_CLIENT_ID && QIKINK_CLIENT_SECRET) {
      // Get AccessToken
      const accessToken = await getQikinkAccessToken(QIKINK_CLIENT_ID, QIKINK_CLIENT_SECRET)

      // Post Order
      const qikinkRes = await fetch(`${QIKINK_BASE_URL}/api/order/create`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "ClientId": QIKINK_CLIENT_ID,
          "Accesstoken": accessToken
        },
        body: JSON.stringify(qikinkPayload)
      })

      qikinkData = await qikinkRes.json()
      console.log("Qikink Order Response:", qikinkData)

      if (qikinkRes.ok && qikinkData.order_id) {
        await supabase
          .from("orders")
          .update({
            qikink_order_id: String(qikinkData.order_id),
            qikink_status: "in_production",
            status: "pushed_to_qikink",
            updated_at: new Date().toISOString()
          })
          .eq("id", order.id)
      } else {
        console.error("Qikink rejected order:", qikinkData)
      }
    } else {
      qikinkData = { simulation: true, message: "Add QIKINK_CLIENT_ID & QIKINK_CLIENT_SECRET to activate live dispatch" }
    }

    return new Response(JSON.stringify({ success: true, qikink: qikinkData }), {
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
    })

  } catch (err) {
    console.error("Error creating Qikink order:", err)
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: CORS_HEADERS })
  }
})
