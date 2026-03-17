-- Fix: RLS policy prevented setting locked=true because the USING clause
-- (which doubles as WITH CHECK when none is specified) rejects the new row
-- where locked=true. Add explicit WITH CHECK that allows the lock transition.

DROP POLICY "Users can update own unlocked brackets" ON brackets;

CREATE POLICY "Users can update own unlocked brackets" ON brackets
  FOR UPDATE TO authenticated
  USING (
    auth.uid() = user_id
    AND locked = false
    AND NOW() < (SELECT bracket_lock_deadline FROM tournament_config WHERE id = 1)
  )
  WITH CHECK (
    auth.uid() = user_id
  );
