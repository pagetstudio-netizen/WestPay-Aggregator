export type SettlementCycleOption = {
  value: string;
  labelFr: string;
  descriptionFr: string;
  labelZh: string;
  descriptionZh: string;
};

const dayBasedCycles: SettlementCycleOption[] = [
  {
    value: "D0",
    labelFr: "D0",
    descriptionFr: "Règlement prévu le jour même de l’opération.",
    labelZh: "D0",
    descriptionZh: "预计在交易当天结算。",
  },
  ...Array.from({ length: 30 }, (_, index) => {
    const days = index + 1;
    const value = `D+${days}`;
    return {
      value,
      labelFr: value,
      descriptionFr: `Règlement prévu ${days} jour${days > 1 ? "s" : ""} ouvré${days > 1 ? "s" : ""} après l’opération.`,
      labelZh: value,
      descriptionZh: `预计在交易后 ${days} 个工作日结算。`,
    };
  }),
];

const periodicCycles: SettlementCycleOption[] = [
  {
    value: "WEEKLY",
    labelFr: "Hebdomadaire",
    descriptionFr: "Cycle hebdomadaire, à titre indicatif.",
    labelZh: "每周",
    descriptionZh: "预计按周结算（仅供参考）。",
  },
  {
    value: "EVERY_TWO_WEEKS",
    labelFr: "Toutes les deux semaines",
    descriptionFr: "Cycle toutes les deux semaines, à titre indicatif.",
    labelZh: "每两周",
    descriptionZh: "预计每两周结算（仅供参考）。",
  },
  {
    value: "MONTHLY",
    labelFr: "Mensuel",
    descriptionFr: "Cycle mensuel, à titre indicatif.",
    labelZh: "每月",
    descriptionZh: "预计按月结算（仅供参考）。",
  },
  {
    value: "CUSTOM",
    labelFr: "Personnalisé",
    descriptionFr: "Cycle personnalisé, à titre indicatif.",
    labelZh: "自定义",
    descriptionZh: "自定义结算周期（仅供参考）。",
  },
];

export const MERCHANT_SETTLEMENT_CYCLES = [...dayBasedCycles, ...periodicCycles];

export const MERCHANT_CATEGORIES = [
  { value: "betting", labelFr: "Paris sportifs", labelZh: "博彩" },
  { value: "investment", labelFr: "Investissement", labelZh: "投资" },
  { value: "gaming", labelFr: "Jeux en ligne", labelZh: "游戏" },
  { value: "other_platforms", labelFr: "Autres plateformes", labelZh: "其他平台" },
] as const;

export function isMerchantSettlementCycle(value: unknown): value is string {
  return typeof value === "string" && MERCHANT_SETTLEMENT_CYCLES.some(option => option.value === value);
}

export function isMerchantCategory(value: unknown): value is string {
  return typeof value === "string" && MERCHANT_CATEGORIES.some(option => option.value === value);
}

export function getSettlementCycle(value: unknown): SettlementCycleOption | undefined {
  return typeof value === "string"
    ? MERCHANT_SETTLEMENT_CYCLES.find(option => option.value === value)
    : undefined;
}

export function getMerchantCategory(value: unknown) {
  return typeof value === "string"
    ? MERCHANT_CATEGORIES.find(option => option.value === value)
    : undefined;
}