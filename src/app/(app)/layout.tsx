import Link from "next/link";
import { redirect } from "next/navigation";
import { logoutAction } from "@/app/actions/auth";
import { getSessionUser, mfaRequired } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const locked = user.mustChangePassword || ((mfaRequired() || user.totpEnabled) && !user.mfaPassed);
  const nav = [
    { href: "/", label: "Dashboard" },
    { href: "/cases", label: "Cases" },
    { href: "/suppliers", label: "Suppliers" },
    { href: "/payments", label: "Bank details" },
    ...(user.role === "ADMIN" ? [{ href: "/team", label: "Team" }] : []),
    { href: "/security", label: "Security" },
  ];
  return (
    <div className="flex min-h-screen">
      <aside className="no-print hidden w-56 shrink-0 flex-col border-r border-line bg-white px-4 py-6 md:flex">
        <div className="mb-8 px-2">
          <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand">Counterparty Trust</div>
          <div className="text-xs text-muted">Kenya workbench</div>
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          {nav.map((n) =>
            locked && n.href !== "/security" ? (
              <span key={n.href} className="rounded-md px-2 py-2 text-sm text-muted/50">{n.label}</span>
            ) : (
              <Link key={n.href} href={n.href} className="rounded-md px-2 py-2 text-sm font-medium text-ink hover:bg-paper">
                {n.label}
              </Link>
            ),
          )}
        </nav>
        <div className="border-t border-line pt-4 text-xs">
          <div className="font-semibold">{user.name}</div>
          <div className="text-muted">{user.role.toLowerCase()}</div>
          <form action={logoutAction} className="mt-2">
            <button className="text-muted underline hover:text-ink">Sign out</button>
          </form>
          {process.env.APP_VERSION && <div className="mt-3 text-[11px] text-muted">Version {process.env.APP_VERSION}</div>}
        </div>
      </aside>
      <div className="flex-1">
        <header className="no-print flex items-center justify-between border-b border-line bg-white px-4 py-3 md:hidden">
          <span className="text-xs font-bold uppercase tracking-[0.2em] text-brand">Counterparty Trust</span>
          <nav className="flex gap-3 text-sm">
            {nav.slice(0, 4).map((n) => (
              <Link key={n.href} href={n.href}>{n.label}</Link>
            ))}
          </nav>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-8 md:px-8">{children}</main>
      </div>
    </div>
  );
}
