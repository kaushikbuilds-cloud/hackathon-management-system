import type { FoodOrderStatus } from "@/lib/types";

export const FOOD_STATUS_LABEL: Record<FoodOrderStatus, string> = {
  placed: "New",
  preparing: "Preparing",
  ready: "Ready to collect",
  collected: "Collected",
  cancelled: "Cancelled",
};

export const FOOD_STATUS_TONE: Record<FoodOrderStatus, "neutral" | "blue" | "violet" | "green" | "amber" | "red"> = {
  placed: "blue",
  preparing: "amber",
  ready: "green",
  collected: "neutral",
  cancelled: "red",
};

/** The counter's next step for an order (mirrors set_food_order_status). */
export const FOOD_NEXT: Partial<Record<FoodOrderStatus, { status: FoodOrderStatus; label: string }>> = {
  placed: { status: "preparing", label: "Start preparing" },
  preparing: { status: "ready", label: "Mark ready" },
  ready: { status: "collected", label: "Collected" },
};

export const OPEN_FOOD_STATUSES: FoodOrderStatus[] = ["placed", "preparing", "ready"];

export function isFoodStatus(v: string): v is FoodOrderStatus {
  return v in FOOD_STATUS_LABEL;
}

/** "#0007" — order numbers are per hackathon. */
export function orderLabel(n: number): string {
  return `#${String(n).padStart(4, "0")}`;
}

/** Parses the cart the order form posts: qty_<itemId> fields. */
export function cartFromForm(formData: FormData, itemIds: Set<string>): { item_id: string; qty: number }[] {
  const lines: { item_id: string; qty: number }[] = [];
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("qty_") || typeof value !== "string") continue;
    const id = key.slice(4);
    const qty = Number.parseInt(value, 10);
    if (itemIds.has(id) && Number.isInteger(qty) && qty > 0) lines.push({ item_id: id, qty: Math.min(qty, 20) });
  }
  return lines;
}
