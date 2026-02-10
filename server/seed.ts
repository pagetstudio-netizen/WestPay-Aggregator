import { storage } from "./storage";
import bcrypt from "bcryptjs";

export async function seedDatabase() {
  const existingAdmin = await storage.getAdminByEmail("admin@westpay.com");
  if (existingAdmin) return;

  const adminHash = await bcrypt.hash("Admin@2026!", 10);
  await storage.createAdmin({
    email: "admin@westpay.com",
    passwordHash: adminHash,
    apiKey: "WP-ADMIN-" + Array.from({ length: 24 }, () => "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"[Math.floor(Math.random() * 36)]).join(""),
  });

  const merchantHash = await bcrypt.hash("Merchant@2026!", 10);
  const ecomat = await storage.createMerchant({
    name: "EcoMat Togo",
    email: "contact@ecomat.com",
    slug: "ecomat",
    passwordHash: merchantHash,
    suspended: false,
  });

  const payfast = await storage.createMerchant({
    name: "PayFast Benin",
    email: "info@payfast.bj",
    slug: "payfast",
    passwordHash: merchantHash,
    suspended: false,
  });

  await storage.addMerchantCountry({
    merchantId: ecomat.id,
    country: "Togo",
    apiKey: "TGO-12F9-ABCD",
    balance: 12500,
    active: true,
  });

  await storage.addMerchantCountry({
    merchantId: ecomat.id,
    country: "Benin",
    apiKey: "BEN-78GH-54KL",
    balance: 18000,
    active: true,
  });

  await storage.addMerchantCountry({
    merchantId: payfast.id,
    country: "Benin",
    apiKey: "BEN-A4C2-9F3E",
    balance: 45000,
    active: true,
  });

  await storage.addMerchantCountry({
    merchantId: payfast.id,
    country: "Cote d'Ivoire",
    apiKey: "CIV-B7D1-2K8M",
    balance: 22000,
    active: true,
  });

  await storage.addNumber({
    phoneNumber: "+22899935673",
    country: "Togo",
    operator: "Moov Money",
    status: "active",
    merchantId: ecomat.id,
  });

  await storage.addNumber({
    phoneNumber: "+22892299772",
    country: "Togo",
    operator: "TMoney",
    status: "active",
    merchantId: ecomat.id,
  });

  await storage.createTransaction({
    merchantId: ecomat.id,
    country: "Togo",
    txId: "TX12345",
    amount: 2000,
    payerNumber: "+22898123456",
    status: "confirmed",
  });

  await storage.createTransaction({
    merchantId: ecomat.id,
    country: "Benin",
    txId: "TX98765",
    amount: 5000,
    payerNumber: "+22967891234",
    status: "confirmed",
  });

  await storage.createTransaction({
    merchantId: payfast.id,
    country: "Benin",
    txId: "TX54321",
    amount: 15000,
    payerNumber: "+22997654321",
    status: "confirmed",
  });

  await storage.createTransaction({
    merchantId: ecomat.id,
    country: "Togo",
    txId: "TX67890",
    amount: 3500,
    payerNumber: "+22890456789",
    status: "confirmed",
  });

  await storage.createTransaction({
    merchantId: payfast.id,
    country: "Cote d'Ivoire",
    txId: "TX11223",
    amount: 8000,
    payerNumber: "+22507891234",
    status: "confirmed",
  });

  console.log("Database seeded successfully");
}
