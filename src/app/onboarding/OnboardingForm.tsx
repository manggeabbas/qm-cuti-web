"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, ErrorBox, Field, Input, Select, Spinner } from "@/components/ui";
import { fetchJson } from "@/components/leave-helpers";

interface EmployeeInfo {
  nik: string;
  name: string;
  gender: "LAKI_LAKI" | "PEREMPUAN" | null;
  phone: string | null;
  email: string | null;
  position: { name: string };
  team: { name: string };
}

const GENDER_LABEL: Record<string, string> = {
  LAKI_LAKI: "Laki-laki",
  PEREMPUAN: "Perempuan",
};

export default function OnboardingForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState(1);
  const [employee, setEmployee] = useState<EmployeeInfo | null>(null);
  const [hasEmployee, setHasEmployee] = useState(true);
  const [gender, setGender] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    (async () => {
      const r = await fetchJson<{
        completed: boolean;
        employee: EmployeeInfo | null;
      }>("/api/onboarding");
      if (!r.ok) {
        setError(r.error.message);
        setLoading(false);
        return;
      }
      if (r.data.completed) {
        router.replace("/dashboard");
        return;
      }
      if (r.data.employee) {
        setEmployee(r.data.employee);
        setGender(r.data.employee.gender ?? "");
        setPhone(r.data.employee.phone ?? "");
        setEmail(r.data.employee.email ?? "");
        // bila gender sudah diisi admin, langsung ke langkah password
        if (r.data.employee.gender) setStep(2);
      } else {
        setHasEmployee(false);
        setStep(2);
      }
      setLoading(false);
    })();
  }, [router]);

  function validStep1(): string {
    if (!hasEmployee) return "";
    if (!gender) return "Jenis kelamin wajib dipilih.";
    if (phone.trim().length < 9) return "Nomor telepon minimal 9 digit.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return "Email tidak valid.";
    return "";
  }

  function validStep2(): string {
    if (pw1.length < 6) return "Password minimal 6 karakter.";
    if (pw1 !== pw2) return "Konfirmasi password tidak sama.";
    return "";
  }

  async function submit() {
    const v = validStep2();
    if (v) {
      setError(v);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const r = await fetchJson<{ completed: boolean }>("/api/onboarding", {
        method: "POST",
        body: JSON.stringify({
          gender: hasEmployee ? gender || undefined : undefined,
          phone: hasEmployee ? phone.trim() : undefined,
          email: hasEmployee ? email.trim() : undefined,
          newPassword: pw1,
          confirmPassword: pw2,
        }),
      });
      if (!r.ok) throw new Error(r.error.message);
      setDone(true);
      setTimeout(() => {
        router.replace("/dashboard");
        router.refresh();
      }, 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menyimpan.");
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    router.replace("/login");
    router.refresh();
  }

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-slate-100">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-slate-100 px-4 py-8">
      <div className="mx-auto max-w-md">
        {/* Header brand */}
        <div className="mb-5 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl bg-white shadow">
            <img src="/logo.png" alt="TTRI" className="h-12 w-12 object-contain" />
          </div>
          <h1 className="text-xl font-bold text-slate-900">TTRI</h1>
          <p className="text-sm text-slate-500">Selamat datang! Selesaikan langkah berikut sebelum mulai.</p>
        </div>

        {/* Indikator langkah */}
        {!done && (
          <div className="mb-4 flex items-center gap-2 text-xs">
            <div className={`flex items-center gap-1.5 ${step >= 1 ? "font-bold text-cyan-700" : "text-slate-400"}`}>
              <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] ${step > 1 ? "bg-emerald-500 text-white" : step === 1 ? "bg-cyan-600 text-white" : "bg-slate-200 text-slate-500"}`}>
                {step > 1 ? "✓" : "1"}
              </span>
              Data Diri
            </div>
            <div className="h-0.5 flex-1 rounded bg-slate-200" />
            <div className={`flex items-center gap-1.5 ${step >= 2 ? "font-bold text-cyan-700" : "text-slate-400"}`}>
              <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] ${step === 2 ? "bg-cyan-600 text-white" : "bg-slate-200 text-slate-500"}`}>
                2
              </span>
              Ganti Password
            </div>
          </div>
        )}

        {error && <div className="mb-3"><ErrorBox message={error} /></div>}

        {done ? (
          <Card className="py-8 text-center">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-2xl text-emerald-600">
              ✓
            </div>
            <p className="font-bold text-slate-900">Data tersimpan!</p>
            <p className="mt-1 text-sm text-slate-500">Mengarahkan ke dashboard…</p>
          </Card>
        ) : step === 1 ? (
          <Card className="space-y-3">
            <div>
              <p className="font-bold text-slate-900">Lengkapi Data Diri</p>
              <p className="text-xs text-slate-500">Data berikut wajib diisi sebelum menggunakan aplikasi.</p>
            </div>
            {employee && (
              <div className="rounded-xl bg-slate-50 p-3 text-sm">
                <div className="flex justify-between py-0.5"><span className="text-slate-500">NIK</span><span className="font-medium">{employee.nik}</span></div>
                <div className="flex justify-between py-0.5"><span className="text-slate-500">Nama</span><span className="font-medium">{employee.name}</span></div>
                <div className="flex justify-between py-0.5"><span className="text-slate-500">Jabatan</span><span className="font-medium">{employee.position.name}</span></div>
                <div className="flex justify-between py-0.5"><span className="text-slate-500">Regu</span><span className="font-medium">{employee.team.name}</span></div>
              </div>
            )}
            {hasEmployee ? (
              <>
                {employee?.gender ? (
                  <Field label="Jenis Kelamin">
                    <Input value={GENDER_LABEL[employee.gender] ?? employee.gender} readOnly />
                  </Field>
                ) : (
                  <Field label="Jenis Kelamin" required>
                    <Select value={gender} onChange={(e) => setGender(e.target.value)}>
                      <option value="">— Pilih —</option>
                      <option value="LAKI_LAKI">Laki-laki</option>
                      <option value="PEREMPUAN">Perempuan</option>
                    </Select>
                  </Field>
                )}
                <Field label="No. Telepon / HP" required>
                  <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="cth: 081234567890" inputMode="tel" />
                </Field>
                <Field label="Email" required>
                  <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="cth: nama@email.com" />
                </Field>
              </>
            ) : (
              <p className="text-sm text-slate-500">Akun Anda tidak terhubung ke data karyawan. Lanjut ke ganti password.</p>
            )}
            <Button
              className="w-full"
              onClick={() => {
                const v = validStep1();
                if (v) setError(v);
                else {
                  setError("");
                  setStep(2);
                }
              }}
            >
              Lanjut →
            </Button>
            <p className="text-center text-[11px] text-slate-400">Data NIK, nama, dan jabatan diisi oleh admin dan tidak dapat diubah.</p>
            <button onClick={logout} className="mx-auto block text-xs font-semibold text-slate-400 hover:text-slate-600 hover:underline">
              Keluar
            </button>
          </Card>
        ) : (
          <Card className="space-y-3">
            <div>
              <p className="font-bold text-slate-900">Ganti Password</p>
              <p className="text-xs text-slate-500">Demi keamanan, ganti password sementara dari admin dengan password pilihan Anda.</p>
            </div>
            <Field label="Password Baru" required>
              <div className="relative">
                <Input
                  type={showPw ? "text" : "password"}
                  value={pw1}
                  onChange={(e) => setPw1(e.target.value)}
                  placeholder="Minimal 6 karakter"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  className="absolute inset-y-0 right-0 px-3 text-sm text-slate-400 hover:text-slate-600"
                  aria-label={showPw ? "Sembunyikan" : "Tampilkan"}
                >
                  {showPw ? "🙈" : "👁️"}
                </button>
              </div>
            </Field>
            <Field label="Konfirmasi Password Baru" required>
              <Input
                type={showPw ? "text" : "password"}
                value={pw2}
                onChange={(e) => setPw2(e.target.value)}
                placeholder="Ulangi password baru"
                autoComplete="new-password"
              />
            </Field>
            <div className="flex gap-2">
              {hasEmployee && (
                <Button variant="secondary" className="flex-1" onClick={() => setStep(1)} disabled={busy}>
                  ← Kembali
                </Button>
              )}
              <Button className="flex-1" onClick={submit} disabled={busy}>
                {busy ? "Menyimpan…" : "Selesai"}
              </Button>
            </div>
            <button onClick={logout} className="mx-auto block text-xs font-semibold text-slate-400 hover:text-slate-600 hover:underline">
              Keluar
            </button>
          </Card>
        )}
      </div>
    </div>
  );
}
