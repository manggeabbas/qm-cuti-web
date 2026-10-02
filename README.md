# Web App Pengajuan Cuti, Izin & Monitoring Jadwal — QM YWI

Aplikasi web (Next.js 15 + TypeScript + PostgreSQL via Prisma) untuk mengelola
pengajuan cuti/izin, approval berjenjang, saldo cuti (ledger), jadwal shift & OFF,
kalender, notifikasi Telegram/WeCom, laporan, dan audit log — sesuai PRD v2.0.

## Persyaratan

- Node.js 20+ (teruji di Node 24)
- PostgreSQL 14+

## Instalasi (development)

```bash
cd ~/workspace/qm-cuti-web
npm install

# 1. Buat database & user PostgreSQL
sudo -u postgres psql -c "CREATE USER qm_cuti WITH PASSWORD 'ganti-dengan-password-kuat';"
sudo -u postgres psql -c "CREATE DATABASE qm_cuti OWNER qm_cuti;"
sudo -u postgres psql -c "ALTER USER qm_cuti CREATEDB;"   # untuk migrate

# 2. Konfigurasi environment
# edit .env: DATABASE_URL, TELEGRAM_BOT_TOKEN, APP_URL

# 3. Migrasi + seed
npx prisma migrate dev
npx prisma db seed

# 4. Jalankan
npm run dev
# buka http://localhost:3000
```

Akun demo (password bawaan, **wajib diganti di production**):

| Username | Password | Role |
|---|---|---|
| admin | admin123 | ADMIN |
| spv1 | cuti123 | SPV |
| foreman1 | cuti123 | FOREMAN |
| wafor1 | cuti123 | WAFOR |
| koord1 | cuti123 | KOORDINATOR |
| crew1 / crew2 / crew3 | cuti123 | EMPLOYEE |

## Environment variables

| Key | Wajib | Keterangan |
|---|---|---|
| DATABASE_URL | Ya | `postgresql://user:pass@host:5432/qm_cuti` |
| TELEGRAM_BOT_TOKEN | Tidak | Token bot Telegram untuk notifikasi |
| WECOM_WEBHOOK_URL | Tidak | Webhook robot WeCom (opsional) |
| APP_URL | Tidak | URL publik aplikasi (untuk tombol notifikasi), default `http://localhost:3000` |
| PAIRING_SECRET | Tidak | Secret kode pairing Telegram (default: pakai bot token) |
| ADMIN_PASSWORD | Tidak | Password akun admin saat seed |

> Semua secret hanya di `.env` (chmod 600). Jangan commit `.env`.

## Worker notifikasi Telegram

Notifikasi ditulis ke tabel `Notification` (status PENDING) oleh aplikasi,
lalu dikirim worker terpisah. Kegagalan worker **tidak** menggagalkan transaksi cuti.

```bash
# manual
node scripts/notify-worker.ts

# cron tiap menit (contoh)
* * * * * cd /home/hatch/workspace/qm-cuti-web && /usr/bin/node scripts/notify-worker.ts >> /var/log/qm-cuti-notify.log 2>&1
```

Atau via API (admin): `POST /api/notifications/process`.

### Binding akun Telegram

1. Admin: `GET /api/admin/telegram/pairing?employeeId=<id>` → dapat kode.
2. Karyawan: buka bot Telegram, kirim `/start <KODE>`.
3. Atau manual oleh admin: `POST /api/admin/telegram/link` `{employeeId, telegramUserId}`.
4. (Opsional) pasang webhook: `https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://<host>/api/telegram/webhook`

## Aturan bisnis (ringkas)

Seluruh aturan terpusat di `src/lib/leave/validation.ts` (teruji 25 unit test):

- **CFV**: hak 12 hari, aktif setelah 5 bulan masa kerja, pengambilan tepat 12 hari.
- **CT**: 12 hari/tahun, aktif setelah 1 tahun; maks 6 hari tunggal; maks 4 hari bila digabung CFV;
  jarak antar CT min 7 hari; setelah paket CFV(12)+CT(4) butuh jarak 30 hari.
- **Paket CFV+CT**: urutan wajib CFV dulu lalu CT bersambungan.
- **Minimum notice**: 10 hari (configurable via Pengaturan).
- **Saldo**: ledger transaksi (`LeaveBalanceTransaction`); status PENDING tidak mengurangi saldo final.
- **Konflik**: overlap milik sendiri (blokir), konflik regu (WARN/BLOKIR configurable),
  konflik jabatan Wafor/Foreman/Koordinator (satu kelompok operasional).
- **OFF**: 1x/minggu (Kam–Sel), Rabu = OFF bersama; batas OFF regu <7 orang → 1/hari, ≥7 → 2/hari.
- **Workflow default**: Foreman/Wafor → SPV (configurable per regu, tabel `ApprovalWorkflow`).

Semua angka di atas configurable di menu **Pengaturan** (tabel `SystemSetting`).

## Struktur proyek

```
prisma/            schema + migrasi + seed.ts
scripts/           notify-worker.ts (cron)
src/
  app/
    (auth)/login   halaman login
    (app)/         halaman terproteksi (dashboard, pengajuan, approval, kalender, ...)
    api/           REST API per domain (/api/auth, /api/employees, /api/leave-requests, ...)
  lib/
    leave/         validation.ts (business rules), balance.ts (ledger), workflow.ts
    notify/        service.ts (enqueue), telegram.ts, wechat.ts, worker.ts, pairing.ts
    reports/       builders.ts + export.ts (xlsx/csv/pdf)
    db.ts auth.ts rbac.ts audit.ts settings.ts dates.ts
  components/      ui.tsx, AppShell.tsx
storage/           lampiran upload (protected, diserve via API berotorisasi)
```

## Test

```bash
npm test          # vitest (unit test LeaveValidationService)
npx tsc --noEmit  # typecheck
```

## Production (garis besar)

1. `npm run build` lalu `npm start` (atau deploy ke VPS).
2. Jalankan di balik reverse proxy (nginx/caddy) dengan HTTPS.
3. `npx prisma migrate deploy` (bukan `migrate dev`).
4. Backup PostgreSQL terjadwal (`pg_dump` harian).
5. Ganti semua password demo; isi `TELEGRAM_BOT_TOKEN`; pasang cron worker.
6. Pastikan `storage/` tidak terekspos langsung — hanya via API download berotorisasi.
