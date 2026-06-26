# Task Plan

## Goal
Add a ComfyUI integration foundation for FlowCanvas: configurable local/remote ComfyUI endpoint, API-format workflow import, a dedicated workflow parameter exposure page, and first canvas usage through config nodes. Current follow-up: improve canvas config node ComfyUI inputs so workflow fields adapt to exposed parameters and text/image upstream nodes can be referenced from inputs.

## Steps
1. Inspect current config/navigation/canvas patterns and reference ComfyUI workflow behavior. Status: complete.
2. Add ComfyUI config/workflow persistence types and helpers. Status: complete.
3. Add ComfyUI API service for testing, upload, queue, polling, and output URLs. Status: complete.
4. Add ComfyUI connection settings to the existing config modal. Status: complete.
5. Add a dedicated workflow configuration page. Status: complete.
6. Add first canvas config-node execution path for ComfyUI image outputs. Status: complete.
7. Update project docs/progress files and run lightweight diff checks only. Status: complete.
8. Inspect current ComfyUI canvas node field rendering and upstream reference plumbing. Status: complete.
9. Add adaptive workflow input UI and @ reference resolution for upstream text/images. Status: complete.
10. Update progress docs if needed. Status: complete.
11. Fix prompt-panel duplicate mention labels after a single @ reference insertion. Status: complete.

## Errors Encountered
| Error | Attempt | Resolution |
|---|---|---|
| GitHub clone timeout | `git clone` reference repo | Retried via codeload zip and inspected extracted files |
| GitHub API 403 | GitHub recursive tree API | Used downloaded zip/raw file instead |
| PowerShell path parsing | Read path containing `(user)` without quotes | Retried with `-LiteralPath` |
| PowerShell quote parsing | Complex `rg` expression with unescaped quotes | Split searches into simpler commands |
| PowerShell literal path parsing | Mixed `rg` with PowerShell `-LiteralPath` | Retried through `Get-Content -LiteralPath` and `Select-String` |
