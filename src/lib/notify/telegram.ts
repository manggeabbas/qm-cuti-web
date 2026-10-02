/** TelegramAdapter — kirim pesan via Bot API. Token TIDAK PERNAH muncul di error/log. */
import { ProxyAgent } from "undici";

export interface SendResult {
  ok: boolean;
  error?: string;
}

function botToken(): string {
  return process.env.TELEGRAM_BOT_TOKEN ?? "";
}

/**
 * Dispatcher HTTP yang lewat egress proxy bila dikonfigurasi.
 * VM ini tidak punya internet langsung dan fetch() bawaan Node tidak membaca
 * variabel proxy — tanpa ini, pengiriman ke api.telegram.org selalu gagal.
 */
let cachedDispatcher: ProxyAgent | undefined;
let dispatcherReady = false;
function proxyDispatcher(): ProxyAgent | undefined {
  if (!dispatcherReady) {
    dispatcherReady = true;
    const proxy =
      process.env.HTTPS_PROXY ||
      process.env.https_proxy ||
      process.env.HTTP_PROXY ||
      process.env.http_proxy;
    if (proxy) {
      try {
        cachedDispatcher = new ProxyAgent(proxy);
      } catch {
        cachedDispatcher = undefined;
      }
    }
  }
  return cachedDispatcher;
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
      // @ts-expect-error dispatcher didukung undici (fetch Node)
      dispatcher: proxyDispatcher(),
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
