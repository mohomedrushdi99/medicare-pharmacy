# Medicare Pharmacy

A minimalist wholesale medicine inventory and billing application for a single operator account.

The app covers authentication, a dashboard, medicine inventory, stock adjustments, point-of-sale billing, invoice history, A4 PDF download, printing, and pharmacy/theme settings.

## Stack

- React 19, TypeScript, Vite, TanStack Start / Router / Query
- Tailwind CSS v4 and Radix/shadcn-style UI
- PostgreSQL via the platform database helper (Neon in production, embedded Postgres in preview)
- Better Auth (Google, X, email/password)
- pdf-lib for invoice PDFs
- Zod and React Hook Form for validation

## Requirements

- Node.js 22+
- A PostgreSQL database in production (`DATABASE_URL` is injected by the host)

## Installation

```bash
npm install
```

## Environment

Do not commit secrets. Production provides:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres connection string |
| Auth credentials | Injected by the host for Better Auth / Grok broker |

No `.env` file is required for local preview. The app falls back to an in-memory Postgres.

## Database

Schema lives in `migrations/`:

1. `0001_auth.sql` — Better Auth tables
2. `0002_schema.sql` — medicines, sales, stock, settings, audit log

Migrations apply automatically on preview startup and during `npm run build`.

The first sign-in creates pharmacy settings and realistic sample medicines/invoices for that operator.

## Commands

```bash
npm run dev          # development server
npm run build        # production build + migrations
npm run typecheck    # TypeScript
npm run preview      # serve the production build
```

## Using the app

There is **one operator account** (no multi-user registration).

| Field | Value |
| --- | --- |
| Email | `admin@medicare.lk` |
| Password | `Medicare@2026` |

1. Open the app → Sign in with the credentials above (or Google / X).
2. Review the dashboard.
3. Manage inventory, adjust stock, and deactivate medicines used on invoices.
4. Create a sale on Billing. Stock is deducted in one database transaction.
5. View, print, or download invoices.
6. Customise pharmacy details, invoice numbering, currency, accent colour, theme, and dashboard cards in Settings.

## Testing

Core paths to verify:

- Login / logout / password change
- Create, edit, deactivate medicines
- Add / remove stock, reject negative stock
- Billing totals, insufficient stock, invoice numbering
- PDF download and print layout
- Settings (name, logo, currency, theme, accent)

## Deployment

The production build targets Vercel. Database migrations run as part of `npm run build`.

## Troubleshooting

- Signed-out API calls return `Unauthorized` — sign in again.
- PDF generation fails if the invoice no longer exists.
- Logo uploads must be PNG or JPEG under 400KB.
- Stock cannot go below zero; sales that would oversell are rejected.
