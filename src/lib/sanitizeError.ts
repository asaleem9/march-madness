// Maps raw database/Supabase errors to user-friendly messages.
// Prevents leaking internal schema details or stack traces to the client.

const ERROR_MAP: [RegExp, string][] = [
  [/duplicate key.*brackets_user_id/, "You already have a bracket"],
  [/duplicate key.*bracket_picks/, "A pick for this game already exists"],
  [/violates foreign key.*picked_team_id/, "Invalid team selection"],
  [/violates foreign key.*bracket_id/, "Bracket not found"],
  [/violates foreign key.*opponent_id/, "Selected opponent not found"],
  [/violates check constraint/, "Invalid data provided"],
  [/violates not-null constraint/, "Missing required field"],
  [/row-level security/, "You don't have permission to do that"],
  [/jwt expired/, "Your session has expired — please log in again"],
  [/invalid input syntax/, "Invalid input provided"],
  [/value too long/, "Input is too long"],
  [/deadlock detected/, "Please try again"],
  [/could not serialize/, "Please try again"],
  [/connection refused|connection reset|timeout/, "Service temporarily unavailable — please try again"],
];

const FALLBACK = "Something went wrong. Please try again.";

export function sanitizeError(raw: string | null | undefined): string {
  if (!raw) return FALLBACK;
  const lower = raw.toLowerCase();
  for (const [pattern, friendly] of ERROR_MAP) {
    if (pattern.test(lower)) return friendly;
  }
  return FALLBACK;
}
