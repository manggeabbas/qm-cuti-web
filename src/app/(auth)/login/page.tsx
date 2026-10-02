"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Field, ErrorBox } from "@/components/ui";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const json = await res.json();
      if (!json.ok) {
        setError(json.error.message);
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Tidak dapat terhubung ke server.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-gradient-to-b from-emerald-700 to-emerald-900 px-4">
      <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-xl">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-600 text-2xl text-white">
            📋
          </div>
          <h1 className="text-xl font-bold text-slate-900">Cuti QM YWI</h1>
          <p className="mt-1 text-sm text-slate-500">Pengajuan Cuti, Izin & Monitoring Jadwal</p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <Field label="Username / NIK" required>
            <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="cth: 900005" autoComplete="username" />
          </Field>
          <Field label="Password" required>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete="current-password" />
          </Field>
          <ErrorBox message={error} />
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? "Memeriksa..." : "Masuk"}
          </Button>
        </form>
        <p className="mt-4 text-center text-xs text-slate-400">
          Akun demo: admin / admin123 · crew1 / cuti123
        </p>
      </div>
    </div>
  );
}
