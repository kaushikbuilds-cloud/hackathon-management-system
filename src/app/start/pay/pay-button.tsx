"use client";

import { useEffect, useState, useTransition } from "react";
import { Alert, buttonClass } from "@/components/ui";
import { confirmPayment } from "../actions";

type RazorpayResponse = { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string };
type RazorpayInstance = { open(): void; on(event: string, cb: (r: { error?: { description?: string } }) => void): void };
declare global { interface Window { Razorpay?: new (options: Record<string, unknown>) => RazorpayInstance } }

const SCRIPT = "https://checkout.razorpay.com/v1/checkout.js";

/** Opens Razorpay Checkout; the server verifies the payment and creates the hackathon. */
export function PayButton(props: { keyId: string; orderId: string; amountPaise: number; label: string; name: string; email: string; phone?: string | null; hackathon: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (window.Razorpay) { void Promise.resolve().then(() => setLoaded(true)); return; }
    const s = document.createElement("script");
    s.src = SCRIPT;
    s.async = true;
    s.onload = () => setLoaded(true);
    s.onerror = () => setError("Couldn't load the payment window. Check your internet connection and reload the page.");
    document.body.appendChild(s);
  }, []);

  const pay = () => {
    if (!window.Razorpay) return;
    setError(null);
    const rzp = new window.Razorpay({
      key: props.keyId, order_id: props.orderId, amount: props.amountPaise, currency: "INR",
      name: "HackGround OS", description: `Hackathon: ${props.hackathon}`,
      prefill: { name: props.name, email: props.email, contact: props.phone ?? undefined },
      theme: { color: "#4F46E5" },
      handler: (r: RazorpayResponse) => start(async () => {
        const res = await confirmPayment({ orderId: r.razorpay_order_id, paymentId: r.razorpay_payment_id, signature: r.razorpay_signature });
        if (res?.error) setError(res.error);
      }),
    });
    rzp.on("payment.failed", (r) => setError(r.error?.description ? `Payment failed: ${r.error.description}` : "The payment failed. You can try again."));
    rzp.open();
  };

  return (
    <div className="space-y-4">
      {error && <Alert tone="red">{error}</Alert>}
      {pending && <Alert tone="blue" title="Confirming your payment…">Creating your hackathon. This takes a few seconds.</Alert>}
      <button type="button" onClick={pay} disabled={!loaded || pending} className={buttonClass("primary", "md", "w-full min-h-12 text-base")}>
        {pending ? "Setting up your hackathon…" : `Pay ${props.label}`}
      </button>
    </div>
  );
}
