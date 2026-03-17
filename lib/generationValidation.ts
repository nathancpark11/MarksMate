export const ACTION_MAX_CHARS = 1000;
export const IMPACT_MAX_CHARS = 700;
export const COMBINED_AI_TEXT_MAX_CHARS = 1500;
export const GENERATE_REQUEST_MAX_BYTES = 5 * 1024;

const textEncoder = new TextEncoder();

export function getUtf8ByteLength(value: string) {
  return textEncoder.encode(value).length;
}

export function validateActionAndImpact(actionText: string, impactText: string) {
  const trimmedAction = actionText.trim();
  const trimmedImpact = impactText.trim();

  if (!trimmedAction) {
    return "Please enter an accomplishment.";
  }

  if (trimmedAction.length > ACTION_MAX_CHARS) {
    return `Action must be at most ${ACTION_MAX_CHARS} characters. Current length: ${trimmedAction.length}.`;
  }

  if (trimmedImpact.length > IMPACT_MAX_CHARS) {
    return `Impact must be at most ${IMPACT_MAX_CHARS} characters. Current length: ${trimmedImpact.length}.`;
  }

  const combinedTextLength = trimmedAction.length + trimmedImpact.length;
  if (combinedTextLength > COMBINED_AI_TEXT_MAX_CHARS) {
    return `Combined Action and Impact text must be at most ${COMBINED_AI_TEXT_MAX_CHARS} characters. Current total length: ${combinedTextLength}.`;
  }

  return null;
}
