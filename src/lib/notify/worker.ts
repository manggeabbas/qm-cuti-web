/**
 * Worker notifikasi: kirim baris PENDING/FAILED (retry) via adapter channel.
 * Dijalankan tiap menit via cron: `node scripts/notify-worker.ts`
 * Kegagalan di sini TIDAK PERNAH menyentuh data cuti (PRD §56).
 */
import db from "../db";
import { sendTelegramMessage, isTelegramConfigured } from "./telegram";
import { sendWechatMessage } from "./wechat";

const MAX_ATTEMPTS = 5;
const BATCH = 20;

function backoffDue(lastUpdate: Date, attempts: number): boolean {
  const waitMin = Math.pow(2, Math.min(attempts, 5)); // 2,4,8,16,32 menit
  return Date.now() - lastUpdate.getTime() >= waitMin * 60_000;
}

export async function processPendingNotifications(batchSize = BATCH): Promise<{
  processed: number;
  sent: number;
  failed: number;
}> {
  let processed = 0;
  let sent = 0;
  let failed = 0;

  const rows = await db.notification.findMany({
    where: { status: { in: ["PENDING", "FAILED"] }, attempts: { lt: MAX_ATTEMPTS } },
    orderBy: { createdAt: "asc" },
    take: batchSize,
    include: {
      employee: { include: { telegramUser: true, wechatUser: true } },
    },
  });

  for (const n of rows) {
    if (n.status === "FAILED" && !backoffDue(n.createdAt, n.attempts)) continue;
    processed++;

    let result: { ok: boolean; error?: string };
    if (n.channel === "TELEGRAM") {
      const chatId = n.employee?.telegramUser?.isActive ? n.employee.telegramUser.telegramUserId : null;
      if (!isTelegramConfigured()) {
        result = { ok: false, error: "TELEGRAM_BOT_TOKEN belum dikonfigurasi." };
      } else if (chatId == null) {
        result = { ok: false, error: "Karyawan belum binding akun Telegram." };
      } else {
        result = await sendTelegramMessage(chatId, `${n.title}\n\n${n.message}`);
      }
    } else {
      const uid = n.employee?.wechatUser?.isActive ? n.employee.wechatUser.wechatUserId : null;
      result = uid ? await sendWechatMessage(uid, `${n.title}\n\n${n.message}`) : { ok: false, error: "WeChat belum di-binding." };
    }

    const attempts = n.attempts + 1;
    if (result.ok) {
      sent++;
      await db.notification.update({
        where: { id: n.id },
        data: { status: "SENT", attempts, sentAt: new Date(), errorMessage: null },
      });
      await db.notificationLog.create({ data: { notificationId: n.id, status: "SENT" } });
    } else {
      failed++;
      const finalFail = attempts >= MAX_ATTEMPTS;
      await db.notification.update({
        where: { id: n.id },
        data: { status: "FAILED", attempts, errorMessage: result.error ?? "Gagal mengirim." },
      });
      await db.notificationLog.create({
        data: { notificationId: n.id, status: "FAILED", detail: `${result.error ?? ""}${finalFail ? " (percobaan habis)" : ""}` },
      });
    }
  }

  return { processed, sent, failed };
}
