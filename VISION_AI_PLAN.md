# Vision AI Rollout Plan (plate + product)

Status: **planned, not started.** Code-grounded via deep review of both ends
(redbtn graph + webapp) on 2026-06-15. The graph neuron `become-gemma` is now
Gemini 2.5 Flash (multimodal), so vision needs no new neuron/key.

Goal: "Snap your plate" (photo → estimated foods + macros → log) and "Scan a
label" (label photo → product match → add), behind the existing AI seams, with
graceful degradation until the graph side is live.

## What already exists (the contract is done)
- Routes: `POST /api/ai/nutrition/plate` (`{image} → {ok, estimate} | {ok:false, unavailable}`)
  and `/api/ai/nutrition/product` (`{text?, image?} → {ok, matches} | unavailable`).
- Seam types (`lib/nutrition/aiSeams.ts`): `PlateEstimate { items:[{name, estimatedServing,
  nutrition:IMealNutrition, confidence}], total, caveats? }`, `ProductMatch { name, brand?,
  servingSize?, servingUnit?, nutrition, source }`.
- Client engine (`lib/nutrition/aiEngine.ts`): `plateEstimator.estimate` / `productFinder.find`
  — throw typed `PlateUnavailableError` / `ProductUnavailableError` on `{ok:false}`.
- `lib/imageResize.ts`: `resizeImageToBlob(file, {maxDim, quality, mimeType}) → Blob`.
- Logging: `POST /api/meal-logs` accepts **ad-hoc items with NO foodId** — `{name, servingSize,
  servingUnit, servings, nutrition}`; `PlateEstimate.items[].nutrition` IS `IMealNutrition` (exact match).

## Decisions locked by the code review (not preference)
1. **Image transport MUST be a base64 data URL** (`data:image/jpeg;base64,…`). The redbtn
   multimodal builder only emits `{type:'image_url', image_url:{url}}`, and `@langchain/google-genai`
   **rejects http URLs and bare base64** — requires a data URL. So "upload to blob, pass URL" is OUT.
2. **The real Phase-A blocker is attachments plumbing.** Dispatch detects the image and routes to
   the vision runner, but leaves it at `state.data.input.image`; the engine's multimodal builder reads
   `state.data.input.attachments[]`. Dispatch must convert `input.image → input.attachments:[{kind:'image',
   mimeType, url}]`, else the image silently never reaches Gemini.
3. **`imageResize.ts` returns a Blob, not base64** — need a new `lib/blobToBase64.ts` returning the
   FULL data URL (do not strip the prefix; the graph needs it).
4. **Plate→log is clean via ad-hoc items** — no Food doc required. `estimatedServing` is free text →
   collapse to `servingSize:1, servingUnit:'serving'`; `confidence` is display-only (no storage field).

## Phase A — Graph (redbtn agent). The only hard dependency.
- **Edit `become-dispatch`**: add a transform step building `input.attachments` from the incoming
  data-URL image (defensively prefix `data:image/jpeg;base64,` if raw; preserve any existing attachments).
- **Edit `become-vision-runner`**: replace the `vision_not_yet_available` stub with the
  *structured-runner* pattern — JSON-only system prompt + `become-gemma` neuron call with
  `multimodal:true` + brace-extraction parse → write `data.taskResult`. (Finalize already routes
  `data.taskResult → result`, so NO finalize change.)
- **Edit `become-tasks` registry**: both entries currently `schema:null` + placeholder prompts.
  Add Become-voiced prompts + schemas matching the seam types:
  - `nutrition.plateEstimate` → `{ items:[{name, estimatedServing, nutrition:{calories,protein,carbs,fats}, confidence}], total:{calories,protein,carbs,fats}, caveats:[string] }`
  - `nutrition.productFind` → `{ matches:[{name, brand?, servingSize?, servingUnit?, nutrition:{...}, source:"ai"}] }`
- **Verify live** with a real food photo + real label photo before any UI ships.
- Reference files: `multimodalMessage.js` (attachment source + part shape), `neuronExecutor.js`,
  `@langchain/google-genai/dist/utils/common.js` (data-URL requirement), nodes `become-dispatch`/
  `become-vision-runner`, namespace `become-tasks`.

## Phase B — Webapp plumbing
- New `lib/blobToBase64.ts` (FileReader.readAsDataURL → full data URL).
- Compress hard before send: `resizeImageToBlob` at ~1024px / ~0.6–0.7 quality, **target ≤500KB**
  (the base64 image is serialized into redbtn run-state + the SSE event list — big images bloat Redis).
- Convert `/api/ai/nutrition/plate` + `/product` to the **async durable run-store pattern** (so photo
  gens survive close/return + show the global activity pill).
- Add `userId` to the nutrition page (one `GET /api/auth/me`) for `NutritionAIContext`.

## Phase C — "Snap your plate" (flagship)
- New `components/nutrition/SnapPlateModal.tsx`: hidden `<input type="file" accept="image/*"
  capture="environment">` → resize → blobToBase64 → `plateEstimator.estimate` (durable) →
  **editable review list** (item, serving, macros, confidence chip; adjustable/removable; add-missing) →
  "Add to today". Honest "estimate" framing.
- Entry point: a `Camera` button next to the barcode icon in the nutrition search row
  (`app/dashboard/nutrition/page.tsx`), reusing the already-set `foodSearchTag` (which meal to log into).
- Map each item → `POST /api/meal-logs` item (reuse `handleAddFood`).

## Phase D — "Scan a label" (fast follow)
- New `components/nutrition/LabelPhotoPanel.tsx` inside `FoodSearchModal`, beside the barcode option →
  `productFinder.find({imageBase64})` → map `ProductMatch[]` into the existing result/`selectedFood`
  path (same as barcode success at `FoodSearchModal.tsx` ~384-391). Default missing `servingSize/unit`
  to `100 g`.

## Phase E — Verify e2e with real images, deploy.

## Risks / notes
- Redis/event bloat from base64 images → aggressive client compression (Phase B).
- Cost: Gemini bills image input tokens; auth-gated; consider a soft per-user rate limit if volume spikes.
- Everything stays behind the graceful `unavailable` path until Phase A is verified — nothing breaks mid-rollout.
- Apply the anti-slop principle (see AI_SLOP_OVERHAUL_PLAN): validate AI output at the seam; the model
  owns generative free-text, deterministic owns crafted structure.
