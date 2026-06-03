import { Pool } from "pg";

const dbUrl = process.env.CUSTOM_DATABASE_URL || process.env.DATABASE_URL;
if (!dbUrl) throw new Error("No DB URL found");
const pool = new Pool({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });

async function cleanup() {
  const client = await pool.connect();
  try {
    console.log("=== SUPPRESSION DES DONNÉES DE TEST ===\n");

    // Supprimer les 18 fausses transactions insérées manuellement (IDs identifiés)
    const fakeIds = [30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47];
    const delTx = await client.query(
      `DELETE FROM transactions WHERE id = ANY($1) RETURNING id`,
      [fakeIds]
    );
    console.log(`Transactions supprimées: ${delTx.rows.length} IDs: ${delTx.rows.map((r:any)=>r.id).join(", ")}`);

    // Supprimer tous les pending_payments (tous de test)
    const delPend = await client.query(`DELETE FROM pending_payments RETURNING id`);
    console.log(`Pending payments supprimés: ${delPend.rows.length} IDs: ${delPend.rows.map((r:any)=>r.id).join(", ")}`);

    // Supprimer tous les withdrawals (tous de test)
    const delWd = await client.query(`DELETE FROM withdrawals RETURNING id`);
    console.log(`Withdrawals supprimés: ${delWd.rows.length} IDs: ${delWd.rows.map((r:any)=>r.id).join(", ")}`);

    // Supprimer tous les wallet_transfers (tous de test)
    const delWt = await client.query(`DELETE FROM wallet_transfers RETURNING id`);
    console.log(`Wallet transfers supprimés: ${delWt.rows.length} IDs: ${delWt.rows.map((r:any)=>r.id).join(", ")}`);

    // Vérification finale
    const [chkTx, chkPend, chkWd, chkWt] = await Promise.all([
      client.query(`SELECT COUNT(*) as c FROM transactions`),
      client.query(`SELECT COUNT(*) as c FROM pending_payments`),
      client.query(`SELECT COUNT(*) as c FROM withdrawals`),
      client.query(`SELECT COUNT(*) as c FROM wallet_transfers`),
    ]);
    console.log("\n=== ÉTAT FINAL ===");
    console.log(`  transactions: ${(chkTx.rows[0] as any).c}`);
    console.log(`  pending_payments: ${(chkPend.rows[0] as any).c}`);
    console.log(`  withdrawals: ${(chkWd.rows[0] as any).c}`);
    console.log(`  wallet_transfers: ${(chkWt.rows[0] as any).c}`);
    console.log("\n✅ Base de données nettoyée — aucune fausse donnée restante.");
  } finally {
    client.release();
    await pool.end();
  }
}

cleanup().catch(err => { console.error("ERREUR:", err.message); process.exit(1); });
