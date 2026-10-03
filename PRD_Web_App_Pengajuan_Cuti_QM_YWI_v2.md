# PRD --- Web App Pengajuan Cuti, Izin & Monitoring Jadwal QM YWI

**Versi:** 2.0\
**Status:** Draft Final untuk Development\
**Platform:** Web Application\
**Target:** QM YWI\
**Database:** PostgreSQL\
**Notification Channel:** Telegram + WeChat/WeCom\
**Responsive:** Desktop, Tablet, Smartphone

------------------------------------------------------------------------

## 1. Executive Summary

Web App Pengajuan Cuti, Izin & Monitoring Jadwal QM YWI merupakan
aplikasi berbasis web untuk mengelola:

-   Data karyawan.
-   Hak dan saldo cuti.
-   Pengajuan cuti.
-   Pengajuan izin.
-   Approval atasan.
-   Kalender cuti.
-   Jadwal shift.
-   Jadwal OFF.
-   Konflik jadwal antar karyawan.
-   Riwayat cuti.
-   Laporan.
-   Notifikasi otomatis.

Aplikasi menggunakan **database terpusat** sebagai sumber data utama.

Telegram dan WeChat/WeCom digunakan sebagai **notification channel**,
bukan sebagai database atau sistem utama.

------------------------------------------------------------------------

## 2. Tujuan

### 2.1 Tujuan Utama

Mendigitalisasi proses administrasi cuti dan izin di QM YWI sehingga:

1.  Pengajuan dapat dilakukan melalui smartphone/komputer.
2.  Atasan dapat memeriksa pengajuan dengan cepat.
3.  Sistem otomatis memeriksa aturan cuti.
4.  Konflik jadwal dapat diketahui sebelum pengajuan disetujui.
5.  Saldo cuti dihitung secara konsisten.
6.  Riwayat cuti tersimpan secara terpusat.
7.  Admin dapat menghasilkan laporan.
8.  Pihak terkait mendapatkan notifikasi otomatis.

------------------------------------------------------------------------

## 3. Scope

### 3.1 In Scope

#### Employee Management

-   Master karyawan.
-   Struktur organisasi.
-   Jabatan.
-   Regu.
-   Atasan.

#### Leave Management

-   CFV.
-   CT.
-   Cuti khusus.
-   Izin.
-   Saldo cuti.
-   Riwayat.

#### Approval

-   Foreman/Wafor.
-   Koordinator jika diperlukan.
-   SPV.
-   Admin.

#### Scheduling

-   Shift.
-   Regu.
-   OFF.
-   Kalender.

#### Notification

-   Telegram.
-   WeChat/WeCom.

#### Reporting

-   Laporan cuti.
-   Saldo.
-   Konflik.
-   Approval.

### 3.2 Out of Scope MVP

Fitur berikut tidak wajib pada versi pertama:

-   Payroll.
-   Perhitungan gaji.
-   Attendance hardware.
-   Integrasi fingerprint.
-   Integrasi ERP.
-   WhatsApp.
-   Mobile native application.

Fitur tersebut dapat ditambahkan kemudian.

------------------------------------------------------------------------

## 4. User Role

### 4.1 Employee

Hak:

-   Login.
-   Melihat profil.
-   Melihat saldo.
-   Mengajukan cuti.
-   Mengajukan izin.
-   Melihat pengajuan sendiri.
-   Melihat kalender yang diizinkan.
-   Membatalkan pengajuan sesuai aturan.

### 4.2 Koordinator

Hak:

-   Melihat pengajuan anggota yang relevan.
-   Melihat jadwal.
-   Memeriksa konflik.
-   Memberikan rekomendasi/approval jika dikonfigurasi.
-   Menerima notifikasi.

### 4.3 Wakil Foreman

Hak:

-   Melihat pengajuan bawahannya.
-   Memeriksa konflik.
-   Approval/rekomendasi.
-   Melihat kalender regu.
-   Menerima notifikasi.

### 4.4 Foreman

Hak:

-   Melihat pengajuan bawahan.
-   Memeriksa konflik.
-   Approval.
-   Melihat kalender.
-   Menerima notifikasi.

### 4.5 SPV

Hak:

-   Melihat pengajuan dalam area tanggung jawab.
-   Approval final sesuai workflow.
-   Melihat kalender.
-   Melihat statistik.
-   Menerima notifikasi.

### 4.6 Admin

Hak penuh terhadap administrasi:

-   Employee.
-   Jabatan.
-   Regu.
-   Shift.
-   Jenis cuti.
-   Saldo.
-   Hari libur.
-   Approval workflow.
-   Notification.
-   Laporan.
-   Audit log.

------------------------------------------------------------------------

## 5. Struktur Organisasi

Sistem harus mendukung struktur:

``` text
Division
   │
   └── Department
          │
          └── Section
                 │
                 └── Team/Regu
                        │
                        └── Employee
```

Contoh:

``` text
QM
└── YWI
    ├── Inspeksi Lapangan
    ├── Laboratorium
    └── Section lainnya
```

Struktur harus configurable.

------------------------------------------------------------------------

## 6. Master Data Karyawan

Field minimal:

  Field                     Required
  ------------------------- ----------
  NIK                       Ya
  Nama                      Ya
  Tanggal Efektif Bekerja   Ya
  Jabatan                   Ya
  Level                     Ya
  Divisi                    Ya
  Departemen                Ya
  Section                   Ya
  Regu                      Ya
  Atasan                    Ya
  Email                     Tidak
  Nomor Telepon             Tidak
  Status Karyawan           Ya

Status:

``` text
ACTIVE
INACTIVE
RESIGNED
```

------------------------------------------------------------------------

## 7. Jabatan

Minimal mendukung:

-   SPV.
-   Wakil SPV.
-   Foreman.
-   Wakil Foreman.
-   Koordinator.
-   Crew.

Jabatan dapat ditambahkan oleh Admin.

------------------------------------------------------------------------

## 8. Regu

Sistem mendukung:

-   REGU A
-   REGU B
-   REGU C
-   LABORATORIUM

Setiap karyawan hanya mempunyai satu regu aktif pada suatu periode.

------------------------------------------------------------------------

## 9. Jenis Cuti

### 9.1 CFV

**Cuti Family Visit**

Aturan:

-   Hak: 12 hari.
-   Pengambilan: tepat 12 hari.
-   Hak aktif setelah 5 bulan sejak tanggal efektif bekerja.

### 9.2 CT

**Cuti Tahunan**

Aturan:

-   Hak: 12 hari/tahun.
-   Hak aktif setelah 1 tahun.
-   Maksimal 6 hari jika berdiri sendiri.
-   Maksimal 4 hari jika digabung dengan CFV.

### 9.3 Cuti Khusus

Jenis dapat dikonfigurasi Admin.

Contoh:

-   Pernikahan.
-   Kelahiran.
-   Kematian keluarga.
-   Keperluan khusus.

### 9.4 Izin

Jenis izin dapat dikonfigurasi.

Contoh:

-   Izin pribadi.
-   Izin terlambat.
-   Izin keluar area.
-   Izin lainnya.

------------------------------------------------------------------------

## 10. Aturan Hak Cuti

### CFV

``` text
Tanggal Efektif
      ↓
    +5 bulan
      ↓
CFV Available
```

### CT

``` text
Tanggal Efektif
      ↓
    +1 tahun
      ↓
CT Available
```

Sistem harus menghitung eligibility secara otomatis.

------------------------------------------------------------------------

## 11. Aturan CT

### CT tunggal

Maksimal:

``` text
6 hari
```

### CT bersama CFV

Maksimal:

``` text
4 hari
```

### Jarak CT

Minimal:

``` text
7 hari
```

antara pengajuan CT sesuai aturan yang berlaku.

### Setelah CFV + CT

Jika karyawan telah mengambil:

``` text
CFV 12 hari
+
CT 4 hari
=
16 hari
```

maka pengajuan CT berikutnya harus memenuhi jarak:

``` text
30 hari
```

------------------------------------------------------------------------

## 12. Aturan CFV + CT

Jika karyawan mengajukan paket:

``` text
CFV + CT
```

urutan wajib:

``` text
CFV
↓
CT
```

Contoh valid:

``` text
CFV : 1–12 Oktober
CT  : 13–16 Oktober
```

Contoh tidak valid:

``` text
CT  : 1–4 Oktober
CFV : 5–16 Oktober
```

------------------------------------------------------------------------

## 13. Minimum Notice

Pengajuan cuti harus dilakukan minimal:

``` text
10 hari
```

sebelum tanggal mulai.

Nilai ini harus configurable melalui system settings.

------------------------------------------------------------------------

## 14. Perhitungan Hari

Sistem harus mendukung konfigurasi:

-   Kalender kerja.
-   Hari libur.
-   Weekend.
-   Hari kerja.
-   Hari shift.

Admin dapat menentukan apakah hari tertentu dihitung sebagai hari cuti.

------------------------------------------------------------------------

## 15. Form Pengajuan

Form:

``` text
Jenis Pengajuan *
Jenis Cuti/Izin *
Tanggal Mulai *
Tanggal Selesai *
Jumlah Hari
Alasan *
Alamat Selama Cuti
Nomor Kontak
Lampiran
Catatan
```

Jumlah hari dihitung otomatis.

User tidak boleh mengubah hasil perhitungan secara manual.

------------------------------------------------------------------------

## 16. Validasi Pengajuan

Sebelum submit, sistem wajib memeriksa:

1.  Eligibility.
2.  Saldo.
3.  Durasi.
4.  Minimum notice.
5.  Overlap.
6.  Konflik regu.
7.  Konflik jabatan.
8.  Aturan CFV/CT.
9.  Jarak antar cuti.
10. Hari kerja.
11. Lampiran jika diwajibkan.

------------------------------------------------------------------------

## 17. Saldo Cuti

Saldo harus menggunakan ledger/transaksi.

Contoh:

``` text
Allocation       +12
Approved Leave    -3
Cancellation      +3
Approved Leave    -2
--------------------
Remaining         10
```

Status `PENDING` tidak langsung mengurangi saldo final.

Sistem dapat menampilkan:

``` text
Hak       : 12
Terpakai  : 3
Pending   : 2
Tersedia  : 7
```

------------------------------------------------------------------------

## 18. Overlap Detection

Sistem tidak boleh mengizinkan pengajuan aktif yang bertabrakan dengan
pengajuan aktif lainnya milik karyawan yang sama.

Contoh:

``` text
Pengajuan lama:
10–12 Oktober

Pengajuan baru:
11–13 Oktober
```

Pengajuan baru ditolak.

------------------------------------------------------------------------

## 19. Konflik Regu

Sistem memeriksa jumlah anggota regu yang cuti pada periode yang sama.

Contoh:

``` text
REGU A

Ahmad    10–12 Okt
Budi     10–12 Okt
Candra   10–12 Okt
```

Jika Candra menyebabkan jumlah cuti melewati batas konfigurasi, sistem
memberikan warning atau memblokir pengajuan sesuai setting.

------------------------------------------------------------------------

## 20. Konflik Jabatan

Wafor, Foreman, dan Koordinator diperlakukan sebagai satu kelompok
operasional untuk pengecekan konflik.

Sistem harus dapat mencegah pengajuan bersamaan apabila aturan
organisasi melarangnya.

Contoh:

``` text
Foreman A       Cuti
Wakil Foreman A Cuti
Koordinator A   Cuti
```

Jika konfigurasi melarang kondisi tersebut, sistem memblokir atau
memberikan warning.

------------------------------------------------------------------------

## 21. Shift

Sistem mendukung pola:

``` text
3 Shift
3 Regu
```

### Pagi

Kamis--Selasa:

``` text
07:00–15:00
```

Rabu:

``` text
07:00–19:00
```

### Sore

Kamis--Selasa:

``` text
15:00–23:00
```

### Malam

Kamis--Selasa:

``` text
23:00–07:00
```

Rabu:

``` text
19:00–07:00
```

------------------------------------------------------------------------

## 22. OFF

Setiap karyawan memiliki:

``` text
1 OFF individu / minggu
```

OFF individu hanya dapat dipilih:

-   Kamis
-   Jumat
-   Sabtu
-   Minggu
-   Senin
-   Selasa

Rabu adalah:

``` text
OFF BERSAMA
```

------------------------------------------------------------------------

## 23. Aturan OFF Regu

Jika jumlah anggota regu:

### \< 7 orang

Maksimal:

``` text
1 orang OFF pada hari yang sama
```

### ≥ 7 orang

Maksimal:

``` text
2 orang OFF pada hari yang sama
```

Sistem memberikan warning ketika batas dilampaui.

------------------------------------------------------------------------

## 24. Workflow Approval

Workflow default:

``` text
Employee
   ↓
Submit
   ↓
Foreman / Wafor
   ↓
SPV
   ↓
Approved
```

Jika diperlukan:

``` text
Employee
   ↓
Koordinator
   ↓
Foreman
   ↓
SPV
   ↓
Approved
```

Workflow harus configurable.

------------------------------------------------------------------------

## 25. Status Pengajuan

``` text
DRAFT
SUBMITTED
PENDING_COORDINATOR
PENDING_WAFOR
PENDING_FOREMAN
PENDING_SPV
APPROVED
REJECTED
CANCEL_REQUESTED
CANCELLED
COMPLETED
```

Tidak semua status harus digunakan dalam setiap konfigurasi.

------------------------------------------------------------------------

## 26. Approval

Approver dapat:

### Approve

Melanjutkan workflow.

### Reject

Wajib mengisi alasan.

### Return/Revision

Opsional untuk meminta karyawan memperbaiki data.

------------------------------------------------------------------------

## 27. Dashboard Employee

Menampilkan:

``` text
Nama
NIK
Jabatan
Regu

CFV
Hak / Terpakai / Sisa

CT
Hak / Terpakai / Sisa

Pengajuan Pending
Pengajuan Approved
Pengajuan Rejected
```

Quick action:

``` text
+ Ajukan Cuti
+ Ajukan Izin
Riwayat
Kalender
```

------------------------------------------------------------------------

## 28. Dashboard Foreman/SPV

Menampilkan:

-   Pending approval.
-   Pengajuan hari ini.
-   Karyawan sedang cuti.
-   Konflik.
-   Kalender regu.
-   Jumlah karyawan aktif.
-   Statistik cuti.

------------------------------------------------------------------------

## 29. Kalender

Calendar view:

-   Month.
-   Week.
-   Day.

Filter:

-   Regu.
-   Jabatan.
-   Jenis Cuti.
-   Status.
-   Employee.

Data sensitif hanya ditampilkan sesuai permission.

------------------------------------------------------------------------

## 30. Bot Notification

### Prinsip

Web App + PostgreSQL adalah **source of truth**.

Bot hanya digunakan sebagai kanal komunikasi.

``` text
Web App
   ↓
Database
   ↓
Notification Service
   ├── Telegram
   └── WeChat/WeCom
```

Jika bot offline, transaksi cuti tetap tersimpan.

------------------------------------------------------------------------

## 31. Telegram Notification

Ketika pengajuan dibuat:

``` text
🔔 PENGAJUAN CUTI BARU

Nama     : Ahmad
NIK      : 123456
Jabatan  : Crew
Regu     : A

Jenis    : Cuti Tahunan
Periode  : 10–12 Oktober 2026
Durasi   : 3 Hari

Status:
Menunggu Approval Foreman

[Buka Pengajuan]
```

Button `Buka Pengajuan` membuka halaman Web App.

------------------------------------------------------------------------

## 32. Notifikasi Approval

Ketika Foreman approve:

``` text
✅ APPROVAL CUTI

Karyawan : Ahmad
Periode  : 10–12 Oktober
Durasi   : 3 Hari

Disetujui:
Foreman

Status:
Menunggu Approval SPV
```

------------------------------------------------------------------------

## 33. Notifikasi Reject

``` text
❌ PENGAJUAN DITOLAK

Karyawan : Ahmad
Periode  : 10–12 Oktober

Alasan:
Konflik jadwal regu.

Silakan buka Web App
untuk informasi lengkap.
```

------------------------------------------------------------------------

## 34. Notifikasi Konflik

``` text
⚠️ KONFLIK JADWAL

Regu: A
Periode: 10–12 Oktober

Sudah terdapat:
1. Ahmad
2. Budi

Pengajuan baru:
3. Candra

Mohon dilakukan pemeriksaan.
```

------------------------------------------------------------------------

## 35. Notifikasi Pembatalan

``` text
🔄 PEMBATALAN CUTI

Karyawan : Ahmad
Periode  : 10–12 Oktober
Status   : Cancellation Requested

Mohon dilakukan pemeriksaan.
```

------------------------------------------------------------------------

## 36. WeChat / WeCom

Sistem harus memiliki notification adapter:

``` text
NotificationService
       │
       ├── TelegramAdapter
       │
       └── WeChatAdapter
```

Implementasi final mengikuti platform yang tersedia di perusahaan:

-   WeChat Official Account.
-   WeCom / 企业微信.
-   API internal perusahaan.

Jenis platform harus ditentukan sebelum integrasi production.

------------------------------------------------------------------------

## 37. Notification Recipient

Penerima ditentukan berdasarkan:

-   Struktur organisasi.
-   Jabatan.
-   Regu.
-   Workflow.
-   Permission.

Contoh:

``` text
Employee submit
       ↓
Foreman
       ↓
SPV
```

Notification Service otomatis mengetahui siapa yang harus menerima
pesan.

------------------------------------------------------------------------

## 38. Telegram Account Binding

Tabel:

``` text
telegram_users

id
employee_id
telegram_user_id
username
is_active
created_at
updated_at
```

Binding dapat menggunakan:

``` text
NIK
+
OTP/token
```

atau mekanisme pairing yang ditentukan Admin.

Telegram User ID menjadi identitas utama, bukan username.

------------------------------------------------------------------------

## 39. Notification Log

Setiap notifikasi dicatat:

``` text
id
event_type
recipient_id
channel
message
status
sent_at
error_message
created_at
```

Status:

``` text
PENDING
SENT
FAILED
```

Sistem dapat melakukan retry terhadap notifikasi gagal.

------------------------------------------------------------------------

## 40. Notification Event

Minimal:

``` text
LEAVE_SUBMITTED
LEAVE_APPROVED
LEAVE_REJECTED
LEAVE_CANCEL_REQUESTED
LEAVE_CANCELLED
LEAVE_CONFLICT
APPROVAL_REQUIRED
BALANCE_CHANGED
```

------------------------------------------------------------------------

## 41. Admin Dashboard

Dashboard menampilkan:

``` text
Total Employee
Pending Approval
Cuti Hari Ini
Cuti Bulan Ini
Pengajuan Ditolak
Konflik
Notification Failed
```

------------------------------------------------------------------------

## 42. Master Data Admin

Admin dapat mengelola:

### Employee

CRUD.

### Department

CRUD.

### Section

CRUD.

### Regu

CRUD.

### Jabatan

CRUD.

### Jenis Cuti

CRUD.

### Hari Libur

CRUD.

### Shift

CRUD.

### Approval Workflow

Configuration.

### Notification

Configuration.

------------------------------------------------------------------------

## 43. Laporan

### Laporan Cuti

Filter:

-   Periode.
-   Employee.
-   Regu.
-   Jabatan.
-   Section.
-   Jenis cuti.
-   Status.

### Laporan Saldo

``` text
NIK
Nama
Hak
Terpakai
Pending
Sisa
```

### Laporan Approval

Menampilkan:

-   Pengajuan.
-   Approver.
-   Waktu approval.
-   Status.

### Laporan Konflik

Menampilkan pengajuan yang mengalami conflict detection.

------------------------------------------------------------------------

## 44. Export

Format:

-   XLSX.
-   CSV.
-   PDF.

Export mengikuti filter yang sedang digunakan.

------------------------------------------------------------------------

## 45. Audit Log

Aktivitas yang wajib dicatat:

-   Login.
-   Logout.
-   Create employee.
-   Update employee.
-   Create leave request.
-   Update leave request.
-   Approve.
-   Reject.
-   Cancel.
-   Change balance.
-   Change configuration.
-   Send notification.

Audit log minimal:

``` text
id
user_id
action
entity_type
entity_id
old_value
new_value
ip_address
user_agent
created_at
```

------------------------------------------------------------------------

## 46. Database

Database menggunakan PostgreSQL.

Tabel utama:

``` text
users
roles
permissions
user_roles

employees
divisions
departments
sections
teams

leave_types
leave_balances
leave_balance_transactions

leave_requests
leave_request_approvals
leave_attachments

holidays

shift_types
shift_schedules
off_schedules

notifications
notification_logs
telegram_users
wechat_users

audit_logs
system_settings
```

------------------------------------------------------------------------

## 47. Relasi Utama

``` text
employees
    │
    ├──── leave_balances
    │
    ├──── leave_requests
    │              │
    │              └── approvals
    │
    ├──── shift_schedules
    │
    └──── telegram_users

leave_requests
    │
    ├──── leave_request_approvals
    └──── leave_attachments
```

------------------------------------------------------------------------

## 48. Security

Sistem wajib menerapkan:

-   Password hashing.
-   RBAC.
-   Server-side authorization.
-   Input validation.
-   SQL injection protection.
-   XSS protection.
-   CSRF protection bila diperlukan.
-   Rate limiting.
-   Secure session.
-   Secure file upload.
-   API authorization.

Employee tidak boleh mengakses data employee lain dengan mengubah
URL/API.

------------------------------------------------------------------------

## 49. File Upload

Format:

-   PDF.
-   JPG.
-   JPEG.
-   PNG.

Ukuran maksimum default:

``` text
5 MB
```

File harus disimpan pada protected storage.

URL file tidak boleh dapat diakses tanpa authorization jika berisi data
sensitif.

------------------------------------------------------------------------

## 50. Responsive Design

Aplikasi wajib berjalan pada:

-   Android.
-   iPhone.
-   Tablet.
-   Laptop.
-   Desktop.

Prioritas:

``` text
Mobile-first
```

karena sebagian besar karyawan kemungkinan mengakses pengajuan melalui
smartphone.

------------------------------------------------------------------------

## 51. UI

### Employee

``` text
Dashboard
Pengajuan
Kalender
Riwayat
Profil
```

### Approver

``` text
Dashboard
Approval
Kalender
Karyawan
Laporan
```

### Admin

``` text
Dashboard
Employee
Organisasi
Cuti
Saldo
Shift
Kalender
Approval
Notification
Laporan
Audit Log
Settings
```

------------------------------------------------------------------------

## 52. API

API harus dikelompokkan berdasarkan domain.

Contoh:

``` text
/api/auth
/api/employees
/api/leave-types
/api/leave-balances
/api/leave-requests
/api/approvals
/api/calendar
/api/shifts
/api/notifications
/api/reports
/api/admin
```

Business logic harus berada pada backend/service layer dan tidak hanya
di frontend.

------------------------------------------------------------------------

## 53. Business Rule Engine

Aturan cuti tidak boleh tersebar dalam banyak komponen UI.

Gunakan satu service:

``` text
LeaveValidationService
```

yang bertanggung jawab terhadap:

-   Eligibility.
-   Balance.
-   Duration.
-   Notice period.
-   CFV.
-   CT.
-   Gap.
-   Conflict.
-   Team rules.

Dengan demikian aturan dapat diuji secara terpisah.

------------------------------------------------------------------------

## 54. Configuration

Nilai berikut harus configurable:

``` text
CFV_DAYS = 12
CFV_ELIGIBILITY_MONTHS = 5

CT_ANNUAL_DAYS = 12
CT_MAX_SINGLE = 6
CT_MAX_WITH_CFV = 4

CT_MIN_GAP_DAYS = 7
POST_CFV_CT_GAP_DAYS = 30

MIN_NOTICE_DAYS = 10

TEAM_OFF_LIMIT_SMALL = 1
TEAM_OFF_LIMIT_LARGE = 2
TEAM_LARGE_THRESHOLD = 7
```

**Nilai di atas adalah konfigurasi awal berdasarkan aturan yang telah
ditentukan dan tidak boleh di-hard-code.**

------------------------------------------------------------------------

## 55. Edge Cases

Sistem harus menangani:

### Employee resign

Saldo tidak dapat digunakan setelah status menjadi inactive sesuai
konfigurasi.

### Employee pindah regu

Riwayat tetap menggunakan regu saat transaksi terjadi.

### Employee pindah jabatan

Approval workflow mengikuti konfigurasi yang berlaku pada saat
pengajuan.

### Pengajuan overlap

Ditolak.

### Saldo tidak cukup

Ditolak.

### Notification gagal

Transaksi tetap berhasil dan notification masuk queue/retry.

### Approver tidak tersedia

Admin dapat melakukan reassignment/delegation sesuai permission.

### Perubahan aturan

Pengajuan lama tidak boleh berubah secara retroaktif tanpa tindakan
Admin yang tercatat.

------------------------------------------------------------------------

## 56. Notification Failure

Jika Telegram/WeChat gagal:

``` text
Leave Request
     ↓
Database = SUCCESS
     ↓
Notification = FAILED
```

Sistem tidak boleh membatalkan transaksi cuti hanya karena notifikasi
gagal.

Notification service melakukan retry.

------------------------------------------------------------------------

## 57. MVP Phase

### Phase 1 --- Foundation

-   Project setup.
-   Database.
-   Authentication.
-   Role.
-   Employee.
-   Organization.

### Phase 2 --- Leave

-   Leave type.
-   Balance.
-   Leave request.
-   Validation.
-   History.

### Phase 3 --- Approval

-   Workflow.
-   Foreman.
-   Wafor.
-   SPV.
-   Approval log.

### Phase 4 --- QM YWI Rules

-   CFV.
-   CT.
-   Eligibility.
-   Gap.
-   Notice.
-   Conflict.
-   Regu.

### Phase 5 --- Scheduling

-   Shift.
-   OFF.
-   Calendar.
-   Conflict.

### Phase 6 --- Notification

-   Telegram.
-   Notification service.
-   Notification log.
-   Retry.
-   WeChat/WeCom adapter.

### Phase 7 --- Reporting

-   Dashboard.
-   Excel.
-   CSV.
-   PDF.
-   Audit.

------------------------------------------------------------------------

## 58. Acceptance Criteria

### AC-001 --- Login

User dapat login dan hanya mendapatkan akses sesuai role.

### AC-002 --- Pengajuan

Employee dapat membuat pengajuan dari smartphone.

### AC-003 --- Saldo

Sistem menolak pengajuan jika saldo tidak mencukupi.

### AC-004 --- CFV

Sistem hanya mengizinkan CFV sesuai eligibility dan durasi 12 hari.

### AC-005 --- CT

Sistem menerapkan batas CT sesuai kondisi pengajuan.

### AC-006 --- Notice

Sistem menolak pengajuan yang kurang dari minimum notice.

### AC-007 --- Conflict

Sistem mendeteksi overlap dan konflik regu.

### AC-008 --- Approval

Approver hanya dapat melihat pengajuan yang menjadi kewenangannya.

### AC-009 --- Rejection

Reject wajib memiliki alasan.

### AC-010 --- Balance

Saldo diperbarui setelah final approval.

### AC-011 --- Telegram

Pengajuan baru menghasilkan notifikasi kepada approver yang relevan.

### AC-012 --- Notification Failure

Kegagalan Telegram/WeChat tidak menyebabkan transaksi cuti gagal.

### AC-013 --- Audit

Approval/rejection/perubahan saldo tercatat dalam audit log.

### AC-014 --- Mobile

Seluruh workflow utama dapat dilakukan dari smartphone.

------------------------------------------------------------------------

## 59. Definition of Done

Aplikasi dianggap siap untuk pilot jika:

-   Authentication bekerja.
-   Role bekerja.
-   Employee master bekerja.
-   Leave request bekerja.
-   Business rules bekerja.
-   Approval bekerja.
-   Balance bekerja.
-   Conflict detection bekerja.
-   Calendar bekerja.
-   Telegram notification bekerja.
-   Notification failure handling bekerja.
-   Audit log bekerja.
-   Mobile responsive.
-   Database backup tersedia.
-   Tidak terdapat credential rahasia di source code.
-   Tidak terdapat data dummy pada production.
-   Business logic utama memiliki automated test.

------------------------------------------------------------------------

## 60. Rekomendasi Arsitektur Final

``` text
                    ┌───────────────────┐
                    │       USER        │
                    │ Android / Desktop │
                    └─────────┬─────────┘
                              │
                              ▼
                    ┌───────────────────┐
                    │     WEB APP       │
                    │ Next.js + TS      │
                    └─────────┬─────────┘
                              │
                              ▼
                    ┌───────────────────┐
                    │   Backend/API     │
                    │ Business Logic    │
                    └─────────┬─────────┘
                              │
               ┌──────────────┼──────────────┐
               ▼              ▼              ▼
        ┌────────────┐ ┌────────────┐ ┌──────────────┐
        │ PostgreSQL │ │   Storage  │ │ Notification │
        │            │ │            │ │   Service    │
        └────────────┘ └────────────┘ └───────┬──────┘
                                              │
                                    ┌─────────┴─────────┐
                                    ▼                   ▼
                              ┌───────────┐       ┌───────────┐
                              │ Telegram  │       │ WeChat    │
                              │ Bot API   │       │ / WeCom   │
                              └───────────┘       └───────────┘
```

------------------------------------------------------------------------

## 61. Prinsip Implementasi

Developer atau AI coding agent wajib:

1.  Mengikuti PRD ini sebagai source of requirements.
2.  Tidak mengubah business rules tanpa persetujuan.
3.  Tidak menaruh secret/API token di frontend.
4.  Tidak menaruh token Telegram/WeChat di source code.
5.  Menggunakan environment variables.
6.  Menggunakan database migration.
7.  Melakukan server-side validation.
8.  Membuat automated test untuk `LeaveValidationService`.
9.  Membuat audit trail untuk perubahan penting.
10. Memisahkan notification service dari core leave system.
11. Memastikan kegagalan notification tidak menggagalkan transaksi.
12. Menguji seluruh workflow pada mobile dan desktop.

------------------------------------------------------------------------

## 62. Prioritas Fitur

  Priority   Fitur
  ---------- -------------------------
  P0         Authentication
  P0         Employee
  P0         Leave Request
  P0         Leave Balance
  P0         CFV/CT Rules
  P0         Approval
  P0         Conflict Detection
  P0         Organization/Regu
  P1         Calendar
  P1         Shift
  P1         OFF
  P1         Telegram
  P1         Dashboard
  P1         Audit
  P1         Reporting
  P2         WeChat/WeCom
  P2         PDF
  P2         Advanced Analytics
  P3         ERP/Payroll Integration

------------------------------------------------------------------------

## 63. Hasil Akhir yang Diharapkan

Pada kondisi operasional normal:

``` text
Karyawan
   │
   │ 1. Ajukan cuti
   ▼
Web App
   │
   │ 2. Validasi otomatis
   ▼
Leave Validation
   │
   ├── ❌ Tidak valid
   │       └── Ditolak dengan alasan
   │
   └── ✅ Valid
           │
           ▼
       Database
           │
           ▼
     Notification
       │       │
       ▼       ▼
   Telegram   WeChat
       │
       ▼
  Foreman/Wafor
       │
       ▼
       SPV
       │
       ▼
    APPROVED
       │
       ▼
  Update Balance
       │
       ▼
    Employee
```

Sistem harus menghasilkan **satu sumber data resmi** untuk seluruh
informasi cuti, sementara Telegram dan WeChat berfungsi sebagai kanal
pemberitahuan kepada pihak yang berkepentingan.

------------------------------------------------------------------------

## 64. Catatan Pengembangan

Sebelum coding penuh, tahap teknis berikutnya adalah:

1.  Finalisasi **ERD/database schema**.
2.  Finalisasi **Role & Permission Matrix**.
3.  Finalisasi **Approval Workflow**.
4.  Finalisasi **Leave Validation Rules**.
5.  Membuat **wireframe halaman utama**.
6.  Menentukan **stack deployment**.
7.  Menentukan platform **WeChat/WeCom** yang akan digunakan.
8.  Setelah itu baru implementasi bertahap sesuai Phase 1--7.
