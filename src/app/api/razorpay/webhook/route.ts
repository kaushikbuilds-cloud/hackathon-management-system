import { NextResponse, type NextRequest } from "next/server";
import { completePayment } from "@/lib/billing";
import { webhookSignatureValid } from "@/lib/razorpay";

type Event = { event: string; payload?: { payment?: { entity?: { id?: string; order_id?: string } }; order?: { entity?: { id?: string } } } };

/**
 * Razorpay webhook (payment.captured / order.paid): creates the hackathon even
 * if the organiser closed the browser before Checkout returned. Configure it in
 * Razorpay → Settings → Webhooks with RAZORPAY_WEBHOOK_SECRET.
 */
export async function POST(request: NextRequest) {
  const raw = await request.text();
  if (!webhookSignatureValid(raw, request.headers.get("x-razorpay-signature"))) return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  let event: Event;
  try {
    event = JSON.parse(raw) as Event;
  } catch {
    return NextResponse.json({ error: "Bad payload" }, { status: 400 });
  }
  if (event.event !== "payment.captured" && event.event !== "order.paid") return NextResponse.json({ ignored: event.event });
  const orderId = event.payload?.order?.entity?.id ?? event.payload?.payment?.entity?.order_id;
  const paymentId = event.payload?.payment?.entity?.id;
  if (!orderId || !paymentId) return NextResponse.json({ ignored: "no order" });
  const result = await completePayment(orderId, paymentId, "webhook");
  // Orders that aren't ours (other Razorpay products) are acknowledged so Razorpay stops retrying.
  return NextResponse.json(result.ok ? { ok: true } : { ok: false, reason: result.error });
}
