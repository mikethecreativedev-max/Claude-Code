-- CreateEnum
CREATE TYPE "SubscriptionTier" AS ENUM ('FREE', 'PAID');

-- CreateEnum
CREATE TYPE "BillingStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('OWNER', 'REGISTERED_MANAGER', 'STAFF', 'BNCL_ADMIN');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('INVITED', 'ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "ModuleName" AS ENUM ('DASHBOARD', 'AUDITS', 'INCIDENTS', 'EVENTS', 'RISK_REGISTER', 'POLICIES', 'FEEDBACK_COMPLAINTS', 'NOTICES', 'TRAINING', 'CALENDAR', 'EVIDENCE_PACKS', 'QG_HUB', 'READINESS_SCORER', 'ADMIN_USERS', 'ADMIN_SITES', 'ADMIN_BILLING', 'ADMIN_DATA_PROTECTION', 'BNCL_SUPER_ADMIN');

-- CreateEnum
CREATE TYPE "CQCDomain" AS ENUM ('SAFE', 'EFFECTIVE', 'CARING', 'RESPONSIVE', 'WELL_LED');

-- CreateEnum
CREATE TYPE "SixPillarName" AS ENUM ('QUALITY_SAFETY_OVERSIGHT', 'RISK_MANAGEMENT', 'INCIDENT_SAFETY_EVENT_MANAGEMENT', 'RECORDS_INFO_GOVERNANCE', 'WORKFORCE_GOVERNANCE', 'FEEDBACK_COMPLAINTS_LEARNING');

-- CreateEnum
CREATE TYPE "AuditStatus" AS ENUM ('SCHEDULED', 'OVERDUE', 'COMPLETED');

-- CreateEnum
CREATE TYPE "IncidentSeverity" AS ENUM ('NO_HARM', 'LOW', 'MODERATE', 'SEVERE', 'DEATH');

-- CreateEnum
CREATE TYPE "IncidentStatus" AS ENUM ('OPEN', 'INVESTIGATING', 'CLOSED');

-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "RiskStatus" AS ENUM ('OPEN', 'MITIGATING', 'CLOSED', 'ACCEPTED');

-- CreateEnum
CREATE TYPE "PolicyStatus" AS ENUM ('ACTIVE', 'UNDER_REVIEW', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "FeedbackSource" AS ENUM ('PATIENT', 'STAFF');

-- CreateEnum
CREATE TYPE "FeedbackStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "NoticeType" AS ENUM ('INTERNAL_ANNOUNCEMENT', 'REGULATORY_UPDATE', 'POLICY_CHANGE_ALERT');

-- CreateEnum
CREATE TYPE "NoticeAudience" AS ENUM ('ALL_STAFF', 'MANAGERS_ONLY', 'SPECIFIC_SITE');

-- CreateEnum
CREATE TYPE "QGContentType" AS ENUM ('ARTICLE', 'LESSON');

-- CreateEnum
CREATE TYPE "QGPublishStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "CalendarLinkedModule" AS ENUM ('AUDIT', 'POLICY_REVIEW', 'TRAINING', 'EVENT', 'MANUAL');

-- CreateEnum
CREATE TYPE "CalendarTaskStatus" AS ENUM ('PENDING', 'DONE', 'OVERDUE');

-- CreateEnum
CREATE TYPE "TrainingStatus" AS ENUM ('VALID', 'EXPIRING_SOON', 'EXPIRED');

-- CreateEnum
CREATE TYPE "TaggableEntityType" AS ENUM ('AUDIT', 'INCIDENT', 'EVENT', 'RISK_ENTRY', 'POLICY', 'FEEDBACK_COMPLAINT');

-- CreateEnum
CREATE TYPE "AttachableEntityType" AS ENUM ('AUDIT', 'INCIDENT', 'EVENT', 'RISK_ENTRY', 'POLICY', 'FEEDBACK_COMPLAINT', 'TRAINING_RECORD', 'DATA_PROCESSING_AGREEMENT');

-- CreateEnum
CREATE TYPE "AuditableEntityType" AS ENUM ('ORGANISATION', 'SITE', 'USER', 'AUDIT', 'INCIDENT', 'EVENT', 'RISK_ENTRY', 'POLICY', 'FEEDBACK_COMPLAINT', 'NOTICE', 'TRAINING_RECORD', 'CALENDAR_TASK', 'READINESS_SCORE', 'DATA_PROCESSING_AGREEMENT', 'QG_HUB_CONTENT', 'ROLE_PERMISSION');

-- CreateEnum
CREATE TYPE "AuditLogAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'APPROVE', 'RESTORE', 'EXPORT', 'LOGIN', 'LOGOUT', 'INVITE', 'ACKNOWLEDGE');

-- CreateTable
CREATE TABLE "Organisation" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subscriptionTier" "SubscriptionTier" NOT NULL DEFAULT 'FREE',
    "billingStatus" "BillingStatus" NOT NULL DEFAULT 'TRIALING',
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "isInternal" BOOLEAN NOT NULL DEFAULT false,
    "retentionPolicyMonths" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Organisation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Site" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "registeredActivities" TEXT[],
    "cqcLocationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Site_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" TIMESTAMP(3),
    "passwordHash" TEXT,
    "role" "UserRole" NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'INVITED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserSite" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserSite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "id" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "module" "ModuleName" NOT NULL,
    "canView" BOOLEAN NOT NULL DEFAULT false,
    "canEdit" BOOLEAN NOT NULL DEFAULT false,
    "canApprove" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegulatorySubClause" (
    "id" TEXT NOT NULL,
    "regulation" TEXT NOT NULL,
    "subParagraph" TEXT NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "RegulatorySubClause_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CQCKeyQuestion" (
    "id" TEXT NOT NULL,
    "name" "CQCDomain" NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "CQCKeyQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SixPillar" (
    "id" TEXT NOT NULL,
    "name" "SixPillarName" NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "SixPillar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Audit" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "scheduledDate" TIMESTAMP(3) NOT NULL,
    "completedDate" TIMESTAMP(3),
    "completedById" TEXT,
    "resultScore" INTEGER,
    "sixPillarId" TEXT,
    "status" "AuditStatus" NOT NULL DEFAULT 'SCHEDULED',
    "followUpActions" JSONB NOT NULL DEFAULT '[]',
    "versionNumber" INTEGER NOT NULL DEFAULT 1,
    "isCurrentVersion" BOOLEAN NOT NULL DEFAULT true,
    "supersededById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Audit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Incident" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "reportedById" TEXT NOT NULL,
    "dateTime" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "anonymisationAcknowledged" BOOLEAN NOT NULL DEFAULT false,
    "severityGrading" "IncidentSeverity" NOT NULL,
    "psirfClassification" TEXT NOT NULL,
    "notifiableToCQC" BOOLEAN NOT NULL DEFAULT false,
    "status" "IncidentStatus" NOT NULL DEFAULT 'OPEN',
    "followUpActions" JSONB NOT NULL DEFAULT '[]',
    "versionNumber" INTEGER NOT NULL DEFAULT 1,
    "isCurrentVersion" BOOLEAN NOT NULL DEFAULT true,
    "supersededById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Incident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "dateTime" TIMESTAMP(3) NOT NULL,
    "status" "EventStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiskEntry" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "likelihood" INTEGER NOT NULL,
    "impact" INTEGER NOT NULL,
    "riskRating" INTEGER NOT NULL,
    "ownerId" TEXT NOT NULL,
    "mitigationActions" JSONB NOT NULL DEFAULT '[]',
    "reviewDate" TIMESTAMP(3) NOT NULL,
    "status" "RiskStatus" NOT NULL DEFAULT 'OPEN',
    "versionNumber" INTEGER NOT NULL DEFAULT 1,
    "isCurrentVersion" BOOLEAN NOT NULL DEFAULT true,
    "supersededById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "RiskEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Policy" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "reviewDate" TIMESTAMP(3) NOT NULL,
    "status" "PolicyStatus" NOT NULL DEFAULT 'ACTIVE',
    "versionNumber" INTEGER NOT NULL DEFAULT 1,
    "isCurrentVersion" BOOLEAN NOT NULL DEFAULT true,
    "supersededById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Policy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedbackComplaint" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "source" "FeedbackSource" NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "outcome" TEXT,
    "status" "FeedbackStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "FeedbackComplaint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notice" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "siteId" TEXT,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "noticeType" "NoticeType" NOT NULL,
    "postedById" TEXT NOT NULL,
    "postedDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "audience" "NoticeAudience" NOT NULL,
    "acknowledgementRequired" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Notice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NoticeAcknowledgement" (
    "id" TEXT NOT NULL,
    "noticeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "acknowledgedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NoticeAcknowledgement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QGHubContent" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "contentType" "QGContentType" NOT NULL,
    "publishStatus" "QGPublishStatus" NOT NULL DEFAULT 'DRAFT',
    "body" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QGHubContent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReadinessScore" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "siteId" TEXT,
    "questionnaireResponses" JSONB NOT NULL,
    "scorePerDomain" JSONB NOT NULL,
    "overallScore" DOUBLE PRECISION NOT NULL,
    "dateTaken" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReadinessScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarTask" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "linkedModule" "CalendarLinkedModule" NOT NULL,
    "linkedEntityId" TEXT,
    "title" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "assignedToId" TEXT,
    "status" "CalendarTaskStatus" NOT NULL DEFAULT 'PENDING',
    "reminderSettings" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "CalendarTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingRecord" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "courseName" TEXT NOT NULL,
    "completionDate" TIMESTAMP(3) NOT NULL,
    "expiryDate" TIMESTAMP(3),
    "status" "TrainingStatus" NOT NULL DEFAULT 'VALID',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "TrainingRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLogEntry" (
    "id" TEXT NOT NULL,
    "orgId" TEXT,
    "entityType" "AuditableEntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" "AuditLogAction" NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "beforeSnapshot" JSONB,
    "afterSnapshot" JSONB,

    CONSTRAINT "AuditLogEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "relatedEntityType" "AuditableEntityType",
    "relatedEntityId" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readStatus" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataProcessingAgreement" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "signedById" TEXT NOT NULL,
    "signedDate" TIMESTAMP(3) NOT NULL,
    "version" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DataProcessingAgreement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegClauseTag" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "entityType" "TaggableEntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "regSubClauseId" TEXT NOT NULL,
    "taggedById" TEXT NOT NULL,
    "taggedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RegClauseTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CQCKeyQuestionTag" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "entityType" "TaggableEntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "cqcKeyQuestionId" TEXT NOT NULL,
    "taggedById" TEXT NOT NULL,
    "taggedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CQCKeyQuestionTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SixPillarTag" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "entityType" "TaggableEntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "sixPillarId" TEXT NOT NULL,
    "taggedById" TEXT NOT NULL,
    "taggedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SixPillarTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "entityType" "AttachableEntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "s3Key" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Organisation_stripeCustomerId_key" ON "Organisation"("stripeCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "Organisation_stripeSubscriptionId_key" ON "Organisation"("stripeSubscriptionId");

-- CreateIndex
CREATE INDEX "Organisation_deletedAt_idx" ON "Organisation"("deletedAt");

-- CreateIndex
CREATE INDEX "Site_orgId_idx" ON "Site"("orgId");

-- CreateIndex
CREATE INDEX "Site_orgId_deletedAt_idx" ON "Site"("orgId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_orgId_idx" ON "User"("orgId");

-- CreateIndex
CREATE INDEX "User_orgId_deletedAt_idx" ON "User"("orgId", "deletedAt");

-- CreateIndex
CREATE INDEX "UserSite_siteId_idx" ON "UserSite"("siteId");

-- CreateIndex
CREATE UNIQUE INDEX "UserSite_userId_siteId_key" ON "UserSite"("userId", "siteId");

-- CreateIndex
CREATE UNIQUE INDEX "RolePermission_role_module_key" ON "RolePermission"("role", "module");

-- CreateIndex
CREATE UNIQUE INDEX "RegulatorySubClause_regulation_subParagraph_key" ON "RegulatorySubClause"("regulation", "subParagraph");

-- CreateIndex
CREATE UNIQUE INDEX "CQCKeyQuestion_name_key" ON "CQCKeyQuestion"("name");

-- CreateIndex
CREATE UNIQUE INDEX "SixPillar_name_key" ON "SixPillar"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Audit_supersededById_key" ON "Audit"("supersededById");

-- CreateIndex
CREATE INDEX "Audit_orgId_idx" ON "Audit"("orgId");

-- CreateIndex
CREATE INDEX "Audit_orgId_siteId_idx" ON "Audit"("orgId", "siteId");

-- CreateIndex
CREATE INDEX "Audit_orgId_status_idx" ON "Audit"("orgId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Incident_supersededById_key" ON "Incident"("supersededById");

-- CreateIndex
CREATE INDEX "Incident_orgId_idx" ON "Incident"("orgId");

-- CreateIndex
CREATE INDEX "Incident_orgId_siteId_idx" ON "Incident"("orgId", "siteId");

-- CreateIndex
CREATE INDEX "Incident_orgId_status_idx" ON "Incident"("orgId", "status");

-- CreateIndex
CREATE INDEX "Event_orgId_idx" ON "Event"("orgId");

-- CreateIndex
CREATE INDEX "Event_orgId_siteId_idx" ON "Event"("orgId", "siteId");

-- CreateIndex
CREATE UNIQUE INDEX "RiskEntry_supersededById_key" ON "RiskEntry"("supersededById");

-- CreateIndex
CREATE INDEX "RiskEntry_orgId_idx" ON "RiskEntry"("orgId");

-- CreateIndex
CREATE INDEX "RiskEntry_orgId_siteId_idx" ON "RiskEntry"("orgId", "siteId");

-- CreateIndex
CREATE INDEX "RiskEntry_orgId_status_idx" ON "RiskEntry"("orgId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Policy_supersededById_key" ON "Policy"("supersededById");

-- CreateIndex
CREATE INDEX "Policy_orgId_idx" ON "Policy"("orgId");

-- CreateIndex
CREATE INDEX "Policy_orgId_siteId_idx" ON "Policy"("orgId", "siteId");

-- CreateIndex
CREATE INDEX "Policy_orgId_status_idx" ON "Policy"("orgId", "status");

-- CreateIndex
CREATE INDEX "FeedbackComplaint_orgId_idx" ON "FeedbackComplaint"("orgId");

-- CreateIndex
CREATE INDEX "FeedbackComplaint_orgId_siteId_idx" ON "FeedbackComplaint"("orgId", "siteId");

-- CreateIndex
CREATE INDEX "FeedbackComplaint_orgId_status_idx" ON "FeedbackComplaint"("orgId", "status");

-- CreateIndex
CREATE INDEX "Notice_orgId_idx" ON "Notice"("orgId");

-- CreateIndex
CREATE INDEX "Notice_orgId_siteId_idx" ON "Notice"("orgId", "siteId");

-- CreateIndex
CREATE INDEX "NoticeAcknowledgement_userId_idx" ON "NoticeAcknowledgement"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "NoticeAcknowledgement_noticeId_userId_key" ON "NoticeAcknowledgement"("noticeId", "userId");

-- CreateIndex
CREATE INDEX "ReadinessScore_orgId_idx" ON "ReadinessScore"("orgId");

-- CreateIndex
CREATE INDEX "ReadinessScore_orgId_dateTaken_idx" ON "ReadinessScore"("orgId", "dateTaken");

-- CreateIndex
CREATE INDEX "CalendarTask_orgId_idx" ON "CalendarTask"("orgId");

-- CreateIndex
CREATE INDEX "CalendarTask_orgId_siteId_idx" ON "CalendarTask"("orgId", "siteId");

-- CreateIndex
CREATE INDEX "CalendarTask_orgId_dueDate_idx" ON "CalendarTask"("orgId", "dueDate");

-- CreateIndex
CREATE INDEX "TrainingRecord_orgId_idx" ON "TrainingRecord"("orgId");

-- CreateIndex
CREATE INDEX "TrainingRecord_orgId_siteId_idx" ON "TrainingRecord"("orgId", "siteId");

-- CreateIndex
CREATE INDEX "TrainingRecord_orgId_expiryDate_idx" ON "TrainingRecord"("orgId", "expiryDate");

-- CreateIndex
CREATE INDEX "AuditLogEntry_orgId_idx" ON "AuditLogEntry"("orgId");

-- CreateIndex
CREATE INDEX "AuditLogEntry_orgId_entityType_entityId_idx" ON "AuditLogEntry"("orgId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLogEntry_userId_idx" ON "AuditLogEntry"("userId");

-- CreateIndex
CREATE INDEX "Notification_orgId_idx" ON "Notification"("orgId");

-- CreateIndex
CREATE INDEX "Notification_orgId_userId_readStatus_idx" ON "Notification"("orgId", "userId", "readStatus");

-- CreateIndex
CREATE INDEX "DataProcessingAgreement_orgId_idx" ON "DataProcessingAgreement"("orgId");

-- CreateIndex
CREATE INDEX "RegClauseTag_orgId_entityType_entityId_idx" ON "RegClauseTag"("orgId", "entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "RegClauseTag_entityType_entityId_regSubClauseId_key" ON "RegClauseTag"("entityType", "entityId", "regSubClauseId");

-- CreateIndex
CREATE INDEX "CQCKeyQuestionTag_orgId_entityType_entityId_idx" ON "CQCKeyQuestionTag"("orgId", "entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "CQCKeyQuestionTag_entityType_entityId_cqcKeyQuestionId_key" ON "CQCKeyQuestionTag"("entityType", "entityId", "cqcKeyQuestionId");

-- CreateIndex
CREATE INDEX "SixPillarTag_orgId_entityType_entityId_idx" ON "SixPillarTag"("orgId", "entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "SixPillarTag_entityType_entityId_sixPillarId_key" ON "SixPillarTag"("entityType", "entityId", "sixPillarId");

-- CreateIndex
CREATE INDEX "Attachment_orgId_entityType_entityId_idx" ON "Attachment"("orgId", "entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- AddForeignKey
ALTER TABLE "Site" ADD CONSTRAINT "Site_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSite" ADD CONSTRAINT "UserSite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSite" ADD CONSTRAINT "UserSite_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Audit" ADD CONSTRAINT "Audit_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Audit" ADD CONSTRAINT "Audit_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Audit" ADD CONSTRAINT "Audit_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Audit" ADD CONSTRAINT "Audit_sixPillarId_fkey" FOREIGN KEY ("sixPillarId") REFERENCES "SixPillar"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Audit" ADD CONSTRAINT "Audit_supersededById_fkey" FOREIGN KEY ("supersededById") REFERENCES "Audit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_supersededById_fkey" FOREIGN KEY ("supersededById") REFERENCES "Incident"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskEntry" ADD CONSTRAINT "RiskEntry_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskEntry" ADD CONSTRAINT "RiskEntry_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskEntry" ADD CONSTRAINT "RiskEntry_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskEntry" ADD CONSTRAINT "RiskEntry_supersededById_fkey" FOREIGN KEY ("supersededById") REFERENCES "RiskEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Policy" ADD CONSTRAINT "Policy_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Policy" ADD CONSTRAINT "Policy_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Policy" ADD CONSTRAINT "Policy_supersededById_fkey" FOREIGN KEY ("supersededById") REFERENCES "Policy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackComplaint" ADD CONSTRAINT "FeedbackComplaint_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackComplaint" ADD CONSTRAINT "FeedbackComplaint_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notice" ADD CONSTRAINT "Notice_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notice" ADD CONSTRAINT "Notice_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notice" ADD CONSTRAINT "Notice_postedById_fkey" FOREIGN KEY ("postedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoticeAcknowledgement" ADD CONSTRAINT "NoticeAcknowledgement_noticeId_fkey" FOREIGN KEY ("noticeId") REFERENCES "Notice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoticeAcknowledgement" ADD CONSTRAINT "NoticeAcknowledgement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReadinessScore" ADD CONSTRAINT "ReadinessScore_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReadinessScore" ADD CONSTRAINT "ReadinessScore_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarTask" ADD CONSTRAINT "CalendarTask_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarTask" ADD CONSTRAINT "CalendarTask_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarTask" ADD CONSTRAINT "CalendarTask_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingRecord" ADD CONSTRAINT "TrainingRecord_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingRecord" ADD CONSTRAINT "TrainingRecord_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingRecord" ADD CONSTRAINT "TrainingRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLogEntry" ADD CONSTRAINT "AuditLogEntry_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organisation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLogEntry" ADD CONSTRAINT "AuditLogEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataProcessingAgreement" ADD CONSTRAINT "DataProcessingAgreement_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataProcessingAgreement" ADD CONSTRAINT "DataProcessingAgreement_signedById_fkey" FOREIGN KEY ("signedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegClauseTag" ADD CONSTRAINT "RegClauseTag_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegClauseTag" ADD CONSTRAINT "RegClauseTag_regSubClauseId_fkey" FOREIGN KEY ("regSubClauseId") REFERENCES "RegulatorySubClause"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegClauseTag" ADD CONSTRAINT "RegClauseTag_taggedById_fkey" FOREIGN KEY ("taggedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CQCKeyQuestionTag" ADD CONSTRAINT "CQCKeyQuestionTag_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CQCKeyQuestionTag" ADD CONSTRAINT "CQCKeyQuestionTag_cqcKeyQuestionId_fkey" FOREIGN KEY ("cqcKeyQuestionId") REFERENCES "CQCKeyQuestion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CQCKeyQuestionTag" ADD CONSTRAINT "CQCKeyQuestionTag_taggedById_fkey" FOREIGN KEY ("taggedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SixPillarTag" ADD CONSTRAINT "SixPillarTag_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SixPillarTag" ADD CONSTRAINT "SixPillarTag_sixPillarId_fkey" FOREIGN KEY ("sixPillarId") REFERENCES "SixPillar"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SixPillarTag" ADD CONSTRAINT "SixPillarTag_taggedById_fkey" FOREIGN KEY ("taggedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
