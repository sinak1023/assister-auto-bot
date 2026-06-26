---
name: Code Review
description: Review code in the workspace for bugs, style, and improvements
---

# Code Review skill

When asked to review code, follow this process:

1. **Map the change.** Use `list_dir` and `glob_files` to find the relevant
   files, then `read_file` to read them fully before commenting.
2. **Look for correctness bugs first** — off-by-one errors, unhandled errors,
   null/undefined access, race conditions, incorrect logic. These matter most.
3. **Then style & maintainability** — naming, duplication, dead code,
   inconsistent conventions with the rest of the project.
4. **Then efficiency** — obvious unnecessary work, N+1 patterns, repeated I/O.
5. **Report concisely.** For each finding give: the file:line, what's wrong,
   why it matters, and a concrete fix. Lead with the highest-severity issues.
6. Don't invent problems. If the code is fine, say so.

Prefer showing a small corrected snippet over a long explanation.
