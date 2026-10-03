-- Hari OFF mingguan tetap per karyawan (0=Minggu .. 6=Sabtu).
-- Rabu (3) tidak dipakai karena Rabu = OFF bersama.
ALTER TABLE "Employee" ADD COLUMN "offDayOfWeek" INTEGER;
