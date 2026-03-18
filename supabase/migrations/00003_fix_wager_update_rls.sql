-- Fix: RLS policy on wagers prevented accepting/declining because the USING
-- clause (which doubles as WITH CHECK when none is specified) rejects the
-- updated row where status is no longer 'pending'.

DROP POLICY "Opponents can respond to wagers" ON wagers;

CREATE POLICY "Opponents can respond to wagers" ON wagers
  FOR UPDATE TO authenticated
  USING (
    auth.uid() = opponent_id AND status = 'pending'
  )
  WITH CHECK (
    auth.uid() = opponent_id
  );
