# MD Browse - Markdown Document Browsing Site

A markdown document browsing site built with Vue.js (Nuxt 3) frontend and Node.js (Express) backend.

## Features

- User authentication (register/login)
- Markdown file upload with frontmatter support
- Full-text search across documents
- Syntax highlighting for code blocks
- Categories and tags organization
- Document editing and deletion

## Project Structure

```
md-browse/
├── backend/          # Express.js API server
│   ├── server.js     # Main server file
│   └── package.json
├── frontend/         # Nuxt.js frontend
│   ├── pages/        # Vue pages
│   ├── composables/  # Reusable logic
│   ├── middleware/   # Auth middleware
│   └── nuxt.config.ts
└── docs/             # Markdown files storage
```

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn

### Backend Setup

```bash
cd backend
npm install
npm run dev
```

The API will run on http://localhost:3001

### Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

The frontend will run on http://localhost:3000

## API Endpoints

### Auth
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login
- `GET /api/auth/me` - Get current user

### Documents
- `GET /api/documents` - List documents (supports ?category=, ?tag=, ?search=)
- `GET /api/documents/:id` - Get single document
- `POST /api/documents` - Upload document (requires auth)
- `PUT /api/documents/:id` - Update document (requires auth)
- `DELETE /api/documents/:id` - Delete document (requires auth)

### Categories & Tags
- `GET /api/categories` - List all categories
- `GET /api/tags` - List all tags
- `GET /api/search?q=query` - Full-text search

## Markdown Frontmatter

You can include YAML frontmatter in your markdown files:

```markdown
---
title: My Document
description: A brief description
category: tutorial
tags: [vue, javascript, frontend]
---

# Content starts here
```

## Environment Variables

### Backend
- `PORT` - Server port (default: 3001)
- `JWT_SECRET` - JWT signing secret

### Frontend
- `NUXT_PUBLIC_API_BASE` - Backend API URL (default: http://localhost:3001/api)

## Tech Stack

- **Frontend**: Nuxt 3, Vue 3, marked, highlight.js, DOMPurify
- **Backend**: Express.js, multer, jsonwebtoken, bcryptjs, gray-matter

## Production Deployment

### Prerequisites

- Node.js 18+
- PM2 (`npm install -g pm2`)
- Nginx

### Deploy

```bash
# Copy environment file and edit as needed
cp .env.example .env

# Full deploy (install deps, build, deploy backend, setup nginx)
./deploy.sh

# Or run individual steps:
./deploy.sh install   # Install dependencies
./deploy.sh build     # Build frontend
./deploy.sh backend   # Deploy backend with PM2
./deploy.sh nginx     # Setup nginx config
```

### Management Commands

```bash
./deploy.sh status    # Show deployment status
./deploy.sh logs      # View backend logs
./deploy.sh restart   # Restart services
./deploy.sh stop      # Stop backend
```

### URLs after deployment

- Frontend: http://localhost/
- Backend API: http://localhost/api
