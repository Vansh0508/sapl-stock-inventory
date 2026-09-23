# AGENTS.md — Shyam Ahuja Inventory Management System

---

## Quick Reference Commands

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Run Supabase locally (Docker must be running)
npx supabase start

# Stop local Supabase
npx supabase stop

# Push schema to local Supabase
npx supabase db push

# Generate TypeScript types from Supabase schema
npx supabase gen types typescript --local > src/types/database.types.ts

# Build for production
npm run build

# Lint
npm run lint

# Format
npm run format
```

---

## Project Overview

An inventory management web application for **Shyam Ahuja** — a luxury rug, dhurrie, and carpet brand. The app manages the full product lifecycle: catalog, inventory (serialized physical pieces), locations, pricing, and supporting dictionary tables.

The app is **desktop-first, mobile-friendly**, built as a single-page experience with tab-based navigation.

---

## Stack

| Layer | Technology | Version |
|---|---|---|
| Framework | Next.js (App Router) | `15.x` (latest stable) |
| Language | TypeScript | `5.x` |
| UI Library | HeroUI | `@heroui/react@3.x` (latest stable) |
| Styling | Tailwind CSS | `4.x` (bundled with HeroUI v3) |
| Animations | Motion (formerly Framer Motion) | `framer-motion@12.x` |
| Database | Supabase (self-hosted via Docker) | `@supabase/supabase-js@2.x` |
| State Management | Zustand | `5.x` |
| Form Handling | React Hook Form + Zod | `7.x` / `3.x` |
| Image Uploads | Supabase Storage | via `@supabase/supabase-js` |
| Package Manager | npm | latest |

---

## Critical Library Notes

### HeroUI v3 (Breaking changes from v2 / NextUI)

- **Package name:** `@heroui/react` — NOT `@nextui-org/react`. They are different packages.
- **No `<HeroUIProvider>` wrapper required** in v3. Remove any Provider wrapper from previous NextUI/HeroUI v2 code.
- **Compound component API:** Components use dot notation — `Card.Header`, `Card.Content`, `Select.Item`, `Modal.Header`. Do not use the flat prop-based API from v2.
- **Tailwind CSS v4 only.** HeroUI v3 requires Tailwind CSS v4. Do not install or configure Tailwind v3.
- **Divider is now Separator.** The CSS variable `--divider` is renamed to `--separator`. The component is `<Separator />`. Any code using `--divider` or `<Divider />` is outdated.
- **Select API change:** `SelectContent` is now `SelectPopover`. Update imports accordingly.
- **Radio, Checkbox, Switch composition:** These now use explicit `*.Content` composition. The control nests inside `*.Content`; the label is plain text, not a nested `<Label>`.
- **Always check:** `heroui.com/docs/react` for the latest component API before implementing.

### Motion / Framer Motion v12

- **Framer Motion is now Motion.** The package `framer-motion` still exists on npm but the canonical import has changed.
- **Correct import:** `import { motion, AnimatePresence } from "motion/react"` — NOT `from "framer-motion"`.
- Install via: `npm install framer-motion` (the package itself is still `framer-motion`).
- All animation logic uses the `motion/react` subpath. Using `from "framer-motion"` still works but is the legacy path.
- No breaking changes in v12 for React; the main change is the import path.
- Do NOT use `AnimateSharedLayout` — it was removed in v5 and does not exist.
- `layoutId` prop handles shared element transitions directly without wrappers.

### Supabase JS v2

- **Publishable key naming:** Environment variable is `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (new format). Legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY` also works during transition. Use the publishable key format in all new code.
- **Node.js 18 is EOL and unsupported.** Use Node.js 20+ (LTS).
- Create a single client instance and export it — do not instantiate `createClient` per request.
- For Next.js App Router, use `@supabase/ssr` for server-side client creation (cookie-based auth).
- Self-hosted via Docker: `NEXT_PUBLIC_SUPABASE_URL` points to `http://localhost:54321` in development.

### Next.js 15 App Router

- All pages and layouts use the App Router (`src/app/`). Do not use the Pages Router.
- Server Components are the default. Mark client components explicitly with `"use client"` at the top.
- HeroUI components already include `"use client"` — import and use them directly in Server Components.
- Use `next/image` for all image rendering. Never use raw `<img>` tags.
- Use `next/font` for any custom fonts loaded from Google.

---

## Project Structure

```
src/
├── app/                        # Next.js App Router
│   ├── layout.tsx              # Root layout
│   ├── page.tsx                # Root redirect → /products
│   └── products/
│       └── page.tsx            # Products page (Gallery / Catalog / Manage tabs)
│
├── components/
│   ├── layout/                 # AppShell, Sidebar, TopNav, MobileNav
│   ├── products/
│   │   ├── gallery/            # GalleryTab, GridView, GalleryView, KanbanView, RecordView
│   │   ├── catalog/            # CatalogTab, CatalogRow, NestedInventoryRow, BulkEditPage
│   │   └── manage/             # ManageTab, dictionary table components
│   ├── shared/
│   │   ├── Toolbar.tsx         # Sort, Filter, Group, RowHeight, HideColumns, Search — reusable
│   │   ├── SearchBar.tsx       # Ctrl+F / Cmd+F shortcut search
│   │   ├── ImageUploader.tsx   # Multi-image upload to Supabase Storage
│   │   └── DataTable.tsx       # HeroUI-based table wrapper for Manage dictionaries
│   └── ui/                     # Thin wrappers / custom primitives
│
├── lib/
│   ├── supabase/
│   │   ├── client.ts           # Browser Supabase client (singleton)
│   │   ├── server.ts           # Server-side Supabase client (SSR, cookies)
│   │   └── storage.ts          # Supabase Storage helpers (upload, delete, getUrl)
│   └── utils.ts                # General utilities (cn, formatters)
│
├── hooks/
│   ├── useCatalog.ts
│   ├── useInventory.ts
│   ├── useLocations.ts
│   ├── useToolbar.ts           # Sort/filter/group state
│   └── useSearch.ts            # Global search with keyboard shortcut
│
├── stores/
│   ├── catalogStore.ts         # Zustand: catalog selection, bulk edit state
│   └── viewStore.ts            # Zustand: current view mode, toolbar state
│
├── types/
│   ├── database.types.ts       # Auto-generated from Supabase schema
│   └── app.types.ts            # App-level types (ViewMode, ToolbarState, etc.)
│
└── styles/
    └── globals.css             # Tailwind base + custom CSS variables
```

---

## App Agenda

The application manages the inventory of Shyam Ahuja's physical products — rugs, dhurries, carpets, and related items. It has three primary modes:

**Gallery** — visual exploration of inventory and catalog. Supports multiple view modes (Grid, Gallery card, Kanban, Record). All views share a common toolbar (sort, filter, group, row height, hide columns, search).

**Catalog** — the product master. Each row represents a unique SKU. Each SKU expands to show its serialized physical pieces (Inventory rows). Supports adding, updating, discontinuing products, bulk editing, and searching.

**Manage** — dictionary management for all reference/lookup tables (Locations, Currencies, Colors, Quality, Design, Collections, Fiber List, Construction, Sizes, Lengths, Widths). Uses HeroUI tables.

---

## Dos and Don'ts

### Do
- Use `"motion/react"` as the import path for all animation primitives.
- Use HeroUI v3 compound component API (`Card.Header`, `Modal.Header`, etc.).
- Mark all interactive/stateful components with `"use client"`.
- Use Supabase Storage for all image uploads. Store the returned public URL in the `inventory_images` table.
- Use `next/image` for displaying all images with explicit `width` and `height` props.
- Use `React Hook Form` + `Zod` for all forms. Validate at the schema level.
- Use Zustand for cross-component state (selected rows, bulk edit mode, view mode).
- Use HeroUI `Table` component for all Manage dictionary tables.
- Keep Supabase client instantiation to a single exported singleton per environment (browser vs server).
- Generate TypeScript types from Supabase and use them throughout — never write raw object types that duplicate the DB schema.
- Use `cn()` utility (clsx + tailwind-merge) for conditional class names.
- Make every layout responsive — test at 375px (mobile) and 1440px (desktop) breakpoints.

### Don't
- Don't import from `"framer-motion"` directly — use `"motion/react"`.
- Don't use `@nextui-org/react` — HeroUI v3 is `@heroui/react`.
- Don't use `<HeroUIProvider>` — it is not required in v3.
- Don't use `AnimateSharedLayout` — it does not exist.
- Don't use `--divider` CSS variable or `<Divider />` component — use `--separator` / `<Separator />`.
- Don't use the Pages Router (`src/pages/`). App Router only.
- Don't use raw `<img>` tags — always `next/image`.
- Don't call `createClient()` inside a React component render — use a singleton or hook.
- Don't hardcode Supabase URLs or keys — always read from environment variables.
- Don't mix Tailwind v3 and v4 utilities — HeroUI v3 requires Tailwind v4 exclusively.
- Don't use `SelectContent` — it is renamed to `SelectPopover` in HeroUI v3.
- Don't skip `"use client"` on components that use hooks, event handlers, or browser APIs.
- Don't use `any` TypeScript type — use the generated Supabase types.
- **🚫 NEVER drop, reset, wipe, or delete the Supabase database or any of its tables, schemas, or storage buckets.** This includes `supabase db reset`, `DROP TABLE`, `DROP SCHEMA`, `TRUNCATE`, or any destructive SQL that removes existing production data. Schema changes must be made exclusively via additive migration files in `supabase/migrations/`.
- **🚫 NEVER read, print, open, cat, or modify any `.env` file** (`.env`, `.env.local`, `.env.production`, `.env.*`). These files contain secrets. Reference variable names only from the Environment Variables section of this document.

---

## Environment Variables

```env
# .env.local
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-local-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-local-service-role-key
```

---

## Database

Schema is defined in `shyam_ahuja_schema.sql`. Tables:

`currencies` · `product_types` · `lengths` · `widths` · `sizes` · `constructions` · `fiber_list` · `qualities` · `designs` · `collections` · `colors` · `catalog` · `catalog_colors` · `catalog_fibers` · `locations` · `inventory` · `prices`

**Image storage** is handled via Supabase Storage in a bucket named `inventory-images`. Each image record links `inventory_id` → `storage_path` → public URL via a separate `inventory_images` table (to be added to schema as a migration).

Key views for frontend reads:
- `view_catalog_full` — full resolved catalog row
- `view_active_prices` — current price per SKU per location
- `view_inventory_full` — physical pieces with location and SKU

---

## Security & Data Safety

> **These are absolute, non-negotiable rules. No exception exists for any reason.**

### Database Integrity
- **Never** run `supabase db reset` or any command that wipes or recreates the database.
- **Never** execute destructive SQL: `DROP TABLE`, `DROP SCHEMA`, `DROP DATABASE`, `TRUNCATE`, or `DELETE FROM` without a `WHERE` clause.
- **Never** delete Supabase Storage buckets or their contents programmatically outside of the explicit image-delete flow in `lib/supabase/storage.ts`.
- All schema changes **must** be delivered as new additive migration files in `supabase/migrations/` (e.g. `006_add_column.sql`). Never edit existing migration files retroactively.
- Before running any Supabase CLI command that touches the schema, confirm the command is read-only or additive.

### Environment File Protection
- **Never** read, open, `cat`, print, log, or pass the contents of any `.env` file (`.env`, `.env.local`, `.env.production`, `.env.*`) to any output, tool, or network request.
- **Never** modify `.env` files. If a new variable is needed, document its name and expected format here and ask the user to populate it manually.
- Reference variable names only — never their values.

---

## Coding Conventions

- File naming: `kebab-case` for files, `PascalCase` for React components.
- All components are typed with explicit props interfaces.
- Server actions live in `src/app/actions/` with `"use server"` directive.
- API routes (if needed) in `src/app/api/`.
- No default exports from utility files — named exports only.
- Components use default exports.
- Prefer `const` arrow functions for components: `const MyComponent = () => { ... }`.
- Use `async/await` over `.then()` chains.
- Errors are handled with try/catch and surfaced via HeroUI toast notifications.