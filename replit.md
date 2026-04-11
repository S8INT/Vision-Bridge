# VisionBridge UG — TeleOphthalmology Platform

## Overview

Clinical-grade teleophthalmology mobile application built for low-resource settings (Uganda / Sub-Saharan Africa). Designed for community health workers, technicians, and ophthalmologists to manage retinal screening, AI-assisted diagnosis, and specialist consultations.

## Architecture

### Mobile App (Expo / React Native)
- **Location**: `artifacts/visionbridge/`
- **Framework**: Expo SDK with Expo Router (file-based routing)
- **State**: React Context (`context/AppContext.tsx`) + AsyncStorage for offline persistence
- **No authentication** (skipped for rapid iteration)

### API Server (Express 5)
- **Location**: `artifacts/api-server/`
- **Framework**: Express 5 + TypeScript
- **Not currently used** by mobile app (offline-first approach)

## Core Features

1. **Dashboard** — Live stats: today's screenings, pending reviews, urgent cases, open consultations
2. **Patient Registry** — Register patients with demographics, medical history, village/district
3. **Retinal Screening** — Capture workflow with simulated AI analysis (EfficientNet-B4 model proxy)
4. **AI Results** — Risk levels: Normal / Mild / Moderate / Severe / Urgent with findings and confidence
5. **Consultation Queue** — CHW-to-specialist referral management with priority triage
6. **Notifications** — Real-time alerts for consultation responses, screening reviews, referrals
7. **Patient Detail** — Full history, screening timeline, medical records

## Clinical Design Principles

- AI results include HIPAA-grade disclaimer (clinical decision support, not diagnosis)
- Priority triage: Emergency / Urgent / Routine
- Offline-first: AsyncStorage used for persistence, sync banner shows connectivity status
- Risk color coding: Normal=green, Mild=cyan, Moderate=amber, Severe/Urgent=red

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **Mobile**: Expo + Expo Router + React Native
- **State**: React Context + AsyncStorage
- **API framework**: Express 5 (backend, unused by mobile initially)
- **Database**: PostgreSQL + Drizzle ORM (available, not connected to mobile yet)
- **Validation**: Zod, drizzle-zod

## Key Commands

- `pnpm run typecheck` — full typecheck
- `pnpm run build` — typecheck + build all packages
- Expo workflow: restart `artifacts/visionbridge: expo`

## Demo Data

Pre-seeded with 5 patients (Mbarara district), 5 screenings with AI results, 3 consultations, and 4 notifications. All data is stored in AsyncStorage and persists across sessions.

## Screen Routes

- `/(tabs)/index` — Dashboard
- `/(tabs)/patients` — Patient list with search/filter
- `/(tabs)/consultations` — Consultation queue with status filters
- `/(tabs)/notifications` — Notification center
- `/patient/register` — New patient registration (modal)
- `/patient/[id]` — Patient detail
- `/screening/new` — New screening workflow (modal)
- `/screening/[id]` — Screening detail with referral flow
- `/consultation/[id]` — Consultation detail with specialist response
