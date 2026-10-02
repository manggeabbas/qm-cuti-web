/** TelegramAdapter — kirim pesan via Bot API. Token TIDAK PERNAH muncul di error/log. */
import { execFile } from "node:child_process";

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

/**
 * POST JSON ke Bot API via binari curl.
 *
 * NOTE: sengaja tidak memakai fetch()/node:https. Egress proxy di VM ini
 * menutup koneksi ke api.telegram.org dari Node/Python (hanya curl/wget
 * yang lolos — kemungkinan filter fingerprint TLS di sisi proxy). curl
 * membaca proxy + CA bundle dari environment (deploy/proxy.env).
 */
function curlPostJson(url: string, payload: string, timeoutMs: number): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    execFile(
      "curl",
      [
        "-sS",
        "--max-time",
        String(Math.ceil(timeoutMs / 1000)),
        "-X",
        "POST",
        "-H",
        "Content-Type: application/json",
        "-d",
        payload,
        "-w",
        "\n%{http_code}",
        "--",
        url,
      ],
      { timeout: timeoutMs + 5000, maxBuffer: 4 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) {
          reject(new Error(`curl: ${(stderr || err.message).trim().slice(0, 120)}`));
          return;
        }
        const idx = stdout.lastIndexOf("\n");
        const status = parseInt(stdout.slice(idx + 1).trim(), 10) || 0;
        resolve({ status, body: stdout.slice(0, idx) });
      },
    );
  });
}

export async function sendTelegramMessage(
  chatId: string | number | bigint,
  text: string,
): Promise<SendResult> {
  const token = botToken();
  if (!token) return { ok: false, error: "TELEGRAM_BOT_TOKEN belum dikonfigurasi." };
  try {
    const { status, body } = await curlPostJson(
      `https://api.telegram.org/bot${token}/sendMessage`,
      JSON.stringify({ chat_id: chatId.toString(), text }),
      25000,
    );
    let data: { ok?: boolean; description?: string } = {};
    try {
      data = JSON.parse(body);
    } catch {
      /* bukan JSON */
    }
    if (data.ok) return { ok: true };
    return { ok: false, error: redact(`Telegram API: ${data.description ?? `HTTP ${status}`}`) };
  } catch (e) {
    return { ok: false, error: redact(e instanceof Error ? e.message : "Koneksi Telegram gagal.") };
  }
}

export function isTelegramConfigured(): boolean {
  return botToken().length > 0;
}
