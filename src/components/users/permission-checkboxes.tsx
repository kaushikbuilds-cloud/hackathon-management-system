import { Checkbox } from "@/components/ui";
import { grantableTo, type Permission } from "@/lib/permissions";

/**
 * Permission checkboxes for a staff role. Permissions the granter does not
 * hold themselves are shown disabled (they cannot be granted or removed).
 */
export function PermissionCheckboxes({ role, checked, granter }: {
  role: "admin" | "official";
  checked: ReadonlySet<string>;
  granter: { isSuperAdmin: boolean; permissions: ReadonlySet<Permission> };
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {grantableTo(role).map((p) => {
        const allowed = granter.isSuperAdmin || granter.permissions.has(p.key);
        return (
          <Checkbox key={p.key} name="permissions" value={p.key} label={p.label} hint={allowed ? p.description : `${p.description} (you don't hold this permission)`}
            defaultChecked={checked.has(p.key)} disabled={!allowed} />
        );
      })}
    </div>
  );
}
