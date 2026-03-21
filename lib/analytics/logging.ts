import { ensureSchema, sql } from "@/lib/db";
import { estimateRequestCostUsd } from "@/lib/analytics/pricing";

export type AiUsageLogInput = {
  userId: string;
  endpoint: string;
  model?: string | null;
  promptTokens?: number | null;
  completionTokens?: number | null;
  totalTokens?: number | null;
  success: boolean;
  errorMessage?: string | null;
  documentUploadCount?: number;
  documentReferenceCount?: number;
  retrievalCallCount?: number;
  docContextPromptTokens?: number;
};

function toSafeInt(value: number | null | undefined) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.round(value as number));
}

export async function logAiUsageEvent(input: AiUsageLogInput) {
  await ensureSchema();

  const promptTokens = toSafeInt(input.promptTokens);
  const completionTokens = toSafeInt(input.completionTokens);
  const totalTokens =
    Number.isFinite(input.totalTokens) && (input.totalTokens as number) > 0
      ? toSafeInt(input.totalTokens)
      : promptTokens + completionTokens;

  const estimatedCostUsd = estimateRequestCostUsd(promptTokens, completionTokens, input.model);

  await sql`
    INSERT INTO ai_usage_logs (
      user_id,
      endpoint,
      model,
      prompt_tokens,
      completion_tokens,
      total_tokens,
      estimated_cost_usd,
      success,
      error_message,
      document_upload_count,
      document_reference_count,
      retrieval_call_count,
      doc_context_prompt_tokens
    )
    VALUES (
      ${input.userId},
      ${input.endpoint},
      ${input.model ?? null},
      ${promptTokens},
      ${completionTokens},
      ${totalTokens},
      ${estimatedCostUsd},
      ${input.success},
      ${input.errorMessage ?? null},
      ${toSafeInt(input.documentUploadCount)},
      ${toSafeInt(input.documentReferenceCount)},
      ${toSafeInt(input.retrievalCallCount)},
      ${toSafeInt(input.docContextPromptTokens)}
    )
  `;
}
