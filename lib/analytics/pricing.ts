export type ModelPricing = {
  inputPerMillion: number;
  outputPerMillion: number;
};

const DEFAULT_PRICING: ModelPricing = {
  inputPerMillion: 0.6,
  outputPerMillion: 2.4,
};

const MODEL_PRICING: Record<string, ModelPricing> = {
  "gpt-4.1": { inputPerMillion: 2, outputPerMillion: 8 },
  "gpt-4.1-mini": { inputPerMillion: 0.4, outputPerMillion: 1.6 },
  "gpt-3.5-turbo": { inputPerMillion: 0.5, outputPerMillion: 1.5 },
};

function roundUsd(value: number) {
  return Math.round(value * 1_000_000) / 1_000_000;
}

export function getPricingForModel(model: string | null | undefined): ModelPricing {
  if (!model) {
    return DEFAULT_PRICING;
  }

  return MODEL_PRICING[model] ?? DEFAULT_PRICING;
}

export function estimateRequestCostUsd(inputTokens: number, outputTokens: number, model?: string | null) {
  const safeInput = Number.isFinite(inputTokens) ? Math.max(0, inputTokens) : 0;
  const safeOutput = Number.isFinite(outputTokens) ? Math.max(0, outputTokens) : 0;
  const pricing = getPricingForModel(model);

  const inputCost = (safeInput / 1_000_000) * pricing.inputPerMillion;
  const outputCost = (safeOutput / 1_000_000) * pricing.outputPerMillion;

  return roundUsd(inputCost + outputCost);
}

export function sumEstimatedCostUsd(values: Array<number | null | undefined>) {
  const total = values.reduce<number>(
    (sum, value) => sum + (Number.isFinite(value) ? Number(value) : 0),
    0
  );
  return roundUsd(total);
}

export function computeAverageCostPerMark(totalCostUsd: number, totalCommittedMarks: number) {
  if (!Number.isFinite(totalCostUsd) || !Number.isFinite(totalCommittedMarks) || totalCommittedMarks <= 0) {
    return 0;
  }

  return roundUsd(totalCostUsd / totalCommittedMarks);
}

export function computeAverageCostPerActiveUser(totalCostUsd: number, activeUsers: number) {
  if (!Number.isFinite(totalCostUsd) || !Number.isFinite(activeUsers) || activeUsers <= 0) {
    return 0;
  }

  return roundUsd(totalCostUsd / activeUsers);
}
