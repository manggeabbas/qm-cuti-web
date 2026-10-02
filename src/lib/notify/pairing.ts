/** Pairing Telegram: kode stateless = HMAC(employeeId). Tanpa kolom tambahan di DB. */
import { createHmac, timingSafeEqual } from "crypto";

function secret(): string {
  return process.env.PAIRING_SECRET || process.env.TELEGRAM_BOT_TOKEN || "qm-cuti-dev-secret";
}

export function makePairingCode(employeeId: number): string {
  return createHmac("sha256", secret()).update(`pair:${employeeId}`).digest("hex").slice(0, 10).toUpperCase();
}

/** Verifikasi kode → kembalikan employeeId bila cocok, null bila tidak. */
export async function verifyPairingCode(
  code: string,
  listEmployeeIds: (id: number) => Promise<number[]> | number[],
): Promise<number | null> {
  const ids = await listEmployeeIds(0);
  const norm = code.trim().toUpperCase();
  for (const id of ids) {
    const expected = makePairingCode(id);
    if (expected.length === norm.length) {
      try {
        if (timingSafeEqual(Buffer.from(expected), Buffer.from(norm))) return id;
      } catch {
        /* abaikan */
      }
    }
  }
  return null;
}
