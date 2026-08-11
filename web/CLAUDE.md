@AGENTS.md

# Claude Code Rules: Next.js Enterprise Development Standards

## Core Constraints & Strict Directives

### 1. Form Handling & Validation

- **Form Architecture:** Always use `react-hook-form` integrated with `@hookform/resolvers/zod` and `zod` schemas.
- **Schema Location:** Define Zod schemas alongside components in a `[component].schema.ts` file or dedicated `schemas/` directory.
- **Form State:** Infer TypeScript types directly from Zod schemas using `z.infer<typeof schema>`. Never duplicate type declarations for forms.

### 2. State Management & Hooks Strategy

- **Minimize `useState`:** Do NOT use `useState` for values that can be derived or stored in external state systems (URL search params, custom hooks, context, server state).
- **Derived State:** Calculate values during rendering rather than storing derived data in state or sync-effects.
- **Optimization:** Use `useMemo` for expensive computations and `useCallback` for callbacks passed down to memoized child components.
- **URL as State:** For filters, sorting, search queries, and pagination, use Next.js `useSearchParams` and `useRouter` to treat the URL as the source of truth.
- **Zustand owns state.** All non-trivial client state lives in a Zustand store under `@/stores`, not in component-local `useState`. A component may keep `useState` only for state that is genuinely local and disposable — an uncontrolled input's draft value, a hover flag, an open/closed toggle that nothing else reads. The moment a second component needs a value, it belongs in a store.
  - One store per domain (`map-store.ts`, `closure-form-store.ts`), not one global store.
  - Select narrowly (`useMapStore((s) => s.selectedRouteId)`) so a write to one slice doesn't re-render every consumer.
  - Server data is not state: fetch it in a Server Component or Server Action. Stores hold UI intent, not caches of the database.

### 3. Imports & File Organization

- **No Relative Imports:** Never use relative paths like `../../components/Button`. Always use full path alias imports relative to the root/app directory (e.g., `@/components/ui/button`, `@/lib/utils`).
- **No Default Exports:** Always use **Named Exports** for components, utilities, and hooks (`export const MyComponent = ...`). Exception: Next.js special files (`page.tsx`, `layout.tsx`, `error.tsx`, `loading.tsx`, `route.ts`) where Next.js requires default export conventions.
- **Type Imports:** Always explicitly mark type imports as `import type { ... } from '@/...'`.
- **One component per file — no exceptions.** Never declare two components in the same file, however small the second one is. A "just a little helper card" is how 1,000-line files start, and it is unreachable from anywhere else. Every component gets its own folder:

  ```
  src/components/console/route-tabs/
    route-tabs.tsx        # the component, named export
    route-tabs.types.ts   # props + local types (only if non-trivial)
    index.ts              # re-export
  ```

  If a file's second component exists only to keep a `useEffect` local, that is a hook, not a component — extract it to `@/hooks`.

  **Exempt: `components/base/` and `components/application/`.** These are vendored Untitled UI primitives, replaced wholesale on upgrade — reshaping them guarantees a painful merge and buys nothing. Leave them as they are; the rule governs code we author (`components/console/`, `components/map/`, `components/foundations/`, `app/`).

- **Types live in `@/types`, one domain per file.** Shared interfaces, DTOs, and unions are declared under `src/types/` (`transit.ts`, `console.ts`, `map.ts`, `gtfs.ts`) and imported from `@/types/...`. Only a component's own props stay beside it, in `<component>.types.ts`.
  - Types derived from a schema are never re-declared by hand — infer them (`z.infer`, Prisma's generated types) and re-export from `@/types`.
  - No `types.ts` barrels scattered through `components/`; that is what `@/types` replaces.

### 4. Code Quality & SonarQube Compliance

- **Zero Warnings Policy:** All code must pass SonarQube analysis without code smells, security hotspots, or bugs.
- **Cognitive Complexity:** Keep function cognitive complexity low ($\le 15$). Break down large functions into smaller, single-responsibility helper functions.
- **Clean Code:**
  - No commented-out code or unused variables/imports.
  - No duplicated code blocks or hardcoded secrets/magic numbers.
  - Always handle promise rejections and clean up event listeners/subscriptions in hooks.

### 5. Strict TypeScript Discipline

- **Strict Mode:** TypeScript strict mode must be enabled and non-negotiable.
- **Forbidden Types:** Absolute ban on `any`, `never`, and `unknown` types.
- **Type Precision:**
  - Define explicit interfaces or types for all component props, API parameters, and data structures.
  - Use Discriminated Unions for state objects with multiple mutually exclusive states.
  - Utilize generic constraints (`T extends Record<string, unknown>`) when writing reusable generics.

---

## App Router & Server Component Architecture

### 6. Server vs. Client Components

- **Server Components by Default:** Keep components as React Server Components (RSC) unless interactivity (event handlers, state, hooks) is strictly required.
- **Leaf-Node Client Components:** Push `"use client"` directives down to the smallest possible leaf components to keep the client bundle size minimal.
- **No Client Data Fetching:** Do not fetch data inside `useEffect` in Client Components. Fetch data on the server in Server Components or utilize Server Actions / React Query where dynamic client fetching is required.

### 7. Server Actions & Mutations

- **Input Validation:** All Server Actions must validate incoming payload using Zod schemas before processing.
- **Error Handling:** Return typed response objects from Server Actions (e.g., `{ success: true, data }` or `{ success: false, error: string }`). Never throw unhandled exceptions to the client.
- **Optimistic UI:** Utilize React's `useOptimistic` and `useActionState` hooks for responsive user updates during mutations.

### 8. Routing, Metadata, & Error Boundaries

- **App Directory Conventions:** Keep layouts, loading states, error boundaries, and pages cleanly separated (`layout.tsx`, `loading.tsx`, `error.tsx`, `not-found.tsx`).
- **Metadata API:** Export static `metadata` objects or dynamic `generateMetadata()` functions in all page components for SEO and OpenGraph tags.
- **Error Boundaries:** Every `error.tsx` must be a Client Component (`"use client"`) and provide a clear recover/retry option.

---

## Performance, Accessibility, & Styling

### 9. Assets & Optimization

- **Images:** Use `next/image` exclusively. Every image must provide explicit `width`/`height` or `fill`, an informative `alt` tag, and appropriate `priority` for above-the-fold content.
- **Fonts & Scripts:** Load fonts using `next/font` and external scripts using `next/script` with proper loading strategies (`afterInteractive`, `lazyOnload`).
- **Dynamic Imports:** Use `next/dynamic` or `React.lazy` to code-split heavy client-side libraries or modals.

### 10. Accessibility (a11y) & Semantic HTML

- **Semantic Tags:** Use proper HTML tags (`<main>`, `<nav>`, `<header>`, `<footer>`, `<article>`, `<section>`, `<button>`).
- **Interactive Elements:** Non-interactive tags (`div`, `span`) must never have `onClick` listeners unless wrapped in accessible button roles with proper keyboard event listeners (`onKeyDown`).
- **ARIA & Contrast:** Ensure all form inputs have associated `<label>` tags, icon-only buttons have `aria-label`, and color contrast meets WCAG AA standards.

---

## Security Standards

Assume every request is hostile and every client value is untrusted. Fail closed.

### 11. Secrets & Configuration

- **No hardcoded secrets.** Read all credentials, keys, and tokens from `process.env`; never commit them. Keep `.env*` out of git; ship only `.env.example` with placeholder values.
- **Server-only by default.** Only browser-safe values get a `NEXT_PUBLIC_` prefix. Never `NEXT_PUBLIC_` a secret — auth secrets, `DATABASE_URL`, OAuth client secrets, and private keys stay server-side.
- **Never log or return secrets or PII.** Keep tokens, session data, and personal data out of logs, error messages, and client responses.

### 12. Authentication & Authorization

- **`proxy.ts` is an optimistic cookie gate, not the boundary.** It only checks for a session cookie. Never rely on it for real authorization.
- **Re-check on every mutation.** Every Server Action and API route validates the real session and permissions server-side (`requireRole` / `requirePermission`) before doing work. Deny by default; enforce least privilege.
- **Scope data to the owner.** Queries that touch user-owned data (submissions, saved routes, profile) must filter by the current user id — never trust a client-supplied id alone.

### 13. Input Validation & Data Integrity

- **Validate everything with Zod.** Every Server Action and API route parses its payload (body, query, params) against a schema before use, and rejects unknown or oversized input.
- **Parameterize all DB access.** Use Prisma's query builder or `$queryRaw` **tagged-template parameters** (e.g. `= ANY(${ids})`). Never interpolate user input into a raw SQL string — that is SQL injection.
- **Bound every query.** Cap list sizes, string lengths, and pagination; no unbounded reads driven by client input.

### 14. Output & Injection Safety

- **Trust React's escaping.** Never `dangerouslySetInnerHTML` with user-derived content.
- **No PII/secrets in URLs, query strings, logs, or analytics events.** GA custom events carry ids and terms only, never personal data.
- **Security headers.** Ensure CSP, `X-Content-Type-Options`, `Referrer-Policy`, and HSTS are set at the framework or proxy layer.

### 15. Errors, Rate Limiting & Dependencies

- **Generic errors to the client.** Return typed, non-revealing error responses; never leak stack traces, DB errors, or internal paths.
- **Rate-limit sensitive endpoints.** Auth, fare proposals, and review actions must be throttled against abuse.
- **Patched, vetted dependencies.** Keep dependencies current; no known-vulnerable packages in the production path; review new deps for supply-chain risk.
