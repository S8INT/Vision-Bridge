# VisionBridge UG — TeleOphthalmology Platform

## Overview

Clinical-grade teleophthalmology mobile application built for low-resource settings (Uganda / Sub-Saharan Africa). Designed for community health workers, technicians, and ophthalmologists to manage retinal screening, AI-assisted diagnosis, specialist consultations, referrals, appointments, and district-wide campaigns.

## Architecture

### Mobile App (Expo / React Native)
- **Location**: `artifacts/visionbridge/`
- **Framework**: Expo SDK with Expo Router (file-based routing)
- **State**: React Context (`context/AppContext.tsx`) + AsyncStorage for offline persistence
- **No authentication** — demo user: Sarah Nakato (Technician, Mbarara RRH Eye Unit)
- **Offline-first**: All actions queue to AsyncStorage; upload queue retried when connectivity returns

### API Server (Express 5)
- **Location**: `artifacts/api-server/`
- **Framework**: Express 5 + TypeScript
- **Imaging service**: `routes/imaging.ts` — upload, quality scoring, thumbnail, DICOM, offline queue endpoints
- **Image processing**: `lib/imageProcessor.ts` — EXIF strip, compression, blur/brightness/FOV scoring, thumbnail gen, DICOM wrapper
- **Object storage**: `lib/minio.ts` — per-tenant encrypted buckets, graceful fallback to local in-memory store

## Core Features

### Consultation Workflow (7 responsibilities)
1. Doctor assignment (round-robin, manual override)
2. Clinical notes / diagnosis / treatment plan
3. Referral tracking (internal + external)
4. Appointment marketplace (create, book, manage)
5. Care coordination status (Pending → Assigned → InReview → Reviewed → Referred → Completed)
6. Campaign bulk mode (link screenings/consultations to campaigns)
7. Response + notifications

### Imaging Service (7 responsibilities)
1. Upload JPEG/PNG (camera or gallery, expo-image-picker)
2. Client-side quality pre-score (blur/brightness/FOV, before upload)
3. Server-side quality scoring (sharp — blur/brightness/FOV/contrast)
4. EXIF strip + clinical metadata injection (patientId, deviceId, captureTime, eye, tenantId)
5. MinIO encrypted per-tenant buckets (env-configurable, in-memory fallback)
6. Thumbnail generation (server-side, bandwidth-efficient viewing)
7. DICOM export wrapper (OP modality, future compliance)
8. Offline upload queue (AsyncStorage-backed, up to 5 retries, bulk processQueue)

### Additional Screens
- Referral management (create, view, status tracking)
- Appointment booking (marketplace, specialist availability)
- Campaign management (district-wide bulk screening programs)
- Campaigns tab (overview + stats)

## Clinical Design Principles

- AI results carry HIPAA disclaimer (clinical decision support, not diagnosis)
- Priority triage: Emergency / Urgent / Routine
- Offline-first: AsyncStorage for persistence, connectivity banner
- Risk color coding: Normal=green, Mild=cyan, Moderate=amber, Severe/Urgent=red

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **Mobile**: Expo + Expo Router + React Native
- **State**: React Context + AsyncStorage
- **API framework**: Express 5
- **Image processing**: sharp (server-side), expo-image-picker (mobile)
- **Object storage**: MinIO (per-tenant encrypted buckets)

## Metro Configuration

`artifacts/visionbridge/metro.config.js` contains `resolver.blockList` entries to exclude:
- `node_modules/@img/` (sharp native libvips binaries)
- `node_modules/sharp/`
- `node_modules/minio/`
- `artifacts/api-server/` directory

This prevents Metro from crashing on sharp's temp libvips directory in the monorepo.

## Key Commands

- `pnpm run typecheck` — full typecheck
- `pnpm run build` — typecheck + build all packages
- Expo workflow: restart `artifacts/visionbridge: expo`
- API server workflow: restart `artifacts/api-server: API Server`

## Environment Variables (API Server)

| Variable | Default | Purpose |
|---|---|---|
| `MINIO_ENDPOINT` | — | MinIO/S3 server hostname |
| `MINIO_ACCESS_KEY` | — | MinIO access key |
| `MINIO_SECRET_KEY` | — | MinIO secret key |
| `MINIO_PORT` | 9000 | MinIO port |
| `MINIO_USE_SSL` | false | TLS |
| `MINIO_REGION` | us-east-1 | Bucket region |
| `MINIO_BUCKET_PREFIX` | visionbridge | Per-tenant bucket prefix |

If MinIO is not configured, the imaging service falls back to in-memory local storage (development only).

## Demo Data

Pre-seeded with 7 patients (Mbarara district), 7 screenings with AI results, 3 consultations, 4 doctors (round-robin assignment), 1 referral, 1 appointment, 2 campaigns. All stored in AsyncStorage key `visionbridge_v2`.

## Screen Routes

- `/(tabs)/index` — Dashboard
- `/(tabs)/patients` — Patient list with search/filter
- `/(tabs)/consultations` — Consultation queue with status filters
- `/(tabs)/campaigns` — Campaign overview
- `/(tabs)/notifications` — Notification center with badge
- `/patient/register` — New patient registration (modal)
- `/patient/[id]` — Patient detail + screening history
- `/screening/new` — Full imaging pipeline (capture → quality → upload → AI analysis → result)
- `/screening/[id]` — Screening detail
- `/consultation/[id]` — Consultation with doctor assignment, referral/appointment linking
- `/referral/new` — Create referral (modal)
- `/referral/[id]` — Referral detail + status
- `/appointment/book` — Book appointment (modal)
- `/appointment/[id]` — Appointment detail
- `/campaign/new` — Create campaign (modal)
- `/campaign/[id]` — Campaign detail + progress
