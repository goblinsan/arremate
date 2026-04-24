# Design Guidelines

These rules apply to all code, copy, and documentation in this repository. Future contributors and automated agents must follow them.

---

## Icons

Use a two-tier icon system:

| Tier | Library | Usage |
|------|---------|-------|
| Core UI | `lucide-react` | navigation, buttons, forms, tables, status indicators, empty states, settings/admin UI, utility actions (edit, delete, search, filter, download, upload) |
| Illustrative / marketing | `@phosphor-icons/react` | marketing sections, landing-page feature accents, promotional cards, expressive decorative illustration-style moments |

Both libraries are installed in `apps/web` and `apps/admin`.

**Rules:**
- Do not use emojis as UI icons.
- Do not introduce new icon libraries unless explicitly requested.
- Default to `lucide-react` unless the element is clearly marketing or illustrative.
- Keep icon usage consistent within a screen or component. Do not mix emoji, Lucide, and Phosphor in the same role.
- Match icon size and stroke weight across a component (default `w-4 h-4` for inline icons, `w-5 h-5` for buttons and nav items).

---

## Copy and Writing

- Do not use emojis in UI copy, docs, comments, commit messages, or PR text unless explicitly requested.
- Avoid em dashes. Prefer commas, periods, or parentheses.
- Keep copy direct, product-focused, and professional.
- Prefer Portuguese for user-facing product copy unless the surrounding screen is already in English.
- Replace Unicode arrow characters (`←`, `→`) in navigation or pagination UI with proper Lucide icons (`ArrowLeft`, `ArrowRight`, `ChevronLeft`, `ChevronRight`).

---

## Design Consistency

- If replacing an emoji in the UI, replace it with a real icon from the approved libraries.
- Match icon size and stroke weight across a component.
- When editing an existing component, do not mix emoji, Lucide, and Phosphor in the same role.
- Reuse existing patterns before inventing new ones.
- Keep visual changes scoped and consistent with the current screen.

---

## Examples

### Navigation back link
```tsx
// Correct
<Link to="/shows" className="inline-flex items-center gap-1">
  <ArrowLeft className="w-3.5 h-3.5" /> Ver todos os shows
</Link>

// Wrong
<Link to="/shows">← Ver todos os shows</Link>
```

### Status badge
```tsx
// Correct
<span className="inline-flex items-center gap-1 ...">
  <Radio className="w-3 h-3" /> Ao vivo
</span>

// Wrong
<span>🔴 Ao vivo</span>
```

### Pagination
```tsx
// Correct
<button className="... inline-flex items-center gap-1">
  <ChevronLeft className="w-3 h-3" /> Anterior
</button>

// Wrong
<button>← Anterior</button>
```
