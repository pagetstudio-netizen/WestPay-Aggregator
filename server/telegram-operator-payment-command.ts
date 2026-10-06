import type { Context, Telegraf } from "telegraf";
import { storage } from "./storage";

type OperatorRecord = Awaited<ReturnType<typeof storage.getWithdrawalOperators>>[number];
type NumberRecord = Awaited<ReturnType<typeof storage.getNumbers>>[number];
type WaveConfig = NonNullable<Awaited<ReturnType<typeof storage.getWaveManualPaymentConfigByCountry>>>;
type Gateway = "Mbiyo" | "LipaPap" | "SeaPay" | "ClaPay" | "Drimpay";
type ProviderCodeField = "mbiyoCode" | "seapayCode" | "clapayCode";
type CodeAction = "keep" | "set" | "clear";
type PaymentChange =
  | {
      kind: "gateway";
      gateway: Gateway;
      codeField?: ProviderCodeField;
      codeAction?: CodeAction;
      codeValue?: string | null;
    }
  | { kind: "manual_number"; numberId: number }
  | {
      kind: "wave_link";
      enabled: boolean;
      configSnapshot: WaveConfigSnapshot;
    };

interface WaveConfigSnapshot {
  id: number;
  country: string;
  paymentUrl: string;
  qrImageUrl: string | null;
  enabled: boolean;
}

interface OperatorPaymentSession {
  step: "country" | "operator" | "mode" | "gateway" | "provider_code" | "manual_number" | "wave_action" | "confirm";
  operators: OperatorRecord[];
  countries: string[];
  targets?: OperatorRecord[];
  selectedOperator?: OperatorRecord;
  selectedGateway?: Gateway;
  codeField?: ProviderCodeField;
  pendingChange?: PaymentChange;
  manualNumbers?: NumberRecord[];
}

const sessions = new Map<string, OperatorPaymentSession>();
const GATEWAYS: Gateway[] = ["Mbiyo", "LipaPap", "SeaPay", "ClaPay", "Drimpay"];

function sameLabel(left: string | null | undefined, right: string | null | undefined): boolean {
  return (left || "").trim().toLocaleLowerCase() === (right || "").trim().toLocaleLowerCase();
}

function normalizedLabel(value: string | null | undefined): string {
  return (value || "").trim().toLocaleLowerCase().replace(/[^a-z0-9]+/g, "");
}

function isWaveOperator(operator: OperatorRecord): boolean {
  return normalizedLabel(operator.name) === "wave";
}

function getOperatorRoutingSnapshot(operator: OperatorRecord) {
  return {
    id: operator.id,
    name: operator.name,
    country: operator.country,
    gateway: operator.gateway,
    manualPayinEnabled: operator.manualPayinEnabled,
    manualNumberId: operator.manualNumberId,
    clapayCode: operator.clapayCode,
    mbiyoCode: operator.mbiyoCode,
    seapayCode: operator.seapayCode,
  };
}

function sameOperatorRouting(
  current: OperatorRecord,
  snapshot: ReturnType<typeof getOperatorRoutingSnapshot>,
): boolean {
  const currentSnapshot = getOperatorRoutingSnapshot(current);
  return Object.keys(snapshot).every((key) =>
    currentSnapshot[key as keyof typeof currentSnapshot] === snapshot[key as keyof typeof snapshot],
  );
}

function getManualNumbers(numbers: NumberRecord[], operator: OperatorRecord): NumberRecord[] {
  return numbers
    .filter((number) =>
      number.status === "active" &&
      number.merchantId == null &&
      Boolean(number.accountName?.trim()) &&
      sameLabel(number.country, operator.country) &&
      sameLabel(number.operator, operator.name),
    )
    .sort((a, b) => a.phoneNumber.localeCompare(b.phoneNumber));
}

function getCodeField(gateway: Gateway): ProviderCodeField | undefined {
  if (gateway === "Mbiyo") return "mbiyoCode";
  if (gateway === "SeaPay") return "seapayCode";
  if (gateway === "ClaPay") return "clapayCode";
  return undefined;
}

function isProviderCodeRequired(gateway: Gateway, operator: OperatorRecord): boolean {
  if (gateway === "Mbiyo" || gateway === "SeaPay") return true;
  if (gateway !== "ClaPay") return false;
  const name = normalizedLabel(operator.name);
  return name.includes("wave") || name.includes("mixx");
}

function codeLabel(field: ProviderCodeField): string {
  if (field === "mbiyoCode") return "code réseau Mbiyo";
  if (field === "seapayCode") return "code de canal SeaPay";
  return "code opérateur ClaPay";
}

function codeValue(operator: OperatorRecord, field: ProviderCodeField): string {
  return (operator[field] || "").trim();
}

function isUsableWaveConfig(config: WaveConfig): boolean {
  if (
    !config.qrImageUrl ||
    !config.paymentUrl.trim() ||
    config.paymentUrl.trim().length > 1000
  ) return false;
  try {
    const url = new URL(config.paymentUrl);
    return url.protocol === "https:" &&
      /(^|\.)wave\.com$/i.test(url.hostname) &&
      !url.username &&
      !url.password;
  } catch {
    return false;
  }
}

function toWaveConfigSnapshot(config: WaveConfig): WaveConfigSnapshot {
  return {
    id: config.id,
    country: config.country,
    paymentUrl: config.paymentUrl,
    qrImageUrl: config.qrImageUrl,
    enabled: config.enabled,
  };
}

function sameWaveConfig(config: WaveConfig, snapshot: WaveConfigSnapshot): boolean {
  return config.id === snapshot.id &&
    config.country === snapshot.country &&
    config.paymentUrl === snapshot.paymentUrl &&
    config.qrImageUrl === snapshot.qrImageUrl &&
    config.enabled === snapshot.enabled;
}

function isGroupChat(ctx: Context): boolean {
  return ctx.chat?.type === "group" || ctx.chat?.type === "supergroup";
}

async function showConfirmation(
  ctx: Context,
  chatId: string,
  session: OperatorPaymentSession,
  change: PaymentChange,
  summary: string,
): Promise<void> {
  session.pendingChange = change;
  session.step = "confirm";
  sessions.set(chatId, session);
  await ctx.reply(
    `⚠️ Vérifiez le changement pour ${session.selectedOperator?.name} (${session.selectedOperator?.country}).\n\n` +
    `${summary}\n\n` +
    `Envoyez OUI pour appliquer, ou /cancel pour annuler.`,
  );
}

async function saveChange(
  ctx: Context,
  chatId: string,
  session: OperatorPaymentSession,
): Promise<void> {
  const operator = session.selectedOperator;
  const change = session.pendingChange;
  if (!operator || !change) {
    sessions.delete(chatId);
    await ctx.reply("❌ Configuration incomplète. Relancez /setoperatorpayment.");
    return;
  }

  if (change.kind === "wave_link") {
    const currentOperator = await storage.getWithdrawalOperatorById(operator.id);
    if (!currentOperator || !isWaveOperator(currentOperator) || (change.enabled && !currentOperator.active)) {
      sessions.delete(chatId);
      await ctx.reply(
        change.enabled
          ? "❌ L’opérateur Wave a changé ou est inactif. Activez-le dans le panel puis relancez /setoperatorpayment."
          : "❌ L’opérateur Wave n’existe plus. Relancez /setoperatorpayment.",
      );
      return;
    }
    const currentConfig = await storage.getWaveManualPaymentConfigByCountry(operator.country);
    if (!currentConfig || !sameWaveConfig(currentConfig, change.configSnapshot)) {
      sessions.delete(chatId);
      await ctx.reply("❌ La configuration Wave a changé depuis le début. Relancez /setoperatorpayment.");
      return;
    }
    if (change.enabled && !isUsableWaveConfig(currentConfig)) {
      sessions.delete(chatId);
      await ctx.reply("❌ Le lien ou le QR Wave n’est plus valide. Vérifiez la configuration Wave dans le panel.");
      return;
    }
    await storage.updateWaveManualPaymentConfig(currentConfig.id, {
      enabled: change.enabled,
      updatedAt: new Date(),
    });
    sessions.delete(chatId);
    await ctx.reply(
      `✅ Option Wave par lien + QR ${change.enabled ? "activée" : "désactivée"} pour ${operator.country}.\n` +
      `Cette option est partagée par les marchands du pays et ne modifie ni le fournisseur ni le numéro Wave.`,
    );
    return;
  }

  const currentOperator = await storage.getWithdrawalOperatorById(operator.id);
  if (!currentOperator || !sameOperatorRouting(currentOperator, getOperatorRoutingSnapshot(operator))) {
    sessions.delete(chatId);
    await ctx.reply("❌ La configuration de l’opérateur a changé depuis le début. Relancez /setoperatorpayment.");
    return;
  }

  if (change.kind === "gateway") {
    const update: {
      gateway: string;
      manualPayinEnabled: boolean;
      manualNumberId: number | null;
      mbiyoCode?: string | null;
      seapayCode?: string | null;
      clapayCode?: string | null;
    } = {
      gateway: change.gateway,
      manualPayinEnabled: false,
      manualNumberId: null,
    };
    if (change.codeField && change.codeAction === "set") {
      update[change.codeField] = change.codeValue || null;
    } else if (change.codeField && change.codeAction === "clear") {
      update[change.codeField] = null;
    }
    const requiredCodeField = change.gateway === "Mbiyo"
      ? "mbiyoCode"
      : change.gateway === "SeaPay"
        ? "seapayCode"
        : change.gateway === "ClaPay" && isProviderCodeRequired(change.gateway, currentOperator)
          ? "clapayCode"
        : undefined;
    const selectedRequiredCode = requiredCodeField
      ? change.codeField === requiredCodeField && change.codeAction === "set"
        ? change.codeValue
        : change.codeField === requiredCodeField && change.codeAction === "clear"
          ? null
          : currentOperator[requiredCodeField]
      : null;
    if (requiredCodeField && !selectedRequiredCode?.trim()) {
      sessions.delete(chatId);
      await ctx.reply(`❌ Le ${codeLabel(requiredCodeField)} est requis pour ce fournisseur. Relancez /setoperatorpayment.`);
      return;
    }
    await storage.updateWithdrawalOperator(operator.id, update);
    sessions.delete(chatId);
    await ctx.reply(
      `✅ ${operator.name} (${operator.country}) utilise maintenant ${change.gateway} pour les encaissements et les retraits.\n` +
      `Le numéro de paiement manuel associé a été retiré de cette configuration.`,
    );
    return;
  }

  const number = (await storage.getNumbers()).find((item) => item.id === change.numberId);
  if (!number || !getManualNumbers([number], currentOperator).length) {
    sessions.delete(chatId);
    await ctx.reply("❌ Ce numéro n’est plus actif ou ne correspond plus à cet opérateur. Relancez /setoperatorpayment.");
    return;
  }

  await storage.updateWithdrawalOperator(operator.id, {
    gateway: "Manuel",
    manualPayinEnabled: true,
    manualNumberId: number.id,
  });
  sessions.delete(chatId);
  await ctx.reply(
    `✅ ${operator.name} (${operator.country}) utilise maintenant le numéro manuel ${number.phoneNumber} ` +
    `(${number.accountName?.trim()}) pour les encaissements et, selon le parcours actuel, les retraits.`,
  );
}

export function cancelOperatorPaymentSession(chatId: string): boolean {
  return sessions.delete(chatId);
}

export function registerOperatorPaymentCommand(
  bot: Telegraf,
  isAdminGroup: (chatId: string) => Promise<boolean>,
  hasOtherSession: (chatId: string) => boolean,
): void {
  const start = async (ctx: Context) => {
    const chatId = String(ctx.chat?.id ?? "");
    if (!isGroupChat(ctx) || !await isAdminGroup(chatId)) {
      await ctx.reply("⛔ Cette commande est réservée au groupe admin WestPay.");
      return;
    }
    if (hasOtherSession(chatId)) {
      await ctx.reply("❌ Une autre action est déjà en cours. Envoyez /cancel avant de commencer.");
      return;
    }

    const operators = await storage.getWithdrawalOperators();
    if (operators.length === 0) {
      await ctx.reply("Aucun opérateur n’est configuré.");
      return;
    }
    const countries = operators
      .map((operator) => operator.country)
      .filter((country, index, allCountries) => allCountries.indexOf(country) === index)
      .sort((a, b) => a.localeCompare(b));
    const session: OperatorPaymentSession = { step: "country", operators, countries };
    sessions.set(chatId, session);
    await ctx.reply(
      `🔧 Configuration du fournisseur ou du numéro manuel\n\n` +
      `Choisissez un pays en envoyant son numéro :\n` +
      `${countries.map((country, index) => `${index + 1}. ${country}`).join("\n")}\n\n` +
      `Le changement de fournisseur ou de numéro est global pour les marchands qui utilisent cet opérateur.\n` +
      `Envoyez /cancel pour annuler.`,
    );
  };

  bot.command("setoperatorpayment", start);
  bot.command("switchoperator", start);

  // This middleware is registered before the bot's general text-message handlers.
  bot.on("message", async (ctx, next) => {
    const chatId = String(ctx.chat.id);
    const session = sessions.get(chatId);
    if (!session) return next();

    if (!isGroupChat(ctx) || !await isAdminGroup(chatId)) {
      sessions.delete(chatId);
      return next();
    }

    const text = String((ctx.message as any).text || "").trim();
    if (!text || text.startsWith("/")) return next();

    if (session.step === "country") {
      const selected = Number(text);
      if (!Number.isInteger(selected) || selected < 1 || selected > session.countries.length) {
        await ctx.reply("Numéro invalide. Choisissez un pays dans la liste ou envoyez /cancel.");
        return;
      }
      const country = session.countries[selected - 1];
      const targets = session.operators.filter((operator) => operator.country === country);
      session.targets = targets;
      session.step = "operator";
      sessions.set(chatId, session);
      await ctx.reply(
        `Choisissez l’opérateur de ${country} :\n` +
        `${targets.map((operator, index) => `${index + 1}. ${operator.name} — ${operator.active ? "actif" : "inactif"}`).join("\n")}\n\n` +
        `Envoyez /cancel pour annuler.`,
      );
      return;
    }

    if (session.step === "operator") {
      const targets = session.targets || [];
      const selected = Number(text);
      if (!Number.isInteger(selected) || selected < 1 || selected > targets.length) {
        await ctx.reply("Numéro invalide. Choisissez un opérateur dans la liste ou envoyez /cancel.");
        return;
      }
      const operator = targets[selected - 1];
      session.selectedOperator = operator;
      session.step = "mode";
      sessions.set(chatId, session);
      const waveOption = isWaveOperator(operator)
        ? "\n3. Activer ou désactiver l’option Wave par lien + QR (configuration séparée par pays)"
        : "";
      await ctx.reply(
        `Opérateur choisi : ${operator.name} (${operator.country})\n` +
        `Configuration actuelle : fournisseur ${operator.gateway || "non défini"}; ` +
        `numéro manuel ${operator.manualNumberId ? "configuré" : "non configuré"}.\n\n` +
        `1. Choisir un fournisseur API\n` +
        `2. Choisir un numéro de paiement manuel${waveOption}\n\n` +
        `Envoyez /cancel pour annuler.`,
      );
      return;
    }

    if (session.step === "mode") {
      const operator = session.selectedOperator;
      if (!operator) {
        sessions.delete(chatId);
        await ctx.reply("❌ Opérateur introuvable. Relancez /setoperatorpayment.");
        return;
      }
      if (text === "1") {
        session.step = "gateway";
        sessions.set(chatId, session);
        await ctx.reply(
          `Choisissez le fournisseur pour ${operator.name} (${operator.country}) :\n` +
          `${GATEWAYS.map((gateway, index) => `${index + 1}. ${gateway}${operator.gateway.toLocaleLowerCase() === gateway.toLocaleLowerCase() ? " (actuel)" : ""}`).join("\n")}\n\n` +
          `Envoyez /cancel pour annuler.`,
        );
        return;
      }
      if (text === "2") {
        const manualNumbers = getManualNumbers(await storage.getNumbers(), operator);
        if (manualNumbers.length === 0) {
          sessions.delete(chatId);
          await ctx.reply(
            `❌ Aucun numéro manuel global, actif et avec titulaire renseigné ne correspond exactement à ${operator.name} (${operator.country}).\n` +
            `Ajoutez d’abord le numéro dans le panel « Numéros Mobile Money », puis relancez /setoperatorpayment.`,
          );
          return;
        }
        session.manualNumbers = manualNumbers;
        session.step = "manual_number";
        sessions.set(chatId, session);
        await ctx.reply(
          `Choisissez le numéro manuel pour ${operator.name} (${operator.country}) :\n` +
          `${manualNumbers.map((number, index) => `${index + 1}. ${number.phoneNumber} — ${number.accountName?.trim()}`).join("\n")}\n\n` +
          `Les numéros liés à un marchand ne sont pas proposés, car ce réglage est partagé par l’opérateur.\n` +
          `Envoyez /cancel pour annuler.`,
        );
        return;
      }
      if (text === "3" && isWaveOperator(operator)) {
        const config = await storage.getWaveManualPaymentConfigByCountry(operator.country);
        if (!config) {
          sessions.delete(chatId);
          await ctx.reply(
            `❌ Aucun lien + QR Wave n’est configuré pour ${operator.country}. Configurez d’abord le lien et le QR dans le panel d’administration, puis relancez /setoperatorpayment.`,
          );
          return;
        }
        if (!config.enabled && !isUsableWaveConfig(config)) {
          sessions.delete(chatId);
          await ctx.reply("❌ Le lien HTTPS Wave et le QR doivent être valides avant l’activation. Vérifiez-les dans le panel.");
          return;
        }
        if (!config.enabled && !operator.active) {
          sessions.delete(chatId);
          await ctx.reply("❌ L’opérateur Wave est inactif. Activez-le dans le panel avant d’activer le lien + QR.");
          return;
        }
        session.pendingChange = {
          kind: "wave_link",
          enabled: !config.enabled,
          configSnapshot: toWaveConfigSnapshot(config),
        };
        session.step = "wave_action";
        sessions.set(chatId, session);
        await ctx.reply(
          `Configuration Wave de ${operator.country} : ${config.enabled ? "active" : "inactive"}.\n` +
          `${config.qrImageUrl ? "QR présent" : "QR absent"} · ${isUsableWaveConfig(config) ? "lien valide" : "lien ou QR à vérifier"}.\n\n` +
          `1. ${config.enabled ? "Désactiver" : "Activer"} l’option Wave par lien + QR\n` +
          `2. Ne rien changer\n\n` +
          `Cette option est partagée par les marchands du pays et ne remplace pas le fournisseur ou le numéro Wave.\n` +
          `Envoyez /cancel pour annuler.`,
        );
        return;
      }
      await ctx.reply("Choix invalide. Envoyez 1, 2 ou, pour l’opérateur Wave, 3.");
      return;
    }

    if (session.step === "gateway") {
      const selected = Number(text);
      if (!Number.isInteger(selected) || selected < 1 || selected > GATEWAYS.length) {
        await ctx.reply("Numéro invalide. Choisissez un fournisseur dans la liste.");
        return;
      }
      const gateway = GATEWAYS[selected - 1];
      session.selectedGateway = gateway;
      const field = getCodeField(gateway);
      if (!field || !session.selectedOperator) {
        session.pendingChange = { kind: "gateway", gateway };
        session.step = "confirm";
        sessions.set(chatId, session);
        await ctx.reply(
          `Le fournisseur choisi est ${gateway}. Le numéro manuel sera désactivé et l’opérateur utilisera ce fournisseur pour les encaissements et les retraits.\n\n` +
          `Envoyez OUI pour appliquer, ou /cancel pour annuler.`,
        );
        return;
      }
      session.codeField = field;
      session.step = "provider_code";
      sessions.set(chatId, session);
      const existingCode = codeValue(session.selectedOperator, field);
      const codeRequirement = isProviderCodeRequired(gateway, session.selectedOperator) ? "obligatoire" : "facultatif";
      await ctx.reply(
        `${codeLabel(field)} (${codeRequirement}) pour ${gateway} :\n` +
        (existingCode ? `Valeur actuelle : ${existingCode}\n` : "") +
        (gateway === "ClaPay"
          ? `Envoyez le code exact, GARDER pour conserver la valeur actuelle, ou VIDE pour laisser ClaPay détecter le réseau.`
          : `Envoyez le code exact. Envoyez GARDER pour conserver la valeur actuelle${existingCode ? ` (${existingCode})` : ""}.`) +
        `\n\nEnvoyez /cancel pour annuler.`,
      );
      return;
    }

    if (session.step === "provider_code") {
      const operator = session.selectedOperator;
      const gateway = session.selectedGateway;
      const field = session.codeField;
      if (!operator || !gateway || !field) {
        sessions.delete(chatId);
        await ctx.reply("❌ Configuration fournisseur incomplète. Relancez /setoperatorpayment.");
        return;
      }
      const input = text.trim();
      const existingCode = codeValue(operator, field);
      const required = isProviderCodeRequired(gateway, operator);
      let action: CodeAction;
      let value: string | null = null;
      if (input.toLocaleUpperCase() === "GARDER") {
        if (!existingCode && required) {
          await ctx.reply(`Aucune valeur actuelle à garder. Le ${codeLabel(field)} est obligatoire.`);
          return;
        }
        action = "keep";
      } else if (input.toLocaleUpperCase() === "VIDE") {
        if (gateway !== "ClaPay" || required) {
          await ctx.reply(`Le ${codeLabel(field)} est obligatoire pour ${gateway}; envoyez le code exact ou GARDER.`);
          return;
        }
        action = "clear";
      } else if (input.length > 100 || input.includes("\n")) {
        await ctx.reply("Code invalide : 100 caractères maximum sur une seule ligne.");
        return;
      } else if (!input) {
        await ctx.reply(`Le ${codeLabel(field)} est requis. Envoyez GARDER${existingCode ? " ou le code exact" : " ou le code exact"}.`);
        return;
      } else {
        action = "set";
        value = input;
      }
      session.pendingChange = {
        kind: "gateway",
        gateway,
        codeField: field,
        codeAction: action,
        codeValue: value,
      };
      session.step = "confirm";
      sessions.set(chatId, session);
      const codeSummary = action === "set"
        ? `${codeLabel(field)} : ${value}`
        : action === "clear"
          ? `${codeLabel(field)} : effacé`
          : `${codeLabel(field)} : conservé`;
      await ctx.reply(
        `⚠️ ${operator.name} (${operator.country}) passera sur ${gateway}.\n` +
        `${codeSummary}.\n` +
        `Le numéro manuel sera désactivé. Le fournisseur choisi sera utilisé pour les encaissements et les retraits.\n\n` +
        `Envoyez OUI pour appliquer, ou /cancel pour annuler.`,
      );
      return;
    }

    if (session.step === "manual_number") {
      const operator = session.selectedOperator;
      const manualNumbers = session.manualNumbers || [];
      const selected = Number(text);
      if (!Number.isInteger(selected) || selected < 1 || selected > manualNumbers.length) {
        await ctx.reply("Numéro invalide. Choisissez un numéro dans la liste.");
        return;
      }
      const number = manualNumbers[selected - 1];
      session.pendingChange = { kind: "manual_number", numberId: number.id };
      session.step = "confirm";
      sessions.set(chatId, session);
      await ctx.reply(
        `⚠️ ${operator?.name} (${operator?.country}) utilisera le numéro manuel ${number.phoneNumber} (${number.accountName?.trim()}).\n` +
        `Ce réglage sera utilisé pour les encaissements et, comme dans le panel actuel, les retraits manuels de cet opérateur.\n\n` +
        `Envoyez OUI pour appliquer, ou /cancel pour annuler.`,
      );
      return;
    }

    if (session.step === "wave_action") {
      if (text === "2") {
        sessions.delete(chatId);
        await ctx.reply("Aucun changement apporté à l’option Wave par lien + QR.");
        return;
      }
      if (text !== "1" || !session.pendingChange || session.pendingChange.kind !== "wave_link") {
        await ctx.reply("Choix invalide. Envoyez 1 pour appliquer le changement affiché ou 2 pour ne rien changer.");
        return;
      }
      const operator = session.selectedOperator;
      const config = await storage.getWaveManualPaymentConfigByCountry(operator?.country || "");
      if (session.pendingChange.enabled && (!config || !isUsableWaveConfig(config))) {
        sessions.delete(chatId);
        await ctx.reply("❌ Un lien HTTPS Wave valide et son QR sont requis. Vérifiez la configuration dans le panel.");
        return;
      }
      await showConfirmation(
        ctx,
        chatId,
        session,
        session.pendingChange,
        `L’option Wave par lien + QR sera ${session.pendingChange.enabled ? "activée" : "désactivée"} pour ${operator?.country}. ` +
        `Cela concerne tous les marchands du pays, sans modifier le fournisseur ou le numéro Wave.`,
      );
      return;
    }

    if (session.step === "confirm") {
      const decision = text.toLocaleUpperCase();
      if (["NON", "ANNULER"].includes(decision)) {
        sessions.delete(chatId);
        await ctx.reply("❌ Changement annulé.");
        return;
      }
      if (!["OUI", "CONFIRMER"].includes(decision)) {
        await ctx.reply("Envoyez OUI pour appliquer le changement affiché, NON pour l’annuler, ou /cancel.");
        return;
      }
      try {
        await saveChange(ctx, chatId, session);
      } catch (error: any) {
        console.error("[TELEGRAM] Modification de configuration opérateur impossible:", error?.message || error);
        await ctx.reply("❌ Impossible d’enregistrer cette configuration. Vérifiez le panel ou réessayez.");
      }
      return;
    }

    return next();
  });
}
