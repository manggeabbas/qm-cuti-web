/** TelegramAdapter — kirim pesan via Bot API. Token TIDAK PERNAH muncul di error/log. */

export interface SendResult {
  ok: boolean;
  error?: string;
}

function botToken(): string {
  return process.env.TELEGRAM_BOT_TOKEN ?? "";
}

/** Samarkan token pada teks apa pun (pertahanan berlapis). */
function redact(s: string): string {
  const t = botToken();
  if (t && s.includes(t)) return s.split(t).join("***");
  return s;
}

export async function sendTelegramMessage(
  chatId: string | number | bigint,
  text: string,
): Promise<SendResult> {
  const token = botToken();
  if (!token) return { ok: false, error: "TELEGRAM_BOT_TOKEN belum dikonfigurasi." };
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId.toString(), text, parse_mode: undefined }),
      signal: AbortSignal.timeout(20000),
    });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; description?: string };
    if (data.ok) return { ok: true };
    return { ok: false, error: redact(`Telegram API: ${data.description ?? `HTTP ${res.status}`}`) };
  } catch (e) {
    return { ok: false, error: redact(e instanceof Error ? e.message : "Koneksi Telegram gagal.") };
  }
}

export function isTelegramConfigured(): boolean {
  return botToken().length > 0;
}
