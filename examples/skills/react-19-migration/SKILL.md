---
name: react-19-migration
description: "Step-by-step playbook for upgrading React 17/18 apps to React 19: removed APIs, codemods and verification."
---

# React 19 migration

1. Read `package.json` and lockfile; list react, react-dom, @types/react versions.
2. Run `npx types-react-codemod@latest preset-19 ./src` and `npx react-codemod@latest` for removed APIs.
3. Replace `ReactDOM.render` with `createRoot`; remove `propTypes`/`defaultProps` on function components.
4. Replace string refs and legacy context; convert `forwardRef` to ref-as-prop where safe.
5. Run the type checker, then the test suite; fix failures one category at a time.
6. Summarise breaking changes handled and anything needing manual review.
