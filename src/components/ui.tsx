"use client";

import React from "react";

/* ---------- Button ---------- */
export function Button({
  children,
  variant = "primary",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "danger" | "ghost" }) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none";
  const styles = {
    primary: "bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm",
    secondary: "bg-slate-100 text-slate-800 hover:bg-slate-200",
    danger: "bg-red-600 text-white hover:bg-red-700",
    ghost: "text-slate-600 hover:bg-slate-100",
  } as const;
  return (
    <button className={`${base} ${styles[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
}

/* ---------- Card ---------- */
export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-sm ${className}`}>
      {children}
    </div>
  );
}

/* ---------- Form fields ---------- */
export function Field({ label, children, required }: { label: string; children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">
        {label} {required && <span className="text-red-500">*</span>}
      </span>
      {children}
    </label>
  );
}

const inputCls =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100";

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputCls} ${props.className ?? ""}`} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${inputCls} ${props.className ?? ""}`} />;
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${inputCls} ${props.className ?? ""}`} />;
}

/* ---------- Badge ---------- */
const STATUS_STYLE: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-700",
  SUBMITTED: "bg-blue-100 text-blue-800",
  PENDING_KOORDINATOR: "bg-amber-100 text-amber-800",
  PENDING_WAFOR: "bg-amber-100 text-amber-800",
  PENDING_FOREMAN: "bg-amber-100 text-amber-800",
  PENDING_SPV: "bg-amber-100 text-amber-800",
  APPROVED: "bg-emerald-100 text-emerald-800",
  REJECTED: "bg-red-100 text-red-800",
  CANCEL_REQUESTED: "bg-orange-100 text-orange-800",
  CANCELLED: "bg-slate-200 text-slate-600",
  COMPLETED: "bg-emerald-50 text-emerald-700",
  ACTIVE: "bg-emerald-100 text-emerald-800",
  INACTIVE: "bg-slate-200 text-slate-600",
  RESIGNED: "bg-red-100 text-red-700",
  SENT: "bg-emerald-100 text-emerald-800",
  FAILED: "bg-red-100 text-red-800",
};

export const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Diajukan",
  PENDING_KOORDINATOR: "Menunggu Koordinator",
  PENDING_WAFOR: "Menunggu Wafor",
  PENDING_FOREMAN: "Menunggu Foreman",
  PENDING_SPV: "Menunggu SPV",
  APPROVED: "Disetujui",
  REJECTED: "Ditolak",
  CANCEL_REQUESTED: "Pembatalan Diajukan",
  CANCELLED: "Dibatalkan",
  COMPLETED: "Selesai",
};

export function Badge({ status, label }: { status: string; label?: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLE[status] ?? "bg-slate-100 text-slate-700"}`}
    >
      {label ?? STATUS_LABEL[status] ?? status}
    </span>
  );
}

/* ---------- Misc ---------- */
export function Spinner() {
  return (
    <div className="flex items-center justify-center py-10">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-emerald-600" />
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center">
      <p className="font-semibold text-slate-700">{title}</p>
      {hint && <p className="mt-1 text-sm text-slate-500">{hint}</p>}
    </div>
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div>
        <h1 className="text-xl font-bold text-slate-900">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function ErrorBox({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">{message}</div>
  );
}

export function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}
