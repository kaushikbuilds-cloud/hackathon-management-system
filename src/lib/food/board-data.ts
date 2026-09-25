import "server-only";
import type { BoardOrder } from "@/components/food/order-board";
import { requestTime } from "@/lib/format";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * Open orders plus the last 12 hours of finished ones, with the orderer's name
 * and team. Counter staff and shops never read participant rows directly, so
 * this goes through the service client, scoped explicitly to the hackathon
 * (and shop). Callers must have checked access first.
 */
export async function loadBoardOrders(hackathonId: string, shopId?: string | null): Promise<BoardOrder[]> {
  let query = createServiceClient()
    .from("food_orders")
    .select("*, food_order_items(name, price, qty), participants(full_name, participant_code, teams(name))")
    .eq("hackathon_id", hackathonId)
    .order("created_at", { ascending: true })
    .limit(300);
  if (shopId) query = query.eq("shop_id", shopId);
  const since = new Date(requestTime() - 12 * 3600 * 1000).toISOString();
  const { data } = await query.or(`status.in.(placed,preparing,ready),updated_at.gte.${since}`).returns<BoardOrder[]>();
  return data ?? [];
}
