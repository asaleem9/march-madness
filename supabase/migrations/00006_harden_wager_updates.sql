-- Stop an opponent from self-resolving a wager (status='resolved',
-- winner_id=self) or tampering with stakes/winner via the anon client. The
-- previous UPDATE policy's WITH CHECK only verified ownership, and there was no
-- column restriction. The app performs every wager response with the service
-- role, so restricting the `authenticated` role here doesn't affect the app.

-- winner_id / resolved_at / stakes / status-to-resolved are the scoring
-- pipeline's job. A responding opponent may only touch these two columns.
REVOKE UPDATE ON public.wagers FROM authenticated;
GRANT UPDATE (status, opponent_bracket_id) ON public.wagers TO authenticated;

-- And only allow the pending -> accepted/declined transition (never a jump to
-- 'resolved').
DROP POLICY IF EXISTS "Opponents can respond to wagers" ON wagers;
CREATE POLICY "Opponents can respond to wagers" ON wagers
  FOR UPDATE TO authenticated
  USING (
    auth.uid() = opponent_id AND status = 'pending'
  )
  WITH CHECK (
    auth.uid() = opponent_id
    AND status IN ('accepted', 'declined')
  );
