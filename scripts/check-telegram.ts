import { storage } from "../server/storage";

const groupId = await storage.getSetting("telegram_group_id");
const adminDisabled = await storage.getSetting("admin_seed_permanently_disabled");

console.log("telegram_group_id en DB:", groupId || "(non défini)");
console.log("TELEGRAM_ADMIN_GROUP_ID (env):", process.env.TELEGRAM_ADMIN_GROUP_ID || "(non défini)");
console.log("TELEGRAM_BOT_TOKEN présent:", !!process.env.TELEGRAM_BOT_TOKEN);
console.log("admin_seed_permanently_disabled:", adminDisabled);
