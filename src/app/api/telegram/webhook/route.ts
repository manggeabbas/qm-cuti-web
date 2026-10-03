import db from "@/lib/db";
import { ok } from "@/lib/api";
import { sendTelegramMessage } from "@/lib/notify/telegram";
import { verifyPairingCode } from "@/lib/notify/pairing";

/**
 * POST /api/telegram/webhook — terima update dari Bot API.
 * Pasang via: https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://<host>/api/telegram/webhook
 * Mendukung perintah: /start <KODE_PAIRING>
 */
export async function POST(req: Request) {
  try {
    const update = (await req.json()) as {
      message?: { chat?: { id: number }; from?: { id: number; username?: string }; text?: string };
    };
    const msg = update.message;
    const text = msg?.text?.trim() ?? "";
    const chatId = msg?.chat?.id;
    const fromId = msg?.from?.id;
    if (!chatId || !fromId) return ok({ ignored: true });

    if (text.startsWith("/start")) {
      const code = text.split(/\s+/)[1] ?? "";
      if (!code) {
        await sendTelegramMessage(chatId, "Halo! Ini bot notifikasi TTRI.\nMinta kode pairing ke admin, lalu kirim: /start <KODE>");
        return ok({ handled: "help" });
      }
      const ids = await db.employee.findMany({ where: { status: "ACTIVE" }, select: { id: true } });
      const employeeId = await verifyPairingCode(code, () => ids.map((e) => e.id));
      if (!employeeId) {
        await sendTelegramMessage(chatId, "❌ Kode pairing tidak valid. Minta kode baru ke admin.");
        return ok({ handled: "invalid_code" });
      }
      await db.telegramUser.upsert({
        where: { employeeId },
        create: {
          employeeId,
          telegramUserId: BigInt(fromId),
          username: msg.from?.username ?? null,
          isActive: true,
        },
        update: { telegramUserId: BigInt(fromId), username: msg.from?.username ?? null, isActive: true },
      });
      const emp = await db.employee.findUnique({ where: { id: employeeId }, select: { name: true } });
      await sendTelegramMessage(
        chatId,
        `✅ Akun Telegram terhubung untuk ${emp?.name ?? "karyawan"}.\nAnda akan menerima notifikasi pengajuan cuti di sini.`,
      );
      return ok({ handled: "paired", employeeId });
    }

    return ok({ ignored: true });
  } catch {
    return ok({ error: true });
  }
}
