# Product Requirements Document (PRD)

## Product Name
MarkdownHub (working name)

## Document Info
- Version: 1.0
- Date: 2026-02-22
- Owner: Product Team
- Status: Draft

## 1. Overview
MarkdownHub is a web platform for uploading, organizing, searching, and browsing Markdown (`.md`) documents.
The frontend uses Vue.js, and the backend uses Node.js APIs to handle file upload, metadata, permissions, and document retrieval.

The product is designed to be AI-friendly from day one, so AI agents can safely and reliably discover, read, update, and manage documents through stable APIs.

## 2. Goals
1. Provide a fast and clean Markdown browsing experience for human users.
2. Enable easy upload and management of Markdown files.
3. Offer version-aware document management with history.
4. Expose predictable APIs and metadata that AI agents can consume with minimal custom logic.
5. Support secure, auditable machine access.

## 3. Non-Goals (MVP)
1. Real-time collaborative editing (Google Docs style).
2. Complex WYSIWYG editor.
3. Multi-format document conversion beyond Markdown.
4. Fine-grained enterprise governance policies.

## 4. Target Users
1. Content Managers: upload and maintain documentation.
2. Readers: browse and search docs quickly.
3. Admins: control users, permissions, and system settings.
4. AI Agents: ingest docs, query content, and perform automated document operations.

## 5. Core Use Cases
1. User uploads one or multiple `.md` files.
2. User browses documents by folder/tag/project.
3. User searches by title, tags, and full-text.
4. User views rendered Markdown with table of contents.
5. User updates a document and sees version history.
6. AI agent fetches machine-readable document metadata and content chunks.
7. AI agent performs safe write operations with idempotency and audit logs.

## 6. Functional Requirements

### 6.1 Frontend (Vue.js)
1. Responsive UI for desktop and mobile.
2. Document list with pagination, filters, and sorting.
3. Markdown viewer with syntax highlighting and anchor links.
4. Upload UI with drag-and-drop and progress status.
5. Metadata editor (title, tags, description, project, visibility).
6. Version history panel (view, compare, rollback).
7. API token management page (for machine clients).

### 6.2 Backend (Node.js API)
1. RESTful JSON API for all CRUD operations.
2. File upload endpoint for `.md` documents.
3. Markdown parse/render service with sanitization.
4. Search endpoint (title, tags, full-text).
5. Versioning support with immutable version records.
6. Role-based access control (Admin, Editor, Viewer, Agent).
7. Audit logging for reads/writes and admin actions.

### 6.3 AI-Friendly Requirements
1. Publish OpenAPI spec and keep endpoints stable by version (`/api/v1`).
2. Every resource has a stable unique ID and timestamps (`created_at`, `updated_at`, `version`).
3. Include machine-readable metadata in responses (tags, project, checksum, token_count_estimate).
4. Add chunked content endpoints for LLM retrieval (`/documents/:id/chunks`).
5. Support deterministic pagination and sorting.
6. Support idempotency keys for write endpoints.
7. Provide webhook events for document lifecycle changes.
8. Return structured error objects with code, message, and remediation hint.
9. Provide optional raw Markdown and rendered HTML in one response (via query flags).
10. Add `ETag` or content hash for caching and sync safety.

## 7. API Requirements (MVP)
1. `POST /api/v1/documents/upload`
2. `GET /api/v1/documents`
3. `GET /api/v1/documents/:id`
4. `PUT /api/v1/documents/:id`
5. `DELETE /api/v1/documents/:id`
6. `GET /api/v1/documents/:id/versions`
7. `POST /api/v1/documents/:id/rollback`
8. `GET /api/v1/search?q=...`
9. `GET /api/v1/documents/:id/chunks`
10. `POST /api/v1/agents/tokens`
11. `GET /api/v1/audit-logs`

## 8. Data Model (High Level)

### 8.1 Document
- `id` (UUID)
- `title`
- `slug`
- `content_md`
- `content_html`
- `tags[]`
- `project`
- `visibility` (`private|team|public`)
- `created_by`
- `created_at`
- `updated_at`
- `latest_version`
- `checksum`

### 8.2 DocumentVersion
- `id` (UUID)
- `document_id`
- `version_number`
- `content_md`
- `change_note`
- `created_by`
- `created_at`
- `checksum`

### 8.3 AgentToken
- `id` (UUID)
- `name`
- `token_prefix`
- `role`
- `scopes[]`
- `expires_at`
- `created_at`
- `last_used_at`

## 9. Non-Functional Requirements
1. Performance: document list API p95 under 400 ms at MVP scale.
2. Availability: 99.9% monthly uptime target.
3. Security: enforce authn/authz, sanitize Markdown, rate-limit APIs.
4. Reliability: no data loss for committed versions.
5. Observability: logs, metrics, and trace IDs in API responses.
6. Compatibility: latest 2 versions of major desktop/mobile browsers.

## 10. Security and Compliance
1. JWT or session-based auth for users.
2. Scoped API tokens for AI agents.
3. Encrypt data in transit (HTTPS) and at rest.
4. Sanitize rendered HTML to prevent XSS.
5. Record immutable audit logs for sensitive operations.
6. Configurable retention and soft-delete policy.

## 11. UX Requirements
1. First meaningful paint under 2 seconds on normal broadband.
2. Empty states with clear actions (upload first doc, create tag, etc.).
3. Error messages should include actionable next step.
4. Keyboard-friendly navigation for document browsing.
5. Clear indicator for latest version and draft status.

## 12. Success Metrics
1. Time to first uploaded document under 3 minutes.
2. 90%+ successful uploads.
3. Search-to-open conversion rate above 60%.
4. API success rate above 99%.
5. AI agent task completion rate (document read/update workflows) above 95%.

## 13. MVP Milestones
1. Week 1-2: Project setup, auth, base schema, upload endpoint.
2. Week 3-4: Document list/detail UI, render pipeline, CRUD APIs.
3. Week 5: Search and tagging.
4. Week 6: Version history and rollback.
5. Week 7: AI-friendly APIs (chunks, idempotency, token scopes, OpenAPI).
6. Week 8: Hardening, observability, QA, launch.

## 14. Risks and Mitigations
1. Risk: unsafe Markdown rendering.
   Mitigation: strict sanitization library and CSP headers.
2. Risk: API drift breaks AI agents.
   Mitigation: versioned APIs and backward-compatibility tests.
3. Risk: large files degrade performance.
   Mitigation: file size limits, async processing, pagination/chunking.
4. Risk: unauthorized agent actions.
   Mitigation: scoped tokens, short expiry, audit logs, rate limits.

## 15. Acceptance Criteria (MVP)
1. User can upload, browse, search, read, update, and delete Markdown docs.
2. Every update creates a retrievable version history item.
3. AI agent can authenticate with scoped token and perform read/write operations through stable API.
4. API responses include machine-usable metadata and consistent error formats.
5. Audit logs capture all write operations from users and agents.

## 16. Future Enhancements
1. Semantic search and vector indexing.
2. AI-generated summaries and document Q&A.
3. Workflow approvals for publication.
4. Team collaboration with comments and mentions.
5. MCP-compatible tool server for agent ecosystems.

