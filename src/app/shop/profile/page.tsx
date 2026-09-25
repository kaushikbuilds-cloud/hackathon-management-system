import { ProfileSecurity } from "@/components/profile-security";
import { Flash, PageHeader } from "@/components/ui";
import { requireVendor } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function ShopProfilePage(props: PageProps<"/shop/profile">) {
  const session = await requireVendor();
  const sp = await props.searchParams;
  const { data: shop } = await (await createClient()).from("food_shops").select("name, code").eq("id", session.shopId).maybeSingle<{ name: string; code: string }>();
  return (
    <>
      <PageHeader title="Password & sign-out" />
      <Flash notice={sp.notice} error={sp.error} />
      <ProfileSecurity session={session} extra={shop ? [{ label: "Shop", value: shop.name }, { label: "Shop ID (sign-in)", value: <span className="font-mono">{shop.code}</span> }] : []} />
    </>
  );
}
