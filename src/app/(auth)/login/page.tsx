"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Field, ErrorBox } from "@/components/ui";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError("Username dan password wajib diisi.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const json = await res.json().catch(() => null);
      if (!json?.ok) {
        setError(json?.error?.message ?? `Tidak dapat masuk (HTTP ${res.status}).`);
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
    <div className="flex min-h-dvh items-center justify-center bg-gradient-to-b from-cyan-700 to-blue-900 px-4">
      <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-xl">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl bg-white shadow">
            <img src="/logo.png" alt="TTRI" className="h-12 w-12 object-contain" />
          </div>
          <h1 className="text-xl font-bold text-slate-900">TTRI</h1>
          <p className="mt-1 text-sm text-slate-500">Pengajuan Cuti, Izin & Monitoring Jadwal</p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <Field label="Username / NIK" required>
            <Input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="cth: 900005"
              autoComplete="username"
              autoFocus
            />
          </Field>

          <div>
            <label
              htmlFor="login-password"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Password <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <Input
                id="login-password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                className="pr-20"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"}
                className="absolute inset-y-0 right-0 my-auto mr-1 h-8 rounded-lg px-3 text-xs font-semibold text-slate-500 hover:bg-slate-100 hover:text-cyan-700"
              >
                {showPassword ? "Sembunyikan" : "Lihat"}
              </button>
            </div>
          </div>

          <ErrorBox message={error} />
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? "Memeriksa..." : "Masuk"}
          </Button>
        </form>
        <p className="mt-4 text-center text-xs text-slate-400">
          Lupa password? Hubungi administrator untuk reset.
        </p>
      </div>
    </div>
  );
}
