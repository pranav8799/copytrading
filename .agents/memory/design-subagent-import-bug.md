---
name: Design subagent import bug
description: Design subagent consistently imports from internal package paths not exported by the package.json exports field.
---

The design subagent reliably writes broken imports like:
- `from "@workspace/api-client-react/src/custom-fetch"` (for setAuthTokenGetter, setBaseUrl)
- `from "@workspace/api-client-react/src/generated/api.schemas"` (for TypeScript enum types)

**Why:** The subagent sees the internal file structure and imports directly into it, but the package.json only exports `"."` → `"./src/index.ts"`. Vite enforces the exports map and throws a 500 error.

**How to apply:** After every design subagent run, grep for `api-client-react/src` in the copy-trading src directory and replace all occurrences with `@workspace/api-client-react`. Everything (hooks, types, setAuthTokenGetter) is re-exported from the main index.

Also watch for React Query v5 mutations: `isLoading` doesn't exist on mutation results — use `isPending`. And query hooks with options need `queryKey` explicitly provided.
