-- Phase 8: Notifications, Real-Time & Workflow Configuration

-- Enums
CREATE TYPE "NotificationPriority" AS ENUM ('low', 'normal', 'high', 'critical');
CREATE TYPE "NotificationChannel" AS ENUM ('in_app', 'email', 'sms');
CREATE TYPE "DeliveryStatus" AS ENUM ('queued', 'sending', 'sent', 'delivered', 'failed', 'bounced', 'suppressed');
CREATE TYPE "DigestMode" AS ENUM ('immediate', 'daily', 'weekly');
CREATE TYPE "SuppressionReason" AS ENUM ('hard_bounce', 'complaint', 'invalid', 'manual', 'unsubscribed');
CREATE TYPE "MessageThreadType" AS ENUM ('direct', 'group', 'announcement');
CREATE TYPE "ThreadParticipantRole" AS ENUM ('owner', 'member');
CREATE TYPE "AnnouncementAudienceType" AS ENUM ('all_staff', 'departments', 'roles', 'specific_users');
CREATE TYPE "AnnouncementStatus" AS ENUM ('draft', 'published', 'expired', 'withdrawn');
CREATE TYPE "ApproverType" AS ENUM ('role', 'specific_user', 'reporting_manager', 'department_head');

ALTER TYPE "PermissionModule" ADD VALUE 'notifications';

-- Extend notifications (Phase 0 table)
ALTER TABLE "notifications"
    ADD COLUMN "notification_type_code" TEXT,
    ADD COLUMN "priority" "NotificationPriority" NOT NULL DEFAULT 'normal',
    ADD COLUMN "action_url" TEXT,
    ADD COLUMN "data" JSONB,
    ADD COLUMN "group_key" TEXT,
    ADD COLUMN "expires_at" TIMESTAMP(3),
    ADD COLUMN "delivered_via" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    ADD COLUMN "archived_at" TIMESTAMP(3);

CREATE INDEX "notifications_notification_type_code_idx" ON "notifications"("notification_type_code");
CREATE INDEX "notifications_group_key_idx" ON "notifications"("group_key");
CREATE INDEX "notifications_user_id_created_at_idx" ON "notifications"("user_id", "created_at");

-- Organization settings
ALTER TABLE "organization_settings"
    ADD COLUMN "notification_quiet_hours_default_start" TEXT,
    ADD COLUMN "notification_quiet_hours_default_end" TEXT,
    ADD COLUMN "message_edit_window_minutes" INTEGER NOT NULL DEFAULT 15,
    ADD COLUMN "notification_dedup_window_seconds" INTEGER NOT NULL DEFAULT 300,
    ADD COLUMN "sms_enabled" BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN "email_enabled" BOOLEAN NOT NULL DEFAULT true;

-- notification_types
CREATE TABLE "notification_types" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "module" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "default_channels" TEXT[] NOT NULL,
    "allowed_channels" TEXT[] NOT NULL,
    "is_user_configurable" BOOLEAN NOT NULL DEFAULT true,
    "priority" "NotificationPriority" NOT NULL DEFAULT 'normal',
    "supports_digest" BOOLEAN NOT NULL DEFAULT true,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "notification_types_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "notification_types_code_key" ON "notification_types"("code");

-- notification_templates
CREATE TABLE "notification_templates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "notification_type_code" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "variables" JSONB NOT NULL DEFAULT '[]',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updated_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "notification_templates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "notification_templates_notification_type_code_channel_locale_is_active_key"
    ON "notification_templates"("notification_type_code", "channel", "locale", "is_active");
CREATE INDEX "notification_templates_notification_type_code_idx"
    ON "notification_templates"("notification_type_code");

ALTER TABLE "notification_templates"
    ADD CONSTRAINT "notification_templates_updated_by_fkey"
    FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- notification_deliveries
CREATE TABLE "notification_deliveries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "notification_id" UUID NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "recipient_address" TEXT,
    "provider" TEXT,
    "provider_message_id" TEXT,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'queued',
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "last_attempt_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "error_code" TEXT,
    "error_message" TEXT,
    "content_snapshot" TEXT,
    "cost_units" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "notification_deliveries_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "notification_deliveries_notification_id_idx" ON "notification_deliveries"("notification_id");
CREATE INDEX "notification_deliveries_status_last_attempt_at_idx" ON "notification_deliveries"("status", "last_attempt_at");
CREATE INDEX "notification_deliveries_channel_status_idx" ON "notification_deliveries"("channel", "status");

ALTER TABLE "notification_deliveries"
    ADD CONSTRAINT "notification_deliveries_notification_id_fkey"
    FOREIGN KEY ("notification_id") REFERENCES "notifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- notification_preferences
CREATE TABLE "notification_preferences" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "notification_type_code" TEXT NOT NULL,
    "in_app_enabled" BOOLEAN NOT NULL DEFAULT true,
    "email_enabled" BOOLEAN NOT NULL DEFAULT true,
    "sms_enabled" BOOLEAN NOT NULL DEFAULT true,
    "digest_mode" "DigestMode" NOT NULL DEFAULT 'immediate',
    "quiet_hours_start" TEXT,
    "quiet_hours_end" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "notification_preferences_user_id_notification_type_code_key"
    ON "notification_preferences"("user_id", "notification_type_code");
CREATE INDEX "notification_preferences_user_id_notification_type_code_idx"
    ON "notification_preferences"("user_id", "notification_type_code");

ALTER TABLE "notification_preferences"
    ADD CONSTRAINT "notification_preferences_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- suppression_list
CREATE TABLE "suppression_list" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "channel" "NotificationChannel" NOT NULL,
    "address" TEXT NOT NULL,
    "reason" "SuppressionReason" NOT NULL,
    "suppressed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "suppressed_by" UUID,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "suppression_list_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "suppression_list_channel_address_key" ON "suppression_list"("channel", "address");
CREATE INDEX "suppression_list_channel_address_idx" ON "suppression_list"("channel", "address");

ALTER TABLE "suppression_list"
    ADD CONSTRAINT "suppression_list_suppressed_by_fkey"
    FOREIGN KEY ("suppressed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- digests (before digest_queue FK to digests)
CREATE TABLE "digests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "digest_mode" "DigestMode" NOT NULL,
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "notification_count" INTEGER NOT NULL,
    "sent_at" TIMESTAMP(3),
    "delivery_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "digests_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "digests"
    ADD CONSTRAINT "digests_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- digest_queue
CREATE TABLE "digest_queue" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "notification_id" UUID NOT NULL,
    "digest_mode" "DigestMode" NOT NULL,
    "scheduled_for" TIMESTAMP(3) NOT NULL,
    "included_in_digest_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "digest_queue_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "digest_queue_user_id_scheduled_for_idx" ON "digest_queue"("user_id", "scheduled_for");

ALTER TABLE "digest_queue"
    ADD CONSTRAINT "digest_queue_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "digest_queue_notification_id_fkey"
    FOREIGN KEY ("notification_id") REFERENCES "notifications"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "digest_queue_included_in_digest_id_fkey"
    FOREIGN KEY ("included_in_digest_id") REFERENCES "digests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "digests"
    ADD CONSTRAINT "digests_delivery_id_fkey"
    FOREIGN KEY ("delivery_id") REFERENCES "notification_deliveries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- message_threads
CREATE TABLE "message_threads" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "thread_type" "MessageThreadType" NOT NULL,
    "subject" TEXT,
    "created_by" UUID NOT NULL,
    "department" TEXT,
    "target_roles" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "is_closed" BOOLEAN NOT NULL DEFAULT false,
    "last_message_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "message_threads_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "message_threads"
    ADD CONSTRAINT "message_threads_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- thread_participants
CREATE TABLE "thread_participants" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "thread_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "ThreadParticipantRole" NOT NULL DEFAULT 'member',
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "left_at" TIMESTAMP(3),
    "last_read_message_id" UUID,
    "is_muted" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "thread_participants_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "thread_participants_user_id_thread_id_idx" ON "thread_participants"("user_id", "thread_id");

ALTER TABLE "thread_participants"
    ADD CONSTRAINT "thread_participants_thread_id_fkey"
    FOREIGN KEY ("thread_id") REFERENCES "message_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "thread_participants_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- messages (staff internal messaging — distinct from portal messages)
CREATE TABLE "messages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "thread_id" UUID NOT NULL,
    "sender_user_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "attachment_ids" UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
    "reply_to_message_id" UUID,
    "edited_at" TIMESTAMP(3),
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "messages_thread_id_created_at_idx" ON "messages"("thread_id", "created_at");

ALTER TABLE "messages"
    ADD CONSTRAINT "messages_thread_id_fkey"
    FOREIGN KEY ("thread_id") REFERENCES "message_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "messages_sender_user_id_fkey"
    FOREIGN KEY ("sender_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- announcements
CREATE TABLE "announcements" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "audience_type" "AnnouncementAudienceType" NOT NULL,
    "audience" JSONB NOT NULL DEFAULT '{}',
    "publish_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "is_pinned" BOOLEAN NOT NULL DEFAULT false,
    "attachment_ids" UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
    "created_by" UUID NOT NULL,
    "status" "AnnouncementStatus" NOT NULL DEFAULT 'draft',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "announcements_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "announcements_status_publish_at_idx" ON "announcements"("status", "publish_at");
CREATE INDEX "announcements_expires_at_idx" ON "announcements"("expires_at");

ALTER TABLE "announcements"
    ADD CONSTRAINT "announcements_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- announcement_reads
CREATE TABLE "announcement_reads" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "announcement_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "read_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "announcement_reads_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "announcement_reads_announcement_id_user_id_key"
    ON "announcement_reads"("announcement_id", "user_id");

ALTER TABLE "announcement_reads"
    ADD CONSTRAINT "announcement_reads_announcement_id_fkey"
    FOREIGN KEY ("announcement_id") REFERENCES "announcements"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "announcement_reads_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- notice_board_items
CREATE TABLE "notice_board_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "category" TEXT,
    "attachment_ids" UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
    "valid_from" TIMESTAMP(3),
    "valid_until" TIMESTAMP(3),
    "is_pinned" BOOLEAN NOT NULL DEFAULT false,
    "created_by" UUID NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "notice_board_items_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "notice_board_items"
    ADD CONSTRAINT "notice_board_items_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- approval_chains
CREATE TABLE "approval_chains" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workflow_code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "approval_chains_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "approval_chains_workflow_code_version_key"
    ON "approval_chains"("workflow_code", "version");

-- approval_chain_steps
CREATE TABLE "approval_chain_steps" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "approval_chain_id" UUID NOT NULL,
    "level" INTEGER NOT NULL,
    "approver_type" "ApproverType" NOT NULL,
    "approver_role" TEXT,
    "approver_user_id" UUID,
    "condition" JSONB,
    "is_mandatory" BOOLEAN NOT NULL DEFAULT true,
    "escalation_after_hours" INTEGER,
    "escalate_to_role" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "approval_chain_steps_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "approval_chain_steps_approval_chain_id_level_idx"
    ON "approval_chain_steps"("approval_chain_id", "level");

ALTER TABLE "approval_chain_steps"
    ADD CONSTRAINT "approval_chain_steps_approval_chain_id_fkey"
    FOREIGN KEY ("approval_chain_id") REFERENCES "approval_chains"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- reminder_schedules
CREATE TABLE "reminder_schedules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "reminder_code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "target_event" TEXT NOT NULL,
    "offset_days" INTEGER NOT NULL,
    "repeat_interval_days" INTEGER,
    "max_repeats" INTEGER,
    "channels" TEXT[] NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "reminder_schedules_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "reminder_schedules_reminder_code_key" ON "reminder_schedules"("reminder_code");

-- socket_sessions
CREATE TABLE "socket_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "socket_id" TEXT NOT NULL,
    "connected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "disconnected_at" TIMESTAMP(3),
    "user_agent" TEXT,
    "ip_address" TEXT,
    "rooms" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    CONSTRAINT "socket_sessions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "socket_sessions_user_id_idx" ON "socket_sessions"("user_id");
CREATE INDEX "socket_sessions_socket_id_idx" ON "socket_sessions"("socket_id");

ALTER TABLE "socket_sessions"
    ADD CONSTRAINT "socket_sessions_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
