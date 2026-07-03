-- Prevent score tampering from the browser (anon/authenticated) client.
--
-- Background: the app writes picks and scores exclusively with the service-role
-- client (cron, admin, and the brackets API). The RLS policies for the
-- `authenticated` role existed as a fallback, but they placed no restriction on
-- WHICH columns a user could set — so a logged-in user could open devtools and
-- run, against the RLS-respecting anon client:
--     update bracket_picks set points_earned = 99999, is_correct = true ...
--     update brackets set score = 999999, locked = true ...
-- and the authoritative recalc (which SUMs points_earned) would trust it.
--
-- RLS is row-level, not column-level, so we use column privileges to lock the
-- scoring columns to the service role. Legitimate app writes are unaffected
-- because they run as service_role, which retains ALL privileges.

-- bracket_picks: a user may only ever choose which team they picked.
-- is_correct and points_earned are set by the scoring pipeline only.
REVOKE INSERT, UPDATE ON public.bracket_picks FROM authenticated;
GRANT INSERT (bracket_id, game_slot, round, picked_team_id)
  ON public.bracket_picks TO authenticated;
GRANT UPDATE (picked_team_id) ON public.bracket_picks TO authenticated;

-- brackets: a user may set name/lock state/primary flag but never their score.
REVOKE INSERT, UPDATE ON public.brackets FROM authenticated;
GRANT INSERT (user_id, name, is_primary, locked) ON public.brackets TO authenticated;
GRANT UPDATE (name, is_primary, locked, updated_at) ON public.brackets TO authenticated;

-- Close the post-deadline editing hole: brackets only lock when a user chooses
-- to, so an unlocked bracket's picks were editable/deletable after the deadline.
-- Add the deadline (matching the INSERT policy) to UPDATE and DELETE, and pin a
-- WITH CHECK so rows can't be moved to another bracket.
DROP POLICY IF EXISTS "Users can update picks for own unlocked brackets" ON bracket_picks;
CREATE POLICY "Users can update picks for own unlocked brackets" ON bracket_picks
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM brackets
      WHERE brackets.id = bracket_picks.bracket_id
      AND brackets.user_id = auth.uid()
      AND brackets.locked = false
      AND NOW() < (SELECT bracket_lock_deadline FROM tournament_config WHERE id = 1)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM brackets
      WHERE brackets.id = bracket_picks.bracket_id
      AND brackets.user_id = auth.uid()
      AND brackets.locked = false
      AND NOW() < (SELECT bracket_lock_deadline FROM tournament_config WHERE id = 1)
    )
  );

DROP POLICY IF EXISTS "Users can delete picks for own unlocked brackets" ON bracket_picks;
CREATE POLICY "Users can delete picks for own unlocked brackets" ON bracket_picks
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM brackets
      WHERE brackets.id = bracket_picks.bracket_id
      AND brackets.user_id = auth.uid()
      AND brackets.locked = false
      AND NOW() < (SELECT bracket_lock_deadline FROM tournament_config WHERE id = 1)
    )
  );
