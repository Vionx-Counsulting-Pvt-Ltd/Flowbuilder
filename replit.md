# FlowBuilder

A workflow and approvals platform for teams to build business processes, submit requests, assign owners, and track decisions.

## Run & Operate

- `pnpm --filter @workspace/flowbuilder run dev` — run the web app
- `pnpm --filter @workspace/api-server run dev` — run the API server
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- The app uses this project's built-in PostgreSQL database and Clerk authentication.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)
- Web: React, Vite, Wouter, TanStack Query, Clerk

## Where things live

- `artifacts/flowbuilder` — FlowBuilder web app
- `artifacts/api-server` — API routes, Clerk middleware, and server startup
- `lib/api-spec/openapi.yaml` — API contract source of truth
- `lib/db/src/schema/flowbuilder.ts` — FlowBuilder database tables and types

## Architecture decisions

- Each FlowBuilder workspace is tenant-scoped; the signed-in Clerk identity is associated with a local workspace member.
- Submitted requests retain snapshots of workflow forms and approval stages so later workflow edits do not change existing requests.

## Product

FlowBuilder supports configurable workflows and approval stages, request submission and review, team roles and invitations, notifications, and operational reports.

## User preferences

The project is named Flowbuilder.

## Gotchas

- Run API code generation after changing the OpenAPI contract.
- Use the managed artifact workflows so configured preview paths and service ports are supplied.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
