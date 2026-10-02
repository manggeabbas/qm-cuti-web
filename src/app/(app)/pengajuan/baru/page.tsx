"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  Button,
  Card,
  EmptyState,
  ErrorBox,
  Field,
  Input,
  PageHeader,
  Select,
  Spinner,
  Textarea,
} from "@/components/ui";
import {
  addDaysISO,
  diffDaysInclusive,
  fetchJson,
  formatDateID,
  toISODate,
  type LeaveType,
} from "@/components/leave-helpers";

const CUTI_CATEGORIES = ["CFV", "CT", "SPECIAL_LEAVE"];
const IZIN_CATEGORIES = ["PERMISSION"];

interface CreatePayload {
  leaveTypeId: number;
  startDate: string;
  endDate: string;
  reason: string;
  addressDuringLeave?: string;
  contactNumber?: string;
  notes?: string;
  packageId?: string;
  packageOrder?: number;
}

export default function PengajuanBaruPage() {
  const router = useRouter();
  const [types, setTypes] = useState<LeaveType[] | null>(null);
  const [loadErr, setLoadErr] = useState("");

  const [tipe, setTipe] = useState<"cuti" | "izin">("cuti");
  const [leaveTypeId, setLeaveTypeId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [address, setAddress] = useState("");
  const [contact, setContact] = useState("");
  const [notes, setNotes] = useState("");

  const [packageMode, setPackageMode] = useState(false);
  const [ctDays, setCtDays] = useState("4");

  const [busy, setBusy] = useState<"draft" | "submit" | null>(null);
  const [err, setErr] = useState("");
  const [okMsg, setOkMsg] = useState("");

  /* Muat jenis cuti + preset ?tipe= */
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("tipe");
    if (q === "izin") setTipe("izin");
    (async () => {
      const r = await fetchJson<LeaveType[] | { items: LeaveType[] }>("/api/leave-types");
      if (!r.ok) {
        setLoadErr(r.error.message);
        return;
      }
      const list = Array.isArray(r.data) ? r.data : r.data.items;
      setTypes(list);
    })();
  }, []);

  const options = useMemo(() => {
    if (!types) return [];
    const cats = tipe === "cuti" ? CUTI_CATEGORIES : IZIN_CATEGORIES;
    return types.filter((t) => cats.includes(t.category));
  }, [types, tipe]);

  const selected = useMemo(
    () => options.find((t) => t.id === Number(leaveTypeId)) ?? null,
    [options, leaveTypeId]
  );
  const isCfv = selected?.code === "CFV";
  const ctType = useMemo(() => types?.find((t) => t.code === "CT") ?? null, [types]);

  /* CFV paket: akhir otomatis 12 hari (tepat 12 hari sesuai aturan bisnis) */
  const effectiveEnd = packageMode && isCfv && startDate ? addDaysISO(startDate, 11) : endDate;
  const ctStart = packageMode && isCfv && effectiveEnd ? addDaysISO(effectiveEnd, 1) : "";
  const ctEnd =
    packageMode && ctStart && Number(ctDays) >= 1 ? addDaysISO(ctStart, Number(ctDays) - 1) : "";

  const totalDays =
    startDate && effectiveEnd && effectiveEnd >= startDate
      ? diffDaysInclusive(startDate, effectiveEnd)
      : null;

  const today = toISODate(new Date());

  function validate(): string {
    if (!selected) return "Pilih jenis cuti/izin terlebih dahulu.";
    if (!startDate) return "Tanggal mulai wajib diisi.";
    if (!effectiveEnd) return "Tanggal selesai wajib diisi.";
    if (effectiveEnd < startDate) return "Tanggal selesai tidak boleh sebelum tanggal mulai.";
    if (!reason.trim()) return "Alasan wajib diisi.";
    if (packageMode) {
      if (!isCfv) return "Mode paket hanya berlaku untuk CFV.";
      const n = Number(ctDays);
      if (!Number.isInteger(n) || n < 1 || n > 4)
        return "Paket CFV+CT: CT lanjutan maksimal 4 hari (aturan bisnis).";
      if (!ctType) return "Jenis CT tidak ditemukan, tidak bisa membuat paket.";
    }
    return "";
  }

  function basePayload(p: Partial<CreatePayload>): CreatePayload {
    return {
      leaveTypeId: selected!.id,
      startDate,
      endDate: effectiveEnd,
      reason: reason.trim(),
      ...(address.trim() ? { addressDuringLeave: address.trim() } : {}),
      ...(contact.trim() ? { contactNumber: contact.trim() } : {}),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
      ...p,
    };
  }

  async function createAll(): Promise<number[]> {
    const v = validate();
    if (v) throw new Error(v);
    const ids: number[] = [];
    if (packageMode && isCfv && ctType) {
      const pkgId =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const payloads: CreatePayload[] = [
        basePayload({ packageId: pkgId, packageOrder: 1 }),
        {
          ...basePayload({
            packageId: pkgId,
            packageOrder: 2,
            leaveTypeId: ctType.id,
            startDate: ctStart,
            endDate: ctEnd,
          }),
        },
      ];
      for (const p of payloads) {
        const r = await fetchJson<{ id: number }>("/api/leave-requests", {
          method: "POST",
          body: JSON.stringify(p),
        });
        if (!r.ok) throw new Error(r.error.message);
        ids.push(r.data.id);
      }
    } else {
      const r = await fetchJson<{ id: number }>("/api/leave-requests", {
        method: "POST",
        body: JSON.stringify(basePayload({})),
      });
      if (!r.ok) throw new Error(r.error.message);
      ids.push(r.data.id);
    }
    return ids;
  }

  async function handleDraft() {
    setErr("");
    setOkMsg("");
    setBusy("draft");
    try {
      const ids = await createAll();
      if (ids.length === 1) router.push(`/pengajuan/${ids[0]}`);
      else router.push("/pengajuan");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Gagal menyimpan draft.");
    } finally {
      setBusy(null);
    }
  }

  async function handleSubmit() {
    setErr("");
    setOkMsg("");
    setBusy("submit");
    try {
      const ids = await createAll();
      for (const id of ids) {
        const r = await fetchJson(`/api/leave-requests/${id}/submit`, { method: "POST" });
        if (!r.ok) {
          setErr(`Pengajuan #${id} tersimpan sebagai draft, tetapi gagal diajukan: ${r.error.message}`);
          setOkMsg("Draft berhasil disimpan. Perbaiki masalah lalu ajukan dari halaman detail.");
          return;
        }
      }
      router.push(ids.length === 1 ? `/pengajuan/${ids[0]}` : "/pengajuan");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Gagal mengajukan.");
    } finally {
      setBusy(null);
    }
  }

  if (types === null && !loadErr) return <Spinner />;
  if (loadErr)
    return (
      <div className="space-y-4">
        <PageHeader title="Pengajuan Baru" />
        <ErrorBox message={`Gagal memuat jenis cuti: ${loadErr}`} />
        <Link href="/pengajuan">
          <Button variant="secondary">Kembali</Button>
        </Link>
      </div>
    );

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageHeader
        title="Pengajuan Baru"
        subtitle="Isi formulir di bawah. Validasi akhir dilakukan server."
      />

      <Card className="space-y-4">
        {err && <ErrorBox message={err} />}
        {okMsg && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800">
            {okMsg}
          </div>
        )}

        <Field label="Jenis Pengajuan" required>
          <Select
            value={tipe}
            onChange={(e) => {
              setTipe(e.target.value as "cuti" | "izin");
              setLeaveTypeId("");
              setPackageMode(false);
            }}
          >
            <option value="cuti">Cuti</option>
            <option value="izin">Izin</option>
          </Select>
        </Field>

        <Field label={tipe === "cuti" ? "Jenis Cuti" : "Jenis Izin"} required>
          <Select value={leaveTypeId} onChange={(e) => setLeaveTypeId(e.target.value)}>
            <option value="">— Pilih —</option>
            {options.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.code})
              </option>
            ))}
          </Select>
        </Field>

        {isCfv && (
          <label className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={packageMode}
              onChange={(e) => setPackageMode(e.target.checked)}
            />
            <span>
              <span className="font-semibold text-emerald-900">Ajukan paket CFV + CT</span>
              <br />
              <span className="text-emerald-800">
                CFV 12 hari dilanjutkan CT (maks 4 hari, tanggal bersambungan).
              </span>
            </span>
          </label>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Tanggal Mulai" required>
            <Input
              type="date"
              min={today}
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </Field>
          <Field label="Tanggal Selesai" required>
            <Input
              type="date"
              min={startDate || today}
              value={effectiveEnd}
              readOnly={packageMode && isCfv}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </Field>
        </div>

        <Field label="Jumlah Hari">
          <Input
            value={totalDays === null ? "" : `${totalDays} hari`}
            readOnly
            placeholder="Otomatis dari rentang tanggal"
            className="bg-slate-50 font-semibold"
          />
        </Field>

        {packageMode && isCfv && (
          <Card className="border-emerald-200 bg-emerald-50/60 !p-3">
            <p className="mb-2 text-sm font-bold text-emerald-900">Ringkasan Paket</p>
            <div className="space-y-1 text-sm text-slate-700">
              <p>
                <span className="font-semibold">CFV (12 hari):</span>{" "}
                {startDate ? `${formatDateID(startDate)} – ${formatDateID(effectiveEnd)}` : "—"}
              </p>
              <p>
                <span className="font-semibold">CT lanjutan:</span>{" "}
                {ctStart ? `${formatDateID(ctStart)} – ${formatDateID(ctEnd)}` : "—"}
              </p>
            </div>
            <div className="mt-2">
              <Field label="Lama CT lanjutan (1–4 hari)">
                <Input
                  type="number"
                  min={1}
                  max={4}
                  value={ctDays}
                  onChange={(e) => setCtDays(e.target.value)}
                />
              </Field>
            </div>
          </Card>
        )}

        <Field label="Alasan" required>
          <Textarea
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Contoh: pulang kampung / keperluan keluarga"
          />
        </Field>

        <Field label="Alamat Selama Cuti">
          <Textarea
            rows={2}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Alamat tempat tinggal selama cuti"
          />
        </Field>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Nomor Kontak">
            <Input
              type="tel"
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              placeholder="08xxxxxxxxxx"
            />
          </Field>
          <Field label="Catatan">
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Catatan tambahan (opsional)"
            />
          </Field>
        </div>

        <p className="text-xs text-slate-500">
          ℹ️ Pengajuan minimal <span className="font-semibold">10 hari</span> sebelum tanggal mulai.
        </p>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            variant="secondary"
            className="flex-1"
            disabled={busy !== null}
            onClick={handleDraft}
          >
            {busy === "draft" ? "Menyimpan…" : "Simpan Draft"}
          </Button>
          <Button className="flex-1" disabled={busy !== null} onClick={handleSubmit}>
            {busy === "submit" ? "Mengajukan…" : "Ajukan"}
          </Button>
        </div>
      </Card>

      {options.length === 0 && (
        <EmptyState
          title="Jenis tidak tersedia"
          hint="Tidak ada jenis cuti/izin aktif untuk kategori ini."
        />
      )}
    </div>
  );
}
