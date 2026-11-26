BEGIN;

ALTER TABLE "organization_memberships" ADD COLUMN "personal_renewal_cancelled_at" TIMESTAMPTZ(6);

CREATE TABLE "personal_payments" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "membership_id" UUID,
    "reference" VARCHAR(100) NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "pages" INTEGER NOT NULL,
    "starts_on" DATE NOT NULL,
    "ends_on" DATE NOT NULL,
    "anchor_on" DATE NOT NULL,
    "recorded_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "personal_payments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "personal_payments_valid_period" CHECK ("ends_on" > "starts_on" AND "anchor_on" <= "starts_on"),
    CONSTRAINT "personal_payments_positive" CHECK ("pages" > 0 AND "amount" > 0),
    CONSTRAINT "personal_payments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "personal_payments_membership_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "organization_memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "personal_payments_organization_id_reference_key" ON "personal_payments"("organization_id", "reference");
CREATE UNIQUE INDEX "personal_payments_membership_id_starts_on_key" ON "personal_payments"("membership_id", "starts_on");
CREATE INDEX "personal_payments_organization_id_recorded_at_idx" ON "personal_payments"("organization_id", "recorded_at");

COMMIT;
