# PROJECT CONTRACT — QM Cuti Web App

Dokumen ini adalah kontrak kerja untuk semua kontributor (termasuk subagent).
Patuhi agar modul yang dikerjakan paralel bisa menyatu tanpa konflik.

## 1. Stack & Lokasi

- Next.js 15 (App Router) + TypeScript strict, Tailwind CSS v4, Prisma + PostgreSQL.
- Root proyek: `~/workspace/qm-cuti-web`
- Bahasa UI: **Bahasa Indonesia**. Mobile-first (karyawan ajukan cuti dari HP).
- Timezone aplikasi: `Asia/Makassar`.

## 2. Struktur Direktori

```
src/
  app/
    (auth)/login/page.tsx            # halaman login
    (app)/layout.tsx                  # layout terproteksi (sidebar/bottom-nav)
    (app)/dashboard/page.tsx          # dashboard sesuai role
    (app)/pengajuan/page.tsx          # daftar + form pengajuan (employee)
    (app)/pengajuan/[id]/page.tsx
    (app)/approval/page.tsx           # inbox approval (foreman/wafor/koordinator/spv)
    (app)/kalender/page.tsx
    (app)/karyawan/...                # master karyawan (admin, approver read)
    (app)/organisasi/...              # divisi/departemen/seksi/regu (admin)
    (app)/cuti/...                    # jenis cuti, saldo (admin)
    (app)/shift-off/...               # shift roster + OFF (admin/foreman)
    (app)/laporan/...                 # laporan + export
    (app)/notifikasi/...              # log notifikasi (admin)
    (app)/audit/...                   # audit log (admin)
    (app)/pengaturan/...              # system settings (admin)
    api/
      auth/login|logout|me/route.ts
      employees/route.ts, employees/[id]/route.ts
      org/divisions|departments|sections|teams (+ [id])
      positions/route.ts
      leave-types/route.ts (+ [id])
      leave-requests/route.ts, [id]/route.ts
      leave-requests/[id]/submit|approve|reject|return|cancel/route.ts
      leave-balances/route.ts         # GET ?employeeId=&year=
      approvals/inbox/route.ts        # pengajuan menunggu approval user login
      calendar/route.ts               # GET ?from=&to=&teamId=&...
      shifts/rosters/route.ts
      off/route.ts                    # GET/POST jadwal OFF
      holidays/route.ts
      notifications/route.ts          # log (admin)
      reports/leave|balance|approval|conflict/route.ts  # ?format=xlsx|csv|pdf
      admin/settings/route.ts
      admin/audit-logs/route.ts
      admin/users/route.ts
  lib/
    db.ts            # PrismaClient singleton
    auth.ts          # hashPassword, verifyPassword, createSession, getSessionUser,
                     # requireUser(), cookie SESSION_COOKIE="qm_session"
    rbac.ts          # hasRole(user, ...roles), requireRole(...), PERMISSIONS map
    audit.ts         # auditLog({userId, action, entityType, entityId, oldValue, newValue, req})
    settings.ts      # getSetting(key, fallback) — cache in-memory 60 detik
    api.ts           # ok(data), fail(code, message, status) — bentuk respons standar
    dates.ts         # helper tanggal: eachDay, isWeekend, formatID, diffDays
    leave/
      validation.ts  # LeaveValidationService (SATU-SATUNYA tempat business rule cuti)
      balance.ts     # ledger: allocate, consumeOnApprove, refundOnCancel, getBalance
      workflow.ts    # resolveWorkflow(employee), advance(), canApprove(user, request)
      conflicts.ts   # detectConflicts(request) -> {type, severity, description}[]
    notify/
      service.ts     # NotificationService.enqueue(event, payload)
      telegram.ts    # TelegramAdapter.send()
      wechat.ts      # WeChatAdapter (stub, siap diisi)
      worker.ts      # processPendingNotifications() — dipanggil cron tiap menit
    reports/
      excel.ts csv.ts pdf.ts
  components/
    ui.tsx           # Button, Card, Input, Select, Badge, Modal, Table, EmptyState, Spinner
    layout.tsx       # AppShell (sidebar desktop, bottom-nav mobile)
prisma/
  schema.prisma
  seed.ts            # node prisma/seed.ts — roles, admin, settings, shift pattern, contoh data
```

## 3. Kontrak API

- Semua route API mengembalikan JSON: sukses `{ "ok": true, "data": ... }`,
  gagal `{ "ok": false, "error": { "code": "NOT_FOUND", "message": "..." } }`.
- Gunakan helper `ok()` / `fail()` dari `@/lib/api`.
- Auth: `const user = await requireUser()` di awal handler (throw 401 jika tidak login).
  `requireRole("ADMIN")` / `requireRole("FOREMAN","SPV",...)` untuk otorisasi.
- Validasi input dengan **zod** di setiap route POST/PUT/PATCH.
- Setiap mutasi penting → `await auditLog({...})` (LOGIN, CREATE_EMPLOYEE,
  CREATE_LEAVE_REQUEST, APPROVE, REJECT, CANCEL, CHANGE_BALANCE, CHANGE_SETTING,
  SEND_NOTIFICATION).
- Jangan pernah kirim `passwordHash` ke client. Jangan taruh secret di frontend.

## 4. Aturan Bisnis (ringkasan — implementasi lengkap HANYA di `lib/leave/validation.ts`)

Sumber: PRD v2.0 §9–§14, §54. Nilai default dari `system_settings` (jangan hard-code):

| Key | Default |
|---|---|
| CFV_DAYS | 12 |
| CFV_ELIGIBILITY_MONTHS | 5 |
| CT_ANNUAL_DAYS | 12 |
| CT_MAX_SINGLE | 6 |
| CT_MAX_WITH_CFV | 4 |
| CT_MIN_GAP_DAYS | 7 |
| POST_CFV_CT_GAP_DAYS | 30 |
| MIN_NOTICE_DAYS | 10 |
| TEAM_OFF_LIMIT_SMALL | 1 |
| TEAM_OFF_LIMIT_LARGE | 2 |
| TEAM_LARGE_THRESHOLD | 7 |

- CFV: hak aktif setelah 5 bulan dari effectiveDate; pengambilan tepat 12 hari.
- CT: hak aktif setelah 1 tahun; maks 6 hari jika sendiri; maks 4 hari jika digabung CFV;
  jarak antar pengajuan CT min 7 hari; setelah paket CFV(12)+CT(4), CT berikutnya
  butuh jarak 30 hari.
- Paket CFV+CT: urutan wajib CFV dulu baru CT (tanggal bersambungan).
- Minimum notice 10 hari sebelum startDate.
- Overlap dengan pengajuan aktif milik sendiri → tolak.
- Konflik regu: hitung anggota regu cuti pada periode tsb; batas dari setting
  (WARN atau BLOCK sesuai `CONFLICT_SEVERITY_*`).
- Konflik jabatan: Wafor+Foreman+Koordinator satu kelompok operasional
  (`position.isOperationalGroup`).
- Saldo via ledger; PENDING tidak mengurangi saldo final. Tampilan: Hak/Terpakai/Pending/Tersedia.
- OFF: 1x/minggu per karyawan, pilih Kamis–Selasa; Rabu = OFF bersama (otomatis).
  Regu <7 orang → maks 1 OFF/hari; ≥7 → maks 2 OFF/hari (warning).
- Workflow default: FOREMAN → SPV (WAFOR boleh approve sebagai pengganti FOREMAN;
  KOORDINATOR step opsional via workflow config per regu).

## 5. Notifikasi

- `NotificationService.enqueue(event, {requestId, ...})` dipanggil SETELAH transaksi
  DB sukses. Worker `processPendingNotifications()` mengirim via adapter.
- Kegagalan notifikasi TIDAK PERNAH menggagalkan transaksi cuti (PRD §56).
- Template pesan mengikuti PRD §31–§35 (Bahasa Indonesia).

## 6. Gaya Kode

- TypeScript strict, async/await, tanpa `any` kecuali terpaksa (beri komentar).
- Prisma: gunakan transaksi (`db.$transaction`) untuk operasi multi-tabel.
- Tanggal: simpan sebagai Date (kolom @db.Date untuk tanggal murni).
- Test: vitest untuk `lib/leave/*` (wajib untuk LeaveValidationService).

## 7. Definisi Selesai per Modul

API bekerja + UI mobile-first + validasi server-side + audit tercatat +
tidak ada secret di kode + lolos `npm run build` dan `npx tsc --noEmit`.
