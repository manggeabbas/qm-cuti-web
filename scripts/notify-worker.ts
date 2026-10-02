/** Runner worker notifikasi — dipanggil cron tiap menit. */
import "dotenv/config";
import { processPendingNotifications } from "../src/lib/notify/worker";

async function main(): Promise<void> {
  const r = await processPendingNotifications();
  if (r.processed > 0) {
    console.log(`[notify-worker] processed=${r.processed} sent=${r.sent} failed=${r.failed}`);
  }
}

main()
  .catch((e) => {
    console.error("[notify-worker] error:", e);
    process.exitCode = 1;
  });
