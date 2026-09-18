import { storage } from "../server/storage";
import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.CUSTOM_DATABASE_URL });

const m = await storage.getMerchantByEmail("test@westpay.dev");
if (m) {
  const tables = ["transactions", "withdrawals", "merchant_countries", "merchant_pins", "payment_links", "pending_payments", "webhook_logs", "numbers"];
  for (const t of tables) {
    const tableName = {
      transactions: "transactions",
      withdrawals: "withdrawals",
      merchant_countries: "merchant_countries",
      merchant_pins: "merchant_pins",
      payment_links: "payment_links",
      pending_payments: "pending_payments",
      webhook_logs: "webhook_logs",
      numbers: "numbers",
    }[t];
    if (!tableName) continue;
    await pool.query(`DELETE FROM ${tableName} WHERE merchant_id = $1`, [m.id]).catch(() => {});
  }
  await pool.query("DELETE FROM merchants WHERE id = $1", [m.id]);
  console.log("Compte test supprimé (id:", m.id, ")");
} else {
  console.log("Aucun compte test trouvé.");
}
await pool.end();
