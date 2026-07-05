import { storage } from "../server/storage";
await storage.setSetting("disable_test_merchant", "true");
console.log("Flag disable_test_merchant posé — le compte test ne sera plus recréé.");
