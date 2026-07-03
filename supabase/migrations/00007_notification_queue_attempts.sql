-- Track delivery attempts so a notification that fails on every channel is
-- retried on the next run instead of being dropped — but gives up after a few
-- tries so a permanently-undeliverable item doesn't retry forever.
ALTER TABLE notification_queue
  ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0;
