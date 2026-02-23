# MarkdownHub MVP Task Breakdown

## 1. Scope
Execution plan for MVP delivery of MarkdownHub based on `PRD.md` and `openapi.yaml`.

## 2. Assumptions
1. Timeline target: 8 weeks.
2. Team: 1 frontend engineer, 1 backend engineer, 1 full-stack engineer, 1 QA (part-time).
3. Deployment target: cloud container environment with managed Postgres.

## 3. Definition of Done (MVP)
1. Core user flows work end-to-end: upload, browse, search, read, update, delete.
2. Version history and rollback are available and tested.
3. AI-agent flows are functional with scoped tokens, chunks endpoint, idempotent writes.
4. OpenAPI contract is implemented and passing contract tests.
5. Monitoring, audit logging, and security baseline are active in staging and prod.

## 4. Workstreams and Tasks

## 4.1 Foundation (Week 1-2)
- [ ] Initialize monorepo/project structure (`frontend`, `backend`, `shared`).
- [ ] Configure CI pipeline (lint, unit test, API schema validation).
- [ ] Set up environment config and secret handling.
- [ ] Provision PostgreSQL and create initial schema migrations.
- [ ] Implement health endpoints and base logging with `request_id`.
- [ ] Create auth skeleton (user login/session or JWT middleware).

Acceptance:
- [ ] CI runs automatically on PRs.
- [ ] Backend service starts with database migration applied.
- [ ] Basic authenticated request path works.

## 4.2 Document APIs (Week 2-4)
- [ ] Implement `POST /api/v1/documents/upload` with `.md` validation and size limits.
- [ ] Implement `GET /api/v1/documents` with filtering, sorting, pagination.
- [ ] Implement `GET /api/v1/documents/:id` with `include_raw` and `include_rendered`.
- [ ] Implement `PUT /api/v1/documents/:id` with idempotency support.
- [ ] Implement `DELETE /api/v1/documents/:id` as soft delete.
- [ ] Add checksum generation and ETag support.
- [ ] Add consistent structured error responses.

Acceptance:
- [ ] All document CRUD endpoints pass contract tests.
- [ ] Pagination and sorting are deterministic.
- [ ] Duplicate idempotency keys do not create duplicate writes.

## 4.3 Versioning + Rollback (Week 4-6)
- [ ] Create `document_versions` write path on every update.
- [ ] Implement `GET /api/v1/documents/:id/versions`.
- [ ] Implement `POST /api/v1/documents/:id/rollback` creating a new version.
- [ ] Add DB indexes for version retrieval performance.

Acceptance:
- [ ] Every document update writes an immutable version row.
- [ ] Rollback restores target content via new latest version.

## 4.4 Search + Chunks (Week 5-7)
- [ ] Implement `GET /api/v1/search?q=...` using Postgres FTS.
- [ ] Implement chunking service and `GET /api/v1/documents/:id/chunks`.
- [ ] Add token estimate metadata and line-range mapping for chunks.
- [ ] Reindex workflow after document updates.

Acceptance:
- [ ] Search returns relevant results across title, tags, and content.
- [ ] Chunks endpoint returns deterministic order and metadata.

## 4.5 Agent Auth + Audit (Week 6-7)
- [ ] Implement `POST /api/v1/agents/tokens` (scoped token creation).
- [ ] Implement token verification middleware for `X-Agent-Token`.
- [ ] Implement append-only `audit_logs`.
- [ ] Implement `GET /api/v1/audit-logs` with filters.
- [ ] Record actor type and request ID for all writes.

Acceptance:
- [ ] Agent token scopes are enforced.
- [ ] All mutating calls produce audit records.

## 4.6 Frontend UX (Week 3-7, parallel)
- [ ] Build auth pages and protected routes.
- [ ] Build document list page with filters/sort/pagination.
- [ ] Build upload flow with progress and error states.
- [ ] Build document detail view with rendered markdown and TOC.
- [ ] Build metadata edit UI and save workflow.
- [ ] Build version history UI and rollback action.
- [ ] Build token management and audit log pages for admins.

Acceptance:
- [ ] Core flows are usable on desktop and mobile.
- [ ] Error states are actionable and understandable.

## 4.7 Hardening + Release (Week 7-8)
- [ ] Add rate limiting and security headers.
- [ ] Add markdown sanitization policy tests (XSS cases).
- [ ] Complete integration and regression test suite.
- [ ] Run load test for list/search/upload critical paths.
- [ ] Prepare runbook, backup/restore verification, and launch checklist.

Acceptance:
- [ ] Performance meets MVP baseline (list API p95 < 400 ms at target load).
- [ ] No critical/high vulnerabilities open at launch.

## 5. Test Strategy
1. Unit tests:
   - markdown parser/sanitizer behavior
   - auth/scope checks
   - idempotency key behavior
2. Integration tests:
   - upload->view->update->version->rollback flow
   - search and chunks consistency
3. Contract tests:
   - all endpoints against `openapi.yaml`
4. E2E tests:
   - frontend core user journeys
5. Security tests:
   - XSS payload rendering
   - permission boundary checks

## 6. Priority Backlog (If Time is Tight)
1. Must-have:
   - document CRUD
   - versioning and rollback
   - search
   - agent tokens + chunks
   - audit logs
2. Should-have:
   - webhook events
   - advanced filtering and sorting UI polish
3. Could-have:
   - draft/publish workflow
   - semantic search prototype

## 7. Risks and Countermeasures
1. Risk: schema churn slows API implementation.
   Countermeasure: freeze `openapi.yaml` for MVP and require change review.
2. Risk: worker queue complexity delays launch.
   Countermeasure: start with synchronous render/chunk path for small files, then async optimize.
3. Risk: security edge cases in markdown rendering.
   Countermeasure: use hardened sanitizer config and explicit adversarial tests.

## 8. Launch Checklist
- [ ] All acceptance criteria in `PRD.md` met.
- [ ] Staging sign-off completed by engineering + QA.
- [ ] Production migrations and rollback plan tested.
- [ ] Dashboards and alerts active.
- [ ] API docs published and accessible to clients/agents.

