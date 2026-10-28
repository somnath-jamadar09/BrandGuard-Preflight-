# BrandGuard Preflight 🛡️

> **Evidence-Bound Pre-Publication Governance & Truth Verification Platform**  
> *Codex 48 Hackathon (Inkloom AI) — 40-Hour Sprint*

---

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-4.19-000000?logo=express&logoColor=white)](https://expressjs.com/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-8.3-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![Python](https://img.shields.io/badge/Python-3.11%2B-3776AB?logo=python&logoColor=white)](https://python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.110-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![MongoDB](https://img.shields.io/badge/MongoDB-7.0-47A248?logo=mongodb&logoColor=white)](https://mongodb.com/)
[![MinIO](https://img.shields.io/badge/MinIO-S3--Compatible-C72C48?logo=minio&logoColor=white)](https://min.io/)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)](https://docker.com/)
[![WCAG 2.2](https://img.shields.io/badge/Accessibility-WCAG%202.2%20AA-blueviolet)](https://www.w3.org/WAI/standards-guidelines/wcag/)

---

## 📖 Executive Summary

**BrandGuard Preflight** is an AI-assisted brand governance and content truth engine that checks draft collateral *before* it reaches the public.

Instead of vaguely critiquing style or tone, Preflight validates **what content actually says** against the company's verified truth repository:
* Approved brand guidelines
* Verified institutional facts & pricing sheets
* Historical published content and prior brand rulings

### Core Principles
1. **Evidence First**: Every finding is backed by an exact, cited passage from an approved company source with page numbers, version tags, and expiry timestamps.
2. **Preserve Creator Intent (Intent Lock)**: Remediation preserves the writer's underlying message, ensuring Core Must-Say elements remain intact while fixing false or outdated claims.
3. **Human in the Loop**: When a claim is provably contradicted, proof and rewrite suggestions are surfaced. When evidence is ambiguous, the system routes the decision to the appropriate human reviewer.
4. **Tamper-Evident Provenance**: Approved content generates a cryptographically signed, immutable **SHA-256 Brand Passport**.

---

## 🏛️ System Architecture

BrandGuard Preflight follows a strict three-layer architecture. **The browser never communicates directly with the ML service.**

```
+---------------------------------------------------------------------------------------+
|                                    BROWSER LAYER                                      |
|                             React 19 + Vite (Dark Mode)                               |
|   [Draft Submission]  [Intent Lock Form]  [Evidence Cards]  [Live Diff Review Panel]   |
|   [Workflow Sign-off] [Knowledge Base]    [Brand Passport]  [AI Disclosure Notice]    |
+---------------------------------------------------------------------------------------+
                                           │
                         HTTPS / REST API (OpenAPI 3.1 Contract)
                                           ▼
+---------------------------------------------------------------------------------------+
|                                  BACKEND API LAYER                                    |
|                             Node.js + Express (/v1/*)                                 |
|   [JWT Auth & RBAC]         [Tenant Isolation]           [Redaction Gateway]          |
|   [ML Orchestration Engine] [Brand Passport Builder]     [Append-Only Audit Log]      |
|   [Shelf-Life Scheduler]    [Insight & Drift Analytics]  [Version History Manager]    |
+---------------------------------------------------------------------------------------+
                 │                                │                                │
                 ▼                                ▼                                ▼
  +────────────────────────────+   +────────────────────────────+   +────────────────────────────+
  |      MongoDB 7.0           |   |       MinIO Object Store   |   |   Python ML Service        |
  |  - Organizations & Users   |   |  - S3-compatible storage   |   |  FastAPI / Uvicorn         |
  |  - Sources & Passages      |   |  - Uploaded source assets  |   |  - /extract-claims         |
  |  - Facts & Drafts          |   |  - Draft attachments       |   |  - /match (NLI engine)     |
  |  - Findings & Passports    |   |  - Encrypted at rest       |   |  - /rewrite                |
  |  - Immutable AuditLog      |   |                            |   |  - /premortem              |
  +────────────────────────────+   +────────────────────────────+   +────────────────────────────+
```

---

## 🚀 Key Features

* **🔍 Automated Claim Extraction & NLI Checking**: Automatically isolates factual claims, comparison superlatives, and product metrics; evaluates them against source passages for *Contradiction*, *Outdatedness*, or *Support*.
* **🔒 Intent-Lock Remediation**: Authors declare target audience, purpose, and *Must-Say* statements. AI rewrites resolve factual errors while guaranteeing no essential messaging is dropped.
* **⏳ Claim Shelf-Life & Source Expiration**: Automated background cron monitors fact expiration dates and alerts knowledge base owners 30 days before guidelines expire.
* **🛡️ Redaction Gateway & Confidentiality Tripwires**: Masks sensitive and embargoed terms with `[REDACTED]` prior to external LLM calls, blocking unreleased product leaks.
* **📜 Cryptographic Brand Passport**: Computes a SHA-256 tamper-evident digital certificate recording checks executed, rule versions, human approvers, and AI disclosure statements.
* **👥 Role-Based Portals (RBAC)**: Tailored operational views for Creators, Brand Managers, Knowledge Owners, Compliance Auditors, and Admins.
* **📊 Insights & Brand Pre-Mortem**: Aggregates top recurring policy violations, detects guideline conflicts, and predicts public relations risks before release.

---

## 👥 Role Permissions Matrix (RBAC)

| Feature / Workspace | Creator | Manager | Knowledge Owner | Auditor / Viewer | Admin |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Draft Submission (`/drafts/new`)** | ✅ Create | ❌ | ❌ | ❌ | ✅ Full |
| **Preflight Review (`/drafts/:id/review`)** | ✅ Fix / Edit | 👁️ Inspect | 👁️ Read-only | 👁️ Read-only | ✅ Full |
| **Workflow Sign-off (`/drafts/:id/workflow`)** | 💬 Comment | ✅ Sign-off | 💬 Comment | 👁️ View-only | ✅ Full |
| **Knowledge Base (`/knowledge-base`)** | 👁️ Read-only | 👁️ Read-only | ✅ Ingest & Manage | 👁️ Read-only | ✅ Full |
| **Brand Passport (`/passports/:id`)** | 👁️ View | ✅ Issue & Verify | 👁️ View | 🔍 Verify | ✅ Full |
| **Audit Logs & Redaction Engine** | ❌ | 📊 Summary | ❌ | 📤 Export | ✅ Full |

---

## 📂 Repository Structure

```
BrandGuard-Preflight-/
├── backend/                   # Node.js + Express API server
│   ├── src/
│   │   ├── middleware/        # JWT auth, RBAC, tenant isolation, redaction, upload scan
│   │   ├── models/            # Mongoose schemas (Draft, Finding, Passport, Source, AuditLog...)
│   │   ├── routes/            # REST API controllers (/v1/drafts, /v1/sources, /v1/facts...)
│   │   ├── services/          # ML orchestrator, passportBuilder, shelfLifeScheduler
│   │   ├── utils/             # Database, MinIO, hash, and crypto helpers
│   │   └── server.js          # Express app bootstrap & route registration
│   ├── tests/                 # Node test suite (RBAC, redaction, audit log, passports)
│   └── package.json
│
├── frontend/                  # React 19 + Vite web application
│   ├── src/
│   │   ├── api/               # Axios HTTP client with JWT interceptor
│   │   ├── components/        # UI components (EvidenceCard, DiffViewer, Sidebar, TopBar)
│   │   ├── context/           # AuthContext and OrgContext state providers
│   │   ├── pages/             # Route pages (Dashboard, DraftSubmit, Review, Workflow, KB)
│   │   ├── index.css          # Design system tokens & dark mode theme
│   │   └── App.jsx            # Router and layout integration
│   └── package.json
│
├── ml_service/                # Python FastAPI machine learning service
│   ├── app/
│   │   ├── schemas/           # Pydantic input/output schemas
│   │   ├── models/            # Claim extraction, NLI matchers, and rewrite engines
│   │   └── main.py            # FastAPI service endpoints
│   ├── requirements.txt
│   └── Dockerfile
│
├── docs/                      # Complete technical & product specifications
│   ├── PRD.md                 # Product Requirements Document
│   ├── SDD.md                 # System Design Document
│   ├── UI.md                  # Comprehensive UI & Layout Specifications
│   ├── Architectural_Blueprint.md
│   └── Implementation_Roadmap.md
│
├── docker-compose.yml         # Full multi-container orchestration
├── openapi.yaml               # OpenAPI 3.1 REST API specification
├── integration_test.js        # End-to-end integration test scenario
└── .env.example               # Environment configuration template
```

---

## ⚡ Quickstart

### Option 1: Docker Compose (Recommended)

Run the complete multi-service stack with a single command:

```bash
# 1. Clone the repository
git clone https://github.com/Omiiii04/BrandGuard-Preflight-.git
cd BrandGuard-Preflight-

# 2. Configure environment
cp .env.example .env

# 3. Generate strong secrets and paste each result into .env
openssl rand -hex 32  # ML_INTERNAL_TOKEN
openssl rand -hex 64  # JWT_SECRET

# 4. Launch all containers (Compose refuses empty secrets)
docker compose up --build -d
```

On Windows PowerShell, run the repository setup helper instead of manually copying secrets:

```powershell
.\scripts\setup-env.ps1
docker compose config --quiet
docker compose up --build -d
```

The helper creates `.env` if it is missing, generates strong `ML_INTERNAL_TOKEN` and `JWT_SECRET` values when needed, preserves other settings, and never prints the generated secret values.

#### End-to-end verification (Windows)

Run this single command from the repository root:

```powershell
.\scripts\verify-local.ps1
```

It creates or repairs local secrets without printing them, installs the backend test dependencies if needed, builds and starts the stack, runs the source-upload/draft-review integration test, restarts the ML service, and verifies that indexed evidence is still available afterward. It leaves the services running and does not delete Docker volumes. If verification fails, it saves Compose logs under your Windows temporary directory.

#### Running Service Endpoints

| Service | Port | Endpoint URL | Description |
| :--- | :---: | :--- | :--- |
| **Frontend Web** | `3000` | [http://localhost:3000](http://localhost:3000) | React Web Application |
| **Backend API** | `4000` | [http://localhost:4000](http://localhost:4000) | Express REST API (`/health`, `/v1/*`) |
| **ML Engine** | `8000` | [http://localhost:8000](http://localhost:8000) | FastAPI ML Service (`/docs`) |
| **MinIO Console** | `9001` | [http://localhost:9001](http://localhost:9001) | S3-compatible object storage console |
| **MongoDB** | `27017` | `mongodb://localhost:27017` | Document Database |

The ML Engine binds to loopback (`127.0.0.1:8000`) for local diagnostics and is not published to the LAN. All non-health ML POST endpoints require the backend-to-ML `X-ML-Internal-Token` header; do not expose this service publicly.

---

### Option 2: Local Development Setup

#### Prerequisites
* Node.js v18+ & npm
* Python 3.11+
* Running MongoDB instance (`localhost:27017`)
* Running MinIO instance (`localhost:9000`)

#### 1. Backend Service
```bash
cd backend
npm install
npm run seed # Seeds demo organisations, users, sources, and drafts (entry point: backend/seed.js; root seed.js forwards here)
npm run dev
# Server listening on http://localhost:4000
```

#### 2. ML Service
```bash
cd ml_service
python -m venv venv
# Windows:
.\venv\Scripts\activate
# Linux/macOS:
source venv/bin/activate

pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
# ML Service listening on http://localhost:8000
```

#### 3. Frontend Web Client
```bash
cd frontend
npm install
npm run dev
# Frontend accessible at http://localhost:5173 (or configured Vite port)
```

---

## 🧪 Testing & Validation

### 1. End-to-End Integration Suite
Executes the full Stellara Brands returns-policy audit scenario (verifying claim extraction, passage retrieval, NLI contradiction detection, finding creation, and summary card generation):

```bash
node integration_test.js
```

### 2. Backend Unit & Security Tests
Covers RBAC enforcement, redaction gateway masking, SHA-256 passport cryptography, and tenant isolation:

```bash
cd backend
npm test
```

### 3. Frontend Linting & Build Verification
```bash
cd frontend
npm run lint
npm run build
```

---

## 📡 REST API Reference

The entire API contract is documented in [openapi.yaml](file:///c:/Users/jamad/Desktop/BrandGuard-Preflight-/openapi.yaml) (OpenAPI 3.1 compatible).

| Method | Endpoint | Description | Access |
| :--- | :--- | :--- | :--- |
| `GET` | `/health` | Service health status | Public |
| `POST` | `/v1/drafts` | Submit new content draft with intent parameters | Creator / Admin |
| `GET` | `/v1/drafts/:id` | Fetch draft details, version history, & status | Authenticated |
| `POST` | `/v1/drafts/:id/review` | Trigger Preflight ML scan & claim verification | Creator / Admin |
| `GET` | `/v1/drafts/:id/findings`| Retrieve all evidence findings for a draft | Authenticated |
| `PATCH` | `/v1/findings/:id` | Update finding status (accept fix, dismiss, override)| Creator / Manager |
| `POST` | `/v1/drafts/:id/approve` | Final sign-off & cryptographic passport generation | Manager / Admin |
| `GET` | `/v1/passports/:id` | Retrieve SHA-256 Brand Passport artifact | Authenticated |
| `POST` | `/v1/sources` | Ingest brand guidelines and fact documents | Knowledge Owner / Admin |
| `GET` | `/v1/insights` | Fetch policy contradiction heatmaps & drift trends | Manager / Admin |

---

## 👥 Hackathon Team (Codex 48)

* **Somnath** — *Team Lead & Full Stack Backend Engineer*  
  Architecture, Express REST APIs, MongoDB schemas, MinIO storage, RBAC, Redaction Gateway, Brand Passport cryptography, Shelf-Life scheduler.
* **Falguni Sharma** — *MERN Full Stack Developer*  
  Frontend UI/UX architecture, React 19 + Vite implementation, Evidence Card primitive, Review & Workflow interfaces, WCAG 2.2 AA accessibility.
* **Om Apar** — *AI / ML Specialist*  
  FastAPI service, claim extraction heuristics, NLI entailment / contradiction engine, rewrite algorithms, and Stellara benchmark synthetic dataset.

---

## 📄 License

This project is licensed under the [MIT License](file:///c:/Users/jamad/Desktop/BrandGuard-Preflight-/LICENSE).

 
## Advanced ML capabilities

The FastAPI service includes scanned-PDF OCR, OpenCV image-byte analysis, guarded OpenAI-compatible rewrite/premortem prompts, spaCy entity detection, a DeBERTa-compatible NLI judge, and a FAISS/SentenceTransformers retrieval path. Deterministic fallbacks remain available when a model is unconfigured or unavailable.

### Enable the heavier CPU model stack

Set the following in `.env` before building the ML container:

```dotenv
INSTALL_ML_MODELS=true
SEMANTIC_RETRIEVAL_ENABLED=true
SENTENCE_TRANSFORMER_MODEL=sentence-transformers/all-MiniLM-L6-v2
NLI_MODEL_NAME=cross-encoder/nli-deberta-v3-base
NLI_ENABLED=true
```

Then rebuild the ML service with `docker compose up --build -d ml`. The first semantic/NLI inference may download the configured Hugging Face model; the Hugging Face cache is persisted in the `brandguard_hf_cache` volume. CPU inference is supported; GPU use is not assumed. FAISS index files are rebuildable caches, while source passages remain the canonical persisted content.

### Enable LLM-assisted rewriting and premortems

Point the service at an OpenAI-compatible server such as LM Studio. From Docker Desktop on Windows, the host server is typically reachable as `http://host.docker.internal:1234/v1`. Set `LLM_BASE_URL` and `LLM_MODEL`; set `LLM_API_KEY` only if the endpoint requires one. If these are blank, the service will not make an outbound LLM request. The backend also reads `Org.settings.allowExternalModel`; it sends the explicit permission flag only when that organisation has opted in. Direct internal API callers must provide the corresponding permission flag as well. Model-generated content is a suggestion, not an approval decision. Rewrites are rejected if they remove required `mustSay` language or fail response validation; malformed or failed responses fall back to deterministic behavior.

### Evaluation and confidence calibration

Run the existing five-case regression fixture, then the synthetic 60-draft calibration set:

```bash
cd ml_service
PYTHONPATH=. pytest -q
PYTHONPATH=. python -m evaluation.evaluator --dataset evaluation/drafts_60.json --report reports/evaluation-60-draft.json
```

The evaluator sweeps 50 confidence cutoffs from 0.50 through 0.99 and reports precision, recall, F1, false positives and false negatives at each cutoff, selecting the best F1 point with precision as a tie-break. The 60 items are synthetic development fixtures, not an independently adjudicated production benchmark. Treat the selected cutoff as a regression/calibration baseline, and re-tune against reviewed real drafts before production use.
