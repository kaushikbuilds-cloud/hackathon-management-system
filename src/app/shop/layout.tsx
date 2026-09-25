import type { Metadata } from "next";
import { AppShell } from "@/components/layout/app-shell";
import type { NavItem } from "@/components/layout/nav";
import { requireVendor } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: { default: "Shop Portal", template: "%s · Shop Portal" } };

const NAV: NavItem[] = [
  { href: "/shop", label: "Orders", icon: "food" },
  { href: "/shop/menu", label: "Menu & prices", icon: "form" },
  { href: "/shop/profile", label: "Password & sign-out", icon: "user" },
];

export default async function ShopLayout({ children }: LayoutProps<"/shop">) {
  const session = await requireVendor();
  const { data: shop } = await (await createClient()).from("food_shops").select("name").eq("id", session.shopId).maybeSingle<{ name: string }>();
  return (
    <AppShell
      portalName="Shop Portal"
      eventName={shop?.name ?? "Food shop"}
      nav={NAV}
      root="/shop"
      user={{ name: shop?.name ?? "Food shop", roleLabel: "Food shop" }}
      unread={0}
      notificationsHref="/shop"
    >
      {children}
    </AppShell>
  );
}
