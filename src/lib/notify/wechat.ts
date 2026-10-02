/** WeChat/WeCom adapter (PRD §36 — P2). Stub siap produksi: isi kredensial lalu aktifkan. */
import type { SendResult } from "./telegram";

export async function sendWechatMessage(userId: string, text: string): Promise<SendResult> {
  const webhook = process.env.WECOM_WEBHOOK_URL ?? "";
  if (!webhook) {
    return { ok: false, error: "WeCom belum dikonfigurasi (WECOM_WEBHOOK_URL kosong)." };
  }
  try {
    // Contoh via webhook robot WeCom; sesuaikan dengan API perusahaan (Official Account / WeCom API).
    const res = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ msgtype: "text", text: { content: `[${userId}]\n${text}` } }),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return { ok: false, error: `WeCom webhook: HTTP ${res.status}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Koneksi WeCom gagal." };
  }
}
