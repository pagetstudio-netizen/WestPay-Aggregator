---
name: Node package-manager mismatch
description: Recover Replit workflows when the local dependency tree and package-manager tooling disagree.
---

In this workspace, `node_modules` may use a pnpm store layout even though package installation tooling invokes npm. The direct package folders can exist while expected `node_modules/.bin` launchers are missing. An npm-based reinstall may fail while trying to rename a directory over a hidden pnpm symlink.

**Why:** A workflow can stop even when its declared package is present, and retrying a full install may damage or further mix the dependency tree.

**How to apply:** Check the package's direct CLI entrypoint before reinstalling. If it exists, use that entrypoint to run or type-check the app and, when needed, configure the workflow to call it directly. Avoid blind shell installs or lockfile changes; use package-management tooling and reassess if it fails.
