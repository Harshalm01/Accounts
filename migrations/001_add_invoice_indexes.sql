-- PostgreSQL Migration: Database Index Optimization for 3FM Creator Portal
-- Target: Reduce query execution time and table scans on Supabase PostgreSQL

-- 1. Index for Campaign Invoices filtering and sorting (WHERE campaign_id = ? ORDER BY id DESC)
CREATE INDEX IF NOT EXISTS idx_invoices_campaign_id_id ON invoices(campaign_id, id DESC);

-- 2. Index for Invoice Status filtering (WHERE status = ?)
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);

-- 3. Composite Index for Campaign + Status filtering
CREATE INDEX IF NOT EXISTS idx_invoices_team_status ON invoices(campaign_id, status);

-- 4. Index for Unread Notifications Drawer (WHERE is_read = 0 ORDER BY id DESC)
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(is_read, id DESC);

-- 5. Index for Campaign Creators Lookup (WHERE campaign_id = ? AND creator_name = ?)
CREATE INDEX IF NOT EXISTS idx_campaign_creators_lookup ON campaign_creators(campaign_id, creator_name);
