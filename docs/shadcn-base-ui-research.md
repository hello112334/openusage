# shadcn Base UI vs shadcn/ui - Research Summary

**Date:** February 1, 2026  
**Sources:** Official shadcn/ui docs (Jan 2026), certificates.dev (Dec 2025)

## 1. What is shadcn Base UI vs Regular shadcn/ui?

**shadcn/ui** is not a component library—it's a code distribution system. Components are copied into your project, not installed as dependencies.

**Regular shadcn/ui:**
- Uses **Radix UI** as the underlying unstyled primitive library
- Radix: Individual packages per component (`@radix-ui/react-dialog`, etc.)
- Battle-tested, 130M+ monthly downloads
- Uses `[data-state="open"]` data attributes

**shadcn Base UI:**
- Uses **Base UI** (from MUI team) as the underlying primitive library  
- Base UI: Single tree-shakeable package (`@base-ui/react`)
- Newer (v1 released Dec 11, 2025), built by Radix creators
- Uses `[data-open]` / `[data-closed]` data attributes
- Includes advanced patterns (detached triggers, CSS variables for dynamic values)

**Key Point:** Both provide the **same shadcn/ui component API**. The underlying implementation differs, but your code looks identical:

```tsx
// Works the same with Radix or Base UI
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog"
```

## 2. Key Differences

| Aspect | Radix (Regular) | Base UI |
|--------|----------------|---------|
| **Package Structure** | Individual packages per component | Single `@base-ui/react` package |
| **Data Attributes** | `[data-state="open"]` | `[data-open]` / `[data-closed]` |
| **Maturity** | Years in production, battle-tested | New (v1 Dec 2025) |
| **Advanced Features** | Standard patterns | Detached triggers, CSS variables |
| **Maintainers** | Small team, some long-standing bugs | Fresh codebase, lessons learned |

## 3. Latest Installation Method (2025-2026)

### Option A: New Project (Recommended)
```bash
npx shadcn create
```
Interactive setup lets you choose:
- Component library (Radix or Base UI)
- Visual style (Vega, Nova, Maia, Lyra, Mira)
- Icons (Lucide, Tabler, HugeIcons)
- Theme, fonts, border radius

### Option B: Existing Project
```bash
npx shadcn@latest init
```
Choose Base UI when prompted.

## 4. Setup for Vite React Project

### Prerequisites
- Node.js ≥ 18
- Vite + React project

### Step-by-Step Setup

**1. Install Tailwind CSS v4:**
```bash
pnpm add tailwindcss @tailwindcss/vite
# or npm/yarn/bun
```

**2. Update `src/index.css`:**
```css
@import "tailwindcss";
```

**3. Configure TypeScript (`tsconfig.json`):**
```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

**4. Configure TypeScript (`tsconfig.app.json`):**
```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

**5. Update `vite.config.ts`:**
```bash
pnpm add -D @types/node
```

```ts
import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})
```

**6. Initialize shadcn/ui:**
```bash
npx shadcn@latest init
```

When prompted:
- Choose **Base UI** as component library
- Select your preferred base color, theme, etc.

**7. Add Components:**
```bash
npx shadcn@latest add button
npx shadcn@latest add dialog
# etc.
```

**8. Use Components:**
```tsx
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog"

function App() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button>Open Dialog</Button>
      </DialogTrigger>
      <DialogContent>
        {/* Content */}
      </DialogContent>
    </Dialog>
  )
}
```

## When to Choose Base UI vs Radix?

**Choose Base UI if:**
- Starting a new project
- Want a single package instead of many
- Need advanced patterns (detached triggers)
- Prefer newer, modern codebase

**Choose Radix if:**
- Need battle-tested stability
- Already using Radix in other projects
- Prefer individual component packages
- Want maximum ecosystem compatibility

Both work identically through shadcn/ui's abstraction layer.
