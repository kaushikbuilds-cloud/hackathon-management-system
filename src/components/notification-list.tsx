import Link from "next/link";
import { SubmitButton } from "@/components/client";
import { Card, CardTitle, EmptyState } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { markAllNotificationsRead } from "@/lib/notifications";
import type { Notification } from "@/lib/types";

export function NotificationList({ items, path, timeZone }: { items: Notification[]; path: string; timeZone: string }) {
  return (
    <Card>
      <CardTitle
        actions={items.some((n) => !n.read_at) && (
          <form action={markAllNotificationsRead}>
            <input type="hidden" name="path" value={path} />
            <SubmitButton variant="secondary" size="sm">Mark all as read</SubmitButton>
          </form>
        )}
      >
        Notifications
      </CardTitle>
      {items.length === 0 ? (
        <EmptyState title="No notifications yet" />
      ) : (
        <ul className="divide-y divide-navy-800">
          {items.map((n) => (
            <li key={n.id} className="flex items-start gap-3 py-3">
              <span className={`mt-1.5 size-2 shrink-0 rounded-full ${n.read_at ? "bg-navy-600" : "bg-violet-400"}`} aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-100">
                  {n.link ? <Link href={n.link} className="hover:underline">{n.title}</Link> : n.title}
                  {!n.read_at && <span className="sr-only"> (unread)</span>}
                </p>
                {n.body && <p className="text-sm text-slate-400">{n.body}</p>}
                <p className="mt-0.5 text-xs text-slate-500">{formatDateTime(n.created_at, timeZone)}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
