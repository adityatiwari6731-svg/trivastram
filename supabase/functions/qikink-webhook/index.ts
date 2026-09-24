// ==============================================================================
// SUPABASE EDGE FUNCTION: qikink-webhook
// Deployed to: https://<PROJECT-REF>.supabase.co/functions/v1/qikink-webhook
// ==============================================================================
// Webhook endpoint for Qikink to notify order status changes:
// - in_production
// - dispatched / shipped (with AWB tracking number and courier name)
// - delivered
// ==============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS })
  }

  try {
    const payload = await req.json()
    console.log("Incoming Qikink Webhook Payload:", payload)

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    )

    // Qikink passes order_number or order_id
    const orderNumber = payload.order_number || payload.order_no || payload.reference_id
    const qikinkOrderId = payload.order_id ? String(payload.order_id) : null
    const qikinkStatus = (payload.status || "").toLowerCase()
    const awb = payload.tracking_number || payload.awb || payload.waybill
    const courier = payload.courier_name || payload.courier || payload.shipping_partner
    const trackingUrl = payload.tracking_url || (awb ? `https://www.delhivery.com/track/package/${awb}` : null)

    // Map Qikink status to KRAAL order status
    let internalStatus = "in_production"
    if (qikinkStatus.includes("ship") || qikinkStatus.includes("dispatch")) {
      internalStatus = "shipped"
    } else if (qikinkStatus.includes("deliver")) {
      internalStatus = "delivered"
    } else if (qikinkStatus.includes("cancel")) {
      internalStatus = "cancelled"
    }

    const updateFields: Record<string, any> = {
      qikink_status: qikinkStatus,
      status: internalStatus,
      updated_at: new Date().toISOString()
    }

    if (awb) updateFields.tracking_number = awb
    if (courier) updateFields.courier_name = courier
    if (trackingUrl) updateFields.tracking_url = trackingUrl
    if (qikinkOrderId) updateFields.qikink_order_id = qikinkOrderId

    let query = supabase.from("orders").update(updateFields)

    if (orderNumber) {
      query = query.eq("order_number", orderNumber)
    } else if (qikinkOrderId) {
      query = query.eq("qikink_order_id", qikinkOrderId)
    } else {
      return new Response(JSON.stringify({ error: "No order identifier found" }), { status: 400 })
    }

    const { error: updateErr } = await query

    if (updateErr) {
      console.error("Failed to update order from webhook:", updateErr)
      return new Response(JSON.stringify({ error: updateErr }), { status: 500 })
    }

    return new Response(JSON.stringify({ success: true, updated: orderNumber || qikinkOrderId }), {
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
    })

  } catch (error) {
    console.error("Webhook processing error:", error)
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }
})
