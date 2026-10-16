---
name: rtl-migration
description: Migrate Enzyme tests to React Testing Library with user-centric queries and async patterns.
---

# Enzyme → React Testing Library

1. Find specs importing `enzyme`; migrate one file at a time.
2. Replace `shallow/mount` with `render`; query by role, label or text — not by component or class.
3. Replace `simulate` with `userEvent`; await async UI with `findBy*`/`waitFor`.
4. Delete snapshot tests that only assert implementation details.
5. Run the file after each conversion and keep behaviour assertions identical.
