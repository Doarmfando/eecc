-- CreateEnum
CREATE TYPE "OrganizationStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'CLOSED');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INVITED', 'DISABLED');

-- CreateEnum
CREATE TYPE "MembershipRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER', 'VIEWER');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('ACTIVE', 'REVOKED');

-- CreateEnum
CREATE TYPE "ApiKeyStatus" AS ENUM ('ACTIVE', 'REVOKED');

-- CreateEnum
CREATE TYPE "StatementStatus" AS ENUM ('REGISTERED', 'UPLOADED', 'PROCESSED', 'DELETED');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('PENDING', 'UPLOADED', 'QUEUED', 'PROCESSING', 'SUCCEEDED', 'NEEDS_REVIEW', 'FAILED');

-- CreateEnum
CREATE TYPE "JobAttemptStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'NEEDS_REVIEW', 'FAILED');

-- CreateEnum
CREATE TYPE "WarningSeverity" AS ENUM ('INFO', 'WARNING', 'ERROR');

-- CreateEnum
CREATE TYPE "ArtifactKind" AS ENUM ('SOURCE_PDF', 'RESULT_XLSX', 'RESULT_CSV', 'TECHNICAL_MANIFEST');

-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL,
    "display_name" VARCHAR(160) NOT NULL,
    "status" "OrganizationStatus" NOT NULL DEFAULT 'ACTIVE',
    "retention_days" INTEGER NOT NULL DEFAULT 90,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email_normalized" VARCHAR(320) NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'INVITED',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_memberships" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "MembershipRole" NOT NULL DEFAULT 'MEMBER',
    "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "organization_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_keys" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "label" VARCHAR(80) NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "status" "ApiKeyStatus" NOT NULL DEFAULT 'ACTIVE',
    "last_used_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "statements" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "uploaded_by" UUID,
    "content_fingerprint" VARCHAR(64) NOT NULL,
    "byte_size" INTEGER NOT NULL,
    "status" "StatementStatus" NOT NULL DEFAULT 'REGISTERED',
    "bank_code" VARCHAR(32),
    "currency_code" CHAR(3),
    "period_start" DATE,
    "period_end" DATE,
    "account_alias" VARCHAR(32),
    "retain_until" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "statements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jobs" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "statement_id" UUID NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "idempotency_key" VARCHAR(128) NOT NULL,
    "profile_version" VARCHAR(32) NOT NULL,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_attempts" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "attempt_number" INTEGER NOT NULL,
    "status" "JobAttemptStatus" NOT NULL DEFAULT 'RUNNING',
    "extractor_id" VARCHAR(64),
    "extractor_version" VARCHAR(32),
    "error_code" VARCHAR(64),
    "row_count" INTEGER,
    "movement_count" INTEGER,
    "page_count" INTEGER,
    "checks" JSONB,
    "checks_version" INTEGER NOT NULL DEFAULT 1,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ(6),

    CONSTRAINT "job_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_warnings" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "job_attempt_id" UUID NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "severity" "WarningSeverity" NOT NULL DEFAULT 'WARNING',
    "page" INTEGER,
    "occurrences" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_warnings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "artifacts" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "statement_id" UUID NOT NULL,
    "job_attempt_id" UUID,
    "kind" "ArtifactKind" NOT NULL,
    "object_key" VARCHAR(255) NOT NULL,
    "byte_size" INTEGER NOT NULL,
    "checksum" VARCHAR(64) NOT NULL,
    "retain_until" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "artifacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "actor_user_id" UUID,
    "action" VARCHAR(64) NOT NULL,
    "entity_type" VARCHAR(48) NOT NULL,
    "entity_id" UUID,
    "request_id" VARCHAR(64),
    "metadata" JSONB,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_events" (
    "id" UUID NOT NULL,
    "aggregate_type" VARCHAR(48) NOT NULL,
    "aggregate_id" UUID NOT NULL,
    "event_type" VARCHAR(64) NOT NULL,
    "payload_version" INTEGER NOT NULL DEFAULT 1,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_at" TIMESTAMPTZ(6),

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_normalized_key" ON "users"("email_normalized");

-- CreateIndex
CREATE INDEX "organization_memberships_user_id_status_idx" ON "organization_memberships"("user_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "organization_memberships_organization_id_user_id_key" ON "organization_memberships"("organization_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_token_hash_key" ON "api_keys"("token_hash");

-- CreateIndex
CREATE INDEX "api_keys_organization_id_status_idx" ON "api_keys"("organization_id", "status");

-- CreateIndex
CREATE INDEX "statements_organization_id_created_at_idx" ON "statements"("organization_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "statements_organization_id_content_fingerprint_idx" ON "statements"("organization_id", "content_fingerprint");

-- CreateIndex
CREATE UNIQUE INDEX "statements_organization_id_id_key" ON "statements"("organization_id", "id");

-- CreateIndex
CREATE INDEX "jobs_organization_id_status_created_at_idx" ON "jobs"("organization_id", "status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "jobs_organization_id_idempotency_key_key" ON "jobs"("organization_id", "idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "jobs_organization_id_id_key" ON "jobs"("organization_id", "id");

-- CreateIndex
CREATE INDEX "job_attempts_organization_id_status_idx" ON "job_attempts"("organization_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "job_attempts_job_id_attempt_number_key" ON "job_attempts"("job_id", "attempt_number");

-- CreateIndex
CREATE UNIQUE INDEX "job_attempts_organization_id_id_key" ON "job_attempts"("organization_id", "id");

-- CreateIndex
CREATE INDEX "job_warnings_organization_id_code_idx" ON "job_warnings"("organization_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "job_warnings_job_attempt_id_code_page_key" ON "job_warnings"("job_attempt_id", "code", "page");

-- CreateIndex
CREATE UNIQUE INDEX "artifacts_object_key_key" ON "artifacts"("object_key");

-- CreateIndex
CREATE INDEX "artifacts_organization_id_statement_id_kind_idx" ON "artifacts"("organization_id", "statement_id", "kind");

-- CreateIndex
CREATE INDEX "audit_events_organization_id_occurred_at_idx" ON "audit_events"("organization_id", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "outbox_events_published_at_created_at_idx" ON "outbox_events"("published_at", "created_at");

-- AddForeignKey
ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "statements" ADD CONSTRAINT "statements_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "statements" ADD CONSTRAINT "statements_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_organization_id_statement_id_fkey" FOREIGN KEY ("organization_id", "statement_id") REFERENCES "statements"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_attempts" ADD CONSTRAINT "job_attempts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_attempts" ADD CONSTRAINT "job_attempts_organization_id_job_id_fkey" FOREIGN KEY ("organization_id", "job_id") REFERENCES "jobs"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_warnings" ADD CONSTRAINT "job_warnings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_warnings" ADD CONSTRAINT "job_warnings_organization_id_job_attempt_id_fkey" FOREIGN KEY ("organization_id", "job_attempt_id") REFERENCES "job_attempts"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_organization_id_statement_id_fkey" FOREIGN KEY ("organization_id", "statement_id") REFERENCES "statements"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_organization_id_job_attempt_id_fkey" FOREIGN KEY ("organization_id", "job_attempt_id") REFERENCES "job_attempts"("organization_id", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
