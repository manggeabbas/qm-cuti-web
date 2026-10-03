"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import type { SessionUser } from "@/lib/auth";
import { hasRole } from "@/lib/role-utils";

interface NavItem {
  href: string;
  label: string;
  icon: string;
  roles?: Parameters<typeof hasRole>[1][];
}

const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: "🏠" },
  { href: "/pengajuan", label: "Pengajuan", icon: "📝" },
  { href: "/approval", label: "Approval", icon: "✅", roles: ["KOORDINATOR", "WAFOR", "FOREMAN", "WSPV", "SPV", "ADMIN"] },
  { href: "/kalender", label: "Kalender", icon: "📅" },
  { href: "/karyawan", label: "Karyawan", icon: "👥", roles: ["FOREMAN", "WAFOR", "KOORDINATOR", "WSPV", "SPV", "ADMIN"] },
  { href: "/shift-off", label: "Shift & OFF", icon: "🕐", roles: ["EMPLOYEE", "FOREMAN", "WAFOR", "WSPV", "SPV", "ADMIN"] },
  { href: "/laporan", label: "Laporan", icon: "📊", roles: ["WSPV", "SPV", "ADMIN"] },
  { href: "/notifikasi", label: "Notifikasi", icon: "🔔", roles: ["ADMIN"] },
  { href: "/organisasi", label: "Organisasi", icon: "🏢", roles: ["ADMIN"] },
  { href: "/master-cuti", label: "Master Cuti", icon: "🗂️", roles: ["ADMIN"] },
  { href: "/pengguna", label: "Pengguna", icon: "🔑", roles: ["ADMIN"] },
  { href: "/audit", label: "Audit Log", icon: "🧾", roles: ["ADMIN"] },
  { href: "/workflow", label: "Workflow", icon: "🔀", roles: ["ADMIN"] },
  { href: "/pengaturan", label: "Pengaturan", icon: "⚙️", roles: ["ADMIN"] },
  { href: "/profil", label: "Profil", icon: "👤" },
];

export default function AppShell({ user, children }: { user: SessionUser; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);

  const items = NAV.filter((n) => !n.roles || n.roles.some((r) => hasRole(user, r)));

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const linkCls = (active: boolean) =>
    `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
      active ? "bg-emerald-100 text-emerald-900" : "text-slate-600 hover:bg-slate-100"
    }`;

  return (
    <div className="min-h-dvh bg-slate-50">
      {/* Header mobile */}
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
        <span className="font-bold text-emerald-800">📋 Cuti QM YWI</span>
        <button onClick={() => setMenuOpen(!menuOpen)} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100" aria-label="Menu">
          ☰
        </button>
      </header>

      {/* Sidebar desktop */}
      <aside className="fixed inset-y-0 left-0 z-10 hidden w-60 flex-col border-r border-slate-200 bg-white p-4 lg:flex">
        <div className="mb-6 px-2">
          <p className="text-lg font-bold text-emerald-800">📋 Cuti QM YWI</p>
          <p className="mt-1 truncate text-xs text-slate-500">{user.employee?.name ?? user.username}</p>
          <p className="text-xs text-slate-400">{user.roles.join(", ")}</p>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto">
          {items.map((n) => (
            <Link key={n.href} href={n.href} className={linkCls(pathname.startsWith(n.href))}>
              <span className="text-lg">{n.icon}</span> {n.label}
            </Link>
          ))}
        </nav>
        <button onClick={logout} className="mt-4 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50">
          <span className="text-lg">🚪</span> Keluar
        </button>
      </aside>

      {/* Drawer mobile */}
      {menuOpen && (
        <div className="fixed inset-0 z-30 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMenuOpen(false)} />
          <div className="absolute right-0 top-0 flex h-full w-72 flex-col bg-white p-4 shadow-xl">
            <div className="mb-4">
              <p className="font-bold text-slate-900">{user.employee?.name ?? user.username}</p>
              <p className="text-xs text-slate-500">{user.roles.join(", ")}</p>
            </div>
            <nav className="flex-1 space-y-1 overflow-y-auto">
              {items.map((n) => (
                <Link key={n.href} href={n.href} onClick={() => setMenuOpen(false)} className={linkCls(pathname.startsWith(n.href))}>
                  <span className="text-lg">{n.icon}</span> {n.label}
                </Link>
              ))}
            </nav>
            <button onClick={logout} className="mt-4 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-red-600 hover:bg-red-50">
              🚪 Keluar
            </button>
          </div>
        </div>
      )}

      {/* Konten */}
      <main className="mx-auto max-w-5xl px-4 pb-24 pt-4 lg:ml-60 lg:max-w-none lg:px-8 lg:pb-10 lg:pt-6">
        {children}
      </main>

      {/* Bottom nav mobile */}
      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white px-2 pb-[env(safe-area-inset-bottom)] pt-1 lg:hidden">
        <div className="flex justify-around">
          {items.slice(0, 5).map((n) => {
            const active = pathname.startsWith(n.href);
            return (
              <Link key={n.href} href={n.href} className={`flex flex-col items-center rounded-lg px-3 py-1.5 text-[11px] font-medium ${active ? "text-emerald-700" : "text-slate-500"}`}>
                <span className="text-xl">{n.icon}</span>
                {n.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
