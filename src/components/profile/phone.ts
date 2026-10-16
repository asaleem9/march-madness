/**
 * E.164 helpers for the SMS phone field. Pure; shared by the profile form and
 * its tests. US (+1) is assumed for bare 10-digit numbers.
 */

const E164 = /^\+[1-9]\d{7,14}$/;

export function isValidE164(value: string): boolean {
  return E164.test(value);
}

/**
 * Normalize user input to E.164, or return null when it can't be.
 *  "(555) 123-4567"   → "+15551234567"
 *  "1 555 123 4567"   → "+15551234567"
 *  "+44 20 7946 0958" → "+442079460958"
 */
export function normalizePhoneE164(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/^\+/, "").replace(/[\s\-().]/g, "");
  if (!/^\d+$/.test(digits)) return null;

  if (hasPlus) {
    const candidate = `+${digits}`;
    return isValidE164(candidate) ? candidate : null;
  }
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}
