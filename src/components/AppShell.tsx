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

interface NavSection {
  title: string;
  items: NavItem[];
}

const SECTIONS: NavSection[] = [
  {
    title: "Utama",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: "🏠" },
      { href: "/pengajuan", label: "Pengajuan", icon: "📝" },
      { href: "/approval", label: "Approval", icon: "✅", roles: ["KOORDINATOR", "WAFOR", "FOREMAN", "WSPV", "SPV", "ADMIN"] },
      { href: "/kalender", label: "Kalender", icon: "📅" },
      { href: "/off", label: "OFF Saya", icon: "🌴" },
      { href: "/profil", label: "Profil", icon: "👤" },
    ],
  },
  {
    title: "Manajemen",
    items: [
      { href: "/karyawan", label: "Karyawan", icon: "👥", roles: ["FOREMAN", "WAFOR", "KOORDINATOR", "WSPV", "SPV", "ADMIN"] },
      { href: "/shift-off", label: "Shift & OFF", icon: "🕐", roles: ["EMPLOYEE", "FOREMAN", "WAFOR", "WSPV", "SPV", "ADMIN"] },
      { href: "/laporan", label: "Laporan", icon: "📊", roles: ["WSPV", "SPV", "ADMIN"] },
    ],
  },
  {
    title: "Administrasi",
    items: [
      { href: "/organisasi", label: "Organisasi", icon: "🏢", roles: ["ADMIN"] },
      { href: "/master-cuti", label: "Master Cuti", icon: "🗂️", roles: ["ADMIN"] },
      { href: "/pengguna", label: "Pengguna", icon: "🔑", roles: ["ADMIN"] },
      { href: "/notifikasi", label: "Notifikasi", icon: "🔔", roles: ["ADMIN"] },
      { href: "/audit", label: "Audit Log", icon: "🧾", roles: ["ADMIN"] },
      { href: "/workflow", label: "Workflow", icon: "🔀", roles: ["ADMIN"] },
      { href: "/pengaturan", label: "Pengaturan", icon: "⚙️", roles: ["ADMIN"] },
    ],
  },
];

function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function navLinkCls(active: boolean): string {
  return `relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
    active ? "bg-emerald-50 text-emerald-800" : "text-slate-600 hover:bg-slate-100"
  }`;
}

function NavLinks({
  sections,
  pathname,
  onNavigate,
}: {
  sections: NavSection[];
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <nav className="flex-1 space-y-5 overflow-y-auto" aria-label="Navigasi utama">
      {sections.map((section) => (
        <div key={section.title}>
          <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            {section.title}
          </p>
          <div className="space-y-0.5">
            {section.items.map((n) => {
              const active = isActivePath(pathname, n.href);
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={navLinkCls(active)}
                >
                  {active && (
                    <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-emerald-600" aria-hidden />
                  )}
                  <span className="text-base">{n.icon}</span> {n.label}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

export default function AppShell({ user, children }: { user: SessionUser; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);

  const visibleSections = SECTIONS.map((s) => ({
    ...s,
    items: s.items.filter((n) => !n.roles || n.roles.some((r) => hasRole(user, r))),
  })).filter((s) => s.items.length > 0);

  const allItems = visibleSections.flatMap((s) => s.items);
  const bottomItems = allItems.length > 5 ? allItems.slice(0, 4) : allItems.slice(0, 5);
  const hasMore = allItems.length > bottomItems.length;

  const displayName = user.employee?.name ?? user.username;
  const initials = displayName
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="min-h-dvh bg-slate-50">
      {/* Header mobile */}
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
        <Link href="/dashboard" className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-lg bg-white"><img src="/logo.png" alt="TTRI" className="h-7 w-7 object-contain" /></span>
          <span className="font-bold text-slate-800">TTRI</span>
        </Link>
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
          aria-label="Buka menu"
          aria-expanded={menuOpen}
        >
          ☰
        </button>
      </header>

      {/* Sidebar desktop */}
      <aside className="fixed inset-y-0 left-0 z-10 hidden w-60 flex-col border-r border-slate-200 bg-white p-3 lg:flex">
        <Link href="/dashboard" className="mb-4 flex items-center gap-2 rounded-lg px-2 py-2">
          <span className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-lg bg-white"><img src="/logo.png" alt="TTRI" className="h-9 w-9 object-contain" /></span>
          <div>
            <p className="text-sm font-bold leading-tight text-slate-800">TTRI</p>
            <p className="text-[11px] text-slate-400">Leave Management</p>
          </div>
        </Link>
        <NavLinks sections={visibleSections} pathname={pathname} />
        <div className="mt-3 border-t border-slate-100 pt-3">
          <div className="flex items-center gap-3 px-2 py-1">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700">
              {initials || "?"}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-800">{displayName}</p>
              <p className="truncate text-[11px] text-slate-400">{user.roles.join(", ")}</p>
            </div>
          </div>
          <button
            onClick={logout}
            className="mt-2 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
          >
            <span className="text-base">🚪</span> Keluar
          </button>
        </div>
      </aside>

      {/* Drawer mobile */}
      {menuOpen && (
        <div className="fixed inset-0 z-30 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMenuOpen(false)} />
          <div className="absolute right-0 top-0 flex h-full w-72 flex-col bg-white p-3 shadow-xl">
            <div className="mb-3 flex items-center justify-between border-b border-slate-100 px-2 pb-3">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700">
                  {initials || "?"}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-800">{displayName}</p>
                  <p className="truncate text-[11px] text-slate-400">{user.roles.join(", ")}</p>
                </div>
              </div>
              <button
                onClick={() => setMenuOpen(false)}
                aria-label="Tutup menu"
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
              >
                ✕
              </button>
            </div>
            <NavLinks sections={visibleSections} pathname={pathname} onNavigate={() => setMenuOpen(false)} />
            <button
              onClick={logout}
              className="mt-3 flex items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium text-red-600 hover:bg-red-50"
            >
              🚪 Keluar
            </button>
          </div>
        </div>
      )}

      {/* Konten */}
      <main className="mx-auto max-w-6xl px-4 pb-24 pt-5 lg:ml-60 lg:max-w-none lg:px-8 lg:pb-10 lg:pt-6">
        {children}
      </main>

      {/* Bottom nav mobile */}
      <nav
        className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white px-2 pb-[env(safe-area-inset-bottom)] pt-1 lg:hidden"
        aria-label="Navigasi bawah"
      >
        <div className="flex justify-around">
          {bottomItems.map((n) => {
            const active = isActivePath(pathname, n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active ? "page" : undefined}
                className={`flex flex-1 flex-col items-center rounded-lg px-2 py-1.5 text-[11px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                  active ? "text-emerald-700" : "text-slate-500"
                }`}
              >
                <span className="text-xl">{n.icon}</span>
                {n.label}
              </Link>
            );
          })}
          {hasMore && (
            <button
              onClick={() => setMenuOpen(true)}
              aria-label="Menu lainnya"
              className="flex flex-1 flex-col items-center rounded-lg px-2 py-1.5 text-[11px] font-medium text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
            >
              <span className="text-xl">☰</span>
              Lainnya
            </button>
          )}
        </div>
      </nav>
    </div>
  );
}
