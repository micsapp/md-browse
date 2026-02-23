# MarkdownHub Architecture

## 1. Purpose
This document defines the technical architecture for MarkdownHub, a Vue.js + Node.js platform for Markdown document upload, browsing, search, versioning, and AI-agent interaction.

## 2. System Overview

### 2.1 Core Components
1. Web App (`Vue.js`)
2. API Service (`Node.js`, REST, `/api/v1`)
3. Relational Database (`PostgreSQL`)
4. Object Storage (Markdown file blobs, optional rendered cache)
5. Search Index (Postgres FTS for MVP; dedicated engine later)
6. Background Worker (async jobs: chunking, indexing, webhook dispatch)
7. Auth + Token Service (user JWT/session, scoped agent tokens)
8. Observability Stack (logs, metrics, traces)

### 2.2 High-Level Flow
1. User uploads Markdown file from Vue app.
2. API validates auth, file type, and size.
3. API stores raw content and metadata, creates `Document` + `DocumentVersion`.
4. Worker processes content: sanitize render, chunk generation, token estimate, search indexing.
5. UI and agents fetch document list/details/chunks through versioned APIs.
6. Every write action is recorded in immutable audit logs.

## 3. Frontend Architecture (Vue.js)

### 3.1 App Modules
1. Auth and session management
2. Document list and filters
3. Document detail + rendered markdown view
4. Upload and metadata editor
5. Version history and rollback
6. Token management and audit views

### 3.2 State and Data
1. Use a centralized store for auth, filters, and pagination.
2. Use API client wrappers for consistent error parsing and retry behavior.
3. Cache list responses with short TTL; revalidate on writes.

### 3.3 Rendering Strategy
1. Server renders/sanitizes markdown for consistency.
2. Client displays trusted rendered HTML plus optional raw markdown viewer.
3. Linkable headings and table-of-contents are generated from parsed headings.

## 4. Backend Architecture (Node.js)

### 4.1 API Layer
1. Versioned routes: `/api/v1/*`
2. Input validation via schema middleware.
3. Auth middleware supports:
   - user bearer JWT/session
   - `X-Agent-Token` with scopes
4. Standard response envelope for errors (`code`, `message`, `hint`, `request_id`).

### 4.2 Service Layer
1. Document service: CRUD, metadata, soft delete.
2. Version service: immutable versions, rollback creation.
3. Search service: keyword and metadata filters.
4. Chunking service: deterministic chunk boundaries by heading + token budget.
5. Audit service: append-only action logs.
6. Webhook service: lifecycle events for integrations.

### 4.3 Worker Layer
1. Triggered jobs:
   - markdown render/sanitize
   - chunk generation
   - search reindex
   - webhook delivery with retry
2. Queue-backed retries with dead-letter handling.

## 5. Data Architecture

### 5.1 Primary Entities
1. `documents`
2. `document_versions`
3. `agent_tokens`
4. `audit_logs`
5. `webhook_subscriptions` (optional in MVP if outbound events are included)

### 5.2 Storage Decisions (MVP)
1. PostgreSQL stores metadata, versions, and full markdown text.
2. Object storage is optional in MVP; recommended for large files and scale-out.
3. Checksums (`sha256`) on each version enable cache and sync integrity checks.

### 5.3 Search
1. MVP: Postgres full-text index on title/content/tags.
2. Future: hybrid semantic + keyword retrieval with vector index.

## 6. AI-Agent-Friendly Architecture

### 6.1 Contract Stability
1. API versioning and backward compatibility policy.
2. Stable UUID identifiers and deterministic sorting/pagination.
3. OpenAPI contract as source of truth.

### 6.2 Machine-Optimized Retrieval
1. `/documents/:id/chunks` returns chunk index, line ranges, token estimates.
2. Metadata includes checksum and `updated_at` for sync decisions.
3. Optional `include_raw` and `include_rendered` flags reduce round trips.

### 6.3 Safe Automation
1. Idempotency keys on mutating endpoints.
2. Scoped agent tokens with least privilege.
3. Audit trail includes actor type (`user` or `agent`) and request identifiers.

## 7. Security Architecture
1. HTTPS everywhere; HSTS in production.
2. Sanitized markdown rendering to prevent XSS.
3. Role-based authorization: Admin, Editor, Viewer, Agent.
4. Rate limiting per user/token/IP.
5. Short-lived tokens and token rotation support.
6. Secrets in environment or secret manager, never in source.

## 8. Observability and Operations
1. Structured logs with `request_id`.
2. Metrics:
   - API latency by endpoint
   - upload success/failure
   - search latency
   - queue depth/retry counts
3. Tracing across API -> DB -> worker pipeline.
4. Dashboards for p95 latency, error rates, and worker health.
5. Alerts for elevated error rate, job backlog, and auth anomalies.

## 9. Deployment Topology
1. Web app served via CDN + edge cache.
2. API and workers in containers behind load balancer.
3. Managed PostgreSQL with daily backups and PITR.
4. Separate environments: `dev`, `staging`, `prod`.
5. Blue/green or rolling deploy with health checks.

## 10. Scalability Plan
1. Horizontal scale API stateless instances.
2. Async heavy post-processing in workers.
3. Cache frequently accessed document metadata.
4. Partition audit logs by date at scale.
5. Move to dedicated search infrastructure when query load grows.

## 11. Failure Modes and Recovery
1. Upload accepted but processing fails:
   - status marked `processing_failed`
   - retry with backoff
2. Webhook destination unavailable:
   - retry then dead-letter
3. DB connectivity issue:
   - fail fast, return structured 503
4. Corrupt markdown payload:
   - reject with validation error and hint

## 12. Engineering Standards
1. API-first development with OpenAPI.
2. Contract tests for endpoints and error shapes.
3. Migration-based schema changes only.
4. Lint/test gates in CI for frontend, backend, and API schema.
5. Audit log assertions for every mutating endpoint.

## 13. Recommended Initial Stack
1. Frontend: Vue 3 + Vite + Pinia + Vue Router
2. Backend: Node.js + Fastify/Express + Zod/Joi validation
3. Database: PostgreSQL
4. Queue: BullMQ + Redis (or cloud queue alternative)
5. Rendering: `markdown-it` + HTML sanitizer
6. Auth: JWT + refresh strategy, hashed agent tokens

