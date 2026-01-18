# Jon Don Fit Web App

A Next.js 16 application delivering client onboarding, authentication, and coaching dashboards for the Jon Don Fit training program.

## Features

- **Authentication** – User registration and login backed by MongoDB with hashed passwords and JWT issuance via [`lib/auth.signToken`](lib/auth.ts) and [`lib/mongodb.dbConnect`](lib/mongodb.ts).
- **Client Dashboard** – Program, nutrition, chat, and progress sections rendered through the [`app/dashboard`](app/dashboard) routes with shared UI such as [`components/BottomNav`](components/BottomNav.tsx).
- **API Routes** – Server actions for auth flows located under [`app/api/auth`](app/api/auth) (register, login, and current-user lookup).
- **Responsive UI** – Tailwind CSS v4 (postcss plugin) and the Geist font family configured in [`app/layout.tsx`](app/layout.tsx) with global styles in [`app/globals.css`](app/globals.css).

## Tech Stack

- Next.js 16 (App Router, Server Actions)
- React 19
- TypeScript
- Tailwind CSS v4
- MongoDB + Mongoose
- JSON Web Tokens (`jsonwebtoken`)

## Getting Started

1. **Install dependencies**
   ```bash
   npm install
   ```
2. **Set environment variables** (create `.env.local`)
   ```bash
   MONGODB_URI=mongodb://localhost:27017/jondonfitdb
   JWT_SECRET=replace-with-strong-secret
   ```
3. **Run the dev server (starts local MongoDB via ../db/compose.yml)**
   ```bash
   npm run dev
   ```
   This brings up the Dockerized MongoDB (idempotent) and starts Next.js at http://localhost:3000.

4. **Lint**
   ```bash
   npm run lint
   ```

## Project Structure

- `app/` – App Router pages, layouts, and API routes.
- `components/` – Client components such as [`components/AuthForm`](components/AuthForm.tsx).
- `lib/` – Shared utilities (`auth`, `clientAuth`, `mongodb`).
- `models/` – Mongoose models like [`models/User`](models/User.ts).

## API Overview

| Route | Method | Description |
| ----- | ------ | ----------- |
| `/api/auth/register` | POST | Create user, hash password, return JWT. |
| `/api/auth/login` | POST | Validate credentials with [`models/User.comparePassword`](models/User.ts), return JWT. |
| `/api/auth/me` | GET | Verify token extracted by [`lib/auth.getTokenFromRequest`](lib/auth.ts) and return profile. |

## Available Scripts

| Command | Description |
| ------- | ----------- |
| `npm run dev` | Start Dockerized MongoDB (../db/compose.yml) then Next.js dev server. |
| `npm run dev:db` | Start only the local MongoDB container (idempotent). |
| `npm run build` | Create production build. |
| `npm run start` | Run production server (after build). |
| `npm run lint` | Execute ESLint using the config in [`eslint.config.mjs`](eslint.config.mjs). |
