-- Email waitlist for next season notifications
CREATE TABLE email_waitlist (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Allow inserts from anon (public visitors)
ALTER TABLE email_waitlist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can sign up for waitlist"
  ON email_waitlist
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- No one can read/update/delete except service role
CREATE POLICY "Only service role can read waitlist"
  ON email_waitlist
  FOR SELECT
  TO service_role
  USING (true);
