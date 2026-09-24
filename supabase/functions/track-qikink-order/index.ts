// ==============================================================================
// SUPABASE EDGE FUNCTION: track-qikink-order
// Official Qikink Open API: GET /api/order/list?order_reference_no=...
// ==============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

const QIKINK_ENV = Deno.env.get("QIKINK_ENV") || "sandbox"
const QIKINK_BASE_URL = QIKINK_ENV === "live" ? "https://api.qikink.com" : "https://sandbox.qikink.com"
const QIKINK_CLIENT_ID = Deno.env.get("QIKINK_CLIENT_ID") || ""
const QIKINK_CLIENT_SECRET = Deno.env.get("QIKINK_CLIENT_SECRET") || ""

async function getQikinkAccessToken(clientId: string, clientSecret: string): Promise<string> {
  const tokenUrl = `${QIKINK_BASE_URL}/api/token`
  const params = new URLSearchParams()
  params.append("ClientId", clientId)
  params.append("client_secret", clientSecret)

  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString()
  })

  const data = await res.json()
  return data.Accesstoken
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS })
  }

  try {
    const { orderNumber } = await req.json()
    if (!orderNumber) {
      return new Response(JSON.stringify({ error: "Missing orderNumber" }), { status: 400, headers: CORS_HEADERS })
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    )

    const cleanOrderNumber = String(orderNumber).replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 15)

    let qikinkOrderData: any = null

    if (QIKINK_CLIENT_ID && QIKINK_CLIENT_SECRET) {
      const accessToken = await getQikinkAccessToken(QIKINK_CLIENT_ID, QIKINK_CLIENT_SECRET)

      const trackUrl = `${QIKINK_BASE_URL}/api/order/list?order_reference_no=${encodeURIComponent(cleanOrderNumber)}`
      const res = await fetch(trackUrl, {
        method: "GET",
        headers: {
          "ClientId": QIKINK_CLIENT_ID,
          "Accesstoken": accessToken
        }
      })

      const listResult = await res.json()
      if (listResult.success && listResult.data && listResult.data.length > 0) {
        qikinkOrderData = listResult.data[0]

        // Update Supabase DB with latest tracking details from Qikink
        const awb = qikinkOrderData.shipping?.awb
        const courier = qikinkOrderData.shipping?.courier_provider_name
        const trackingLink = qikinkOrderData.shipping?.tracking_link
        const qikinkStatus = qikinkOrderData.status

        let internalStatus = "in_production"
        if (qikinkStatus === "Delivered") internalStatus = "delivered"
        else if (["In-Transit", "Manifested", "PIcked Up", "Dispatch Ready"].includes(qikinkStatus)) internalStatus = "shipped"

        await supabase
          .from("orders")
          .update({
            status: internalStatus,
            qikink_status: qikinkStatus,
            tracking_number: awb || null,
            courier_name: courier || null,
            tracking_url: trackingLink || null,
            updated_at: new Date().toISOString()
          })
          .eq("order_number", orderNumber)
      }
    }

    // Fetch the updated order from Supabase
    const { data: dbOrder } = await supabase
      .from("orders")
      .select("*, order_items(*)")
      .eq("order_number", orderNumber)
      .single()

    return new Response(JSON.stringify({ success: true, order: dbOrder, qikink: qikinkOrderData }), {
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
    })

  } catch (err) {
    console.error("Tracking fetch error:", err)
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: CORS_HEADERS })
  }
})
