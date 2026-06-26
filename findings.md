# Findings

- Current project has no ComfyUI implementation; ComfyUI should be added as a new local-browser persisted configuration, not mixed into existing OpenAI-compatible model channels.
- Existing config modal is the right place for connection-level settings, while workflow field exposure needs a dedicated page because it is larger than a modal tab.
- Reference project stores ComfyUI backend addresses, imports API-format workflow JSON, lets users select workflow node inputs as exposed fields, and applies those fields before running ComfyUI.
- Reference project uses an app-side API layer to talk to ComfyUI (`/prompt`, `/history/{prompt_id}`, `/view`, upload), which avoids browser CORS problems and supports local or remote ComfyUI addresses.
- ComfyUI workflow API JSON is a node-id keyed object where each node usually has `class_type`, `inputs`, and optional `_meta.title`; link inputs are arrays like `["nodeId", 0]` and should not be exposed as user-editable fields by default.
- The first canvas integration can fit the existing config-node model by adding a `comfyui` generation mode; the node can choose a saved workflow, store exposed field values in metadata, and create image nodes from ComfyUI history output.
- The canvas already has two upstream reference styles: config composer stores `@[node:id]`, while plain mention textareas insert display labels such as `图片1` / `文本1`. ComfyUI workflow field inputs need to resolve both styles before injecting values into workflow JSON.
- Prompt inputs must keep raw mention text in node metadata; expanded upstream text belongs only in the request context/result metadata. Writing expanded prompt back to config nodes overwrites the user's editable `@` reference placeholder.
- The red-box prompt panel can show duplicated `文本1` after one reference because adjacent display-label mentions are allowed to remain in the editable value. Cleanup should only collapse exact adjacent active mention labels, leaving non-adjacent repeated references untouched.
