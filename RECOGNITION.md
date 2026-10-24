# Appliance photos and reviewed electrical specifications

Housemates offers two separate local assistance steps: SigLIP suggests an appliance category (legacy three-type callers retain CLIP), and optional Tesseract OCR extracts draft nameplate text. Neither establishes a verified identity or measured consumption. The user chooses the category, reviews electrical and scheduling specifications, then explicitly confirms recruitment. Manual entry is always available. Photos map to existing category models, not custom 3D reconstructions.

## Pipeline and runtime

| Setting | Value |
| --- | --- |
| Package | `@huggingface/transformers` pinned to `4.3.1` |
| Pipeline | `zero-shot-image-classification` |
| Expanded catalog model | `Xenova/siglip-base-patch16-224` |
| Legacy three-type model | `Xenova/clip-vit-base-patch32` (unchanged) |
| Expanded model revision | `4649052661e53c7000355844105f8a1792088239` |
| Legacy model revision | `d15189d7028b43f1d3e65039190477f6af591c2a` |
| Precision/backend | `dtype: "q8"`, `device: "wasm"` |
| Execution | Dedicated module Web Worker, one WASM thread; no main-thread inference |
| ONNX Runtime Web in current lockfile | `1.31.0-dev.20260914-8d85527a0` |
| Expanded quantized model file | `onnx/model_quantized.onnx`, 210,977,441 bytes |
| Legacy quantized model file | 153,695,702 bytes |
| First-use download notice | Approximately 250 MB for the expanded catalog; 190 MB for legacy mode, including runtime/tokenizer files. Only the selected model loads. |

The implementation follows the [official pipeline API](https://huggingface.co/docs/transformers.js/api/pipelines), [quantized model options](https://huggingface.co/docs/transformers.js/guides/dtypes), and [worker-based Next.js example](https://huggingface.co/docs/transformers.js/tutorials/next). Package availability was checked against the [official 4.3.1 release](https://github.com/huggingface/transformers.js/releases/tag/4.3.1); model metadata and file size were checked in the [pinned SigLIP repository](https://huggingface.co/Xenova/siglip-base-patch16-224/tree/4649052661e53c7000355844105f8a1792088239/onnx). The [official model card](https://huggingface.co/Xenova/siglip-base-patch16-224) documents the Transformers.js zero-shot pipeline.

The worker is created only after **Suggest appliance on this device** is pressed. Selecting a photo alone starts no model download. The first run needs a network connection and a modern browser with Web Workers, WebAssembly, `createImageBitmap`, and `OffscreenCanvas`. Browser support, available memory, network policy, and download speed can prevent inference. Manual selection remains available.

The preview accepts supported raster photos up to 10 MB; decoding rejects images over 40 megapixels. Inside the worker, the image is resized proportionally to a maximum dimension of 512 pixels before the selected model’s own preprocessing. This category model does not read nameplates, infer wattage or perform model-number lookup. The separate optional OCR step below extracts text for review; it does not turn an image into trusted electrical settings.

## Candidate matching and abstention

The expanded recruitment mode supports ten categories: EV charging setup, dishwasher, air conditioner, washer, dryer, electric water heater, dehumidifier, robot vacuum, refrigerator and fan. Nine negative descriptions cover cooking/countertop appliances, space heaters and unrelated subjects. Its 19 descriptions live in `src/domain/applimon-recognition.ts`. The existing three-category mode remains available for legacy consumers: EV charger, dishwasher and air conditioner plus eleven negative descriptions in `src/domain/appliance-recognition.ts`. Both modes reuse the worker and category policy, but have separate pinned model configurations. Expanded mode uses SigLIP; legacy mode retains CLIP. Each scan loads only its selected model.

Descriptions distinguish overlapping categories: a dishwasher washes dishes, a washer washes laundry, and the unsupported small-appliance category specifies a countertop appliance. These are general semantic descriptions; no fixture image, filename, brand, or expected answer is hardcoded into inference.

SigLIP emits independent sigmoid scores. The expanded interpreter validates every raw label and value, then computes relative scores with a numerically stable softmax of log-odds; it never applies the CLIP sum-to-one check to raw sigmoid output. Raw values below the frozen 0.01 top-match floor lead to manual review. The displayed scores are **relative candidate matches, not calibrated probabilities**. A supported candidate must rank first, score at least 0.40, and exceed the runner-up by at least 0.15 to produce a suggestion. These are conservative prototype heuristics, not validated confidence levels. A negative winner produces an unsupported result; weak or close supported matches produce an uncertain result. Both leave the user with manual selection. Invalid, missing, duplicate, nonfinite, or inconsistent model output is rejected.

Even a strong suggestion leaves the confirmation button disabled until the user selects an appliance. Scores and alternative matches are available in an expandable explanation. The reviewed spec form supplies energy settings. Recognition scores never supply power or consumption. Explicitly chosen demo settings remain labeled as illustrative assumptions.

## Privacy, caching, and lifecycle

- Photos use local object URLs for preview and are passed as a `File`/`Blob` to the worker. Pixel decoding and inference happen locally. Photos are not uploaded, saved to household storage, or included in model-download requests.
- Public model/tokenizer files are downloaded from Hugging Face; the WASM runtime comes from the runtime CDN. These requests still expose ordinary connection metadata to those hosts. No account, API key, paid API, or inference endpoint is used.
- Browser model caching is enabled. Cached model/runtime files may reduce later downloads, subject to browser support, storage quota, and eviction. Offline operation is not guaranteed. Photos and recognition results are not cached by the application.
- Cancel, photo replacement, photo removal, confirmation, and unmount terminate the worker and invalidate its request ID. Late results cannot change a replacement photo's state. Preview URLs are revoked when replaced, removed, or unmounted.
- Downloads show file-level progress. Initialization and inference show separate status messages. Network/runtime errors and the five-minute timeout expose retry and manual paths. Cancellation does not erase model files already cached by the browser.

## Nameplate OCR and passport review

`applimon-spec-capture.tsx` implements a separate optional nameplate path using `tesseract.js` pinned to **7.0.0**. Selecting a photo does not initialize OCR. **Read label on this device** lazily loads the worker, WASM core and English language assets from public CDNs. The image remains in the browser; downloading runtime assets exposes ordinary connection metadata to the hosts. No account or paid inference API is required. See the [official Tesseract.js README](https://github.com/naptha/tesseract.js/blob/master/README.md), [worker API](https://github.com/naptha/tesseract.js/blob/master/docs/api.md) and [asset hosting documentation](https://github.com/naptha/tesseract.js/blob/master/docs/local-installation.md).

The nameplate picker accepts supported raster photos up to 10 MB and 16 megapixels. OCR produces editable draft text and optional candidate buttons. Pressing a candidate copies that value into an editable field; the user still reviews every field and confirms. Manual pasted label text is supported without OCR. No duration, brand, identity or scheduling window is silently inferred from text.

`nameplate.ts` extracts only explicit W/kW electrical power and possible per-task kWh. It is intentionally conservative:

- Annual, daily, per-100-cycle and weight-normalized energy are not offered as per-run consumption, including qualifiers on neighboring OCR lines.
- Thermal output/capacity labels suppress power candidates; voltage and current are not multiplied into real power.
- Ambiguous comma-separated numbers, out-of-range values and malformed inputs are rejected. Candidates are not certified readings; even clear text may be misread.
- Rated input is a limit, not necessarily operating average. If cycle energy is unknown, an explicit full-rated-power × duration estimate is available with its assumptions shown. It is never silently used as measured consumption.

A confirmed `ApplimonDevice` passport contains category ID, rated W, task kWh, duration, baseline, available start window, completion deadline, source (`manual`, `ocr-reviewed` or `demo-defaults`), energy basis and `confirmed: true`. Whole-hour timeline fields are bounded to 0–48; fractional task duration is allowed. Positive finite energy and rating must be physically consistent with duration. Structurally valid but impossible deadlines remain visible as planner infeasibility rather than being relaxed. Core settings and additional jobs use the shared deterministic arithmetic. AC, refrigerator and water heater remain protected; fan usage stays fixed.

A field/category change invalidates the form's review checkbox. Cancel, image replacement and unmount invalidate pending work and release previews; late worker initialization is terminated. OCR has a two-minute timeout with retry/manual fallback. Only the reviewed passport persists. Raw text, photos, candidate scores and worker output do not.

## Recruitment and phone handoff

Both onboarding photo setup and `/demo/scan` open specification review after category selection; a photo match alone does not add a device. The scan route merges confirmed specifications into the latest validated saved profile and upserts one device per category. It preserves the existing city, residence, team and planning mode. Missing or blocked storage is reported honestly; no unsaved preview is labeled a saved household.

A transfer URL contains only an allowed category ID. It is an untrusted suggestion: opening it cannot recruit, import specifications or approve a plan. The destination requires its own manual review. No cross-device household synchronization is implemented. On a phone, use the laptop's LAN address rather than `localhost`; browser camera availability may require HTTPS. File upload and manual entry remain available when camera capture or inference is unsupported.

## Verification evidence — October 24, 2026

Current scoped regressions cover all ten category mappings and abstention, validated passport fields, false-positive nameplate parsing, explicit review, local-only photo selection, cancellation, late worker startup, timeout, saved-profile merging and duplicate handling. Component tests execute actual source with browser/worker doubles; they are not physical-device or model-accuracy tests. The expanded ten-category candidate set has now been evaluated on a small, explicitly sourced corpus; see SCAN-PHOTO-EVALUATION.md for measured successes, failures and the limits of that evaluation.

The real Tesseract 7 engine was run against a generated **synthetic QA label**, reading `Electrical input: 2000 W` and `Energy per cycle: 0.70 kWh` correctly. This was a local engine smoke test, not a physical appliance photograph or browser-camera certification. Real nameplate accuracy, lighting tolerance and physical-phone capture have not been verified in this revision.

The following earlier smoke tests used the legacy three-category prompt set. They remain historical evidence only; candidate changes alter relative scores, so these results do not validate ten-category accuracy. EV-charger and AC accuracy were not benchmarked.

| Actual inference run | Observed result |
| --- | --- |
| Native CPU, pinned q8 model, dishwasher fixture | Dishwasher 0.97665; countertop appliance 0.01022; laundry machine 0.00678. Supported suggestion. |
| Browser WASM worker, same dishwasher fixture | Dishwasher approximately 0.967; laundry machine 0.016; countertop appliance 0.008. UI displayed **Suggested match: Dishwasher**. Confirmation remained disabled until manual selection. |
| Native CPU, pinned q8 model, tiger fixture | Animal 0.96648; person 0.01940. Unsupported/manual result. |
| Browser WASM worker, tiger fixture | Animal approximately 0.963; person 0.021; outdoor scene 0.004. UI displayed **No reliable supported match**. |

CPU and browser runs use different image-loading/resizing paths and runtimes, so exact score parity is not expected. None of these scores is a probability of correct identification.

The initial vague prompt set incorrectly preferred “small kitchen appliance” on the dishwasher fixture. Independent CPU replay reproduced the browser result. General descriptions were clarified across supported and unsupported classes, then both positive and negative fixtures were rerun. Acceptance thresholds and the mandatory-confirmation rule were unchanged.

Automated regression coverage in `tests/appliance-recognition.test.ts` checks supported/unsupported/ambiguous output, malformed scores, ordering, opt-in loading, absence of automatic selection, cancellation, stale photo results, network failure, timeout, retry, and unmount cleanup. The actual component is exercised with worker/hook test doubles; those tests do not replace the real inference runs above. The earlier three-category checkpoint passed its then-current 117-test suite and build. That is historical evidence, not acceptance of the current expanded release. Consult [PROGRESS.md](PROGRESS.md) for the latest combined gate and actual browser review.

## QA fixture attribution

These images were downloaded only to temporary local QA paths. They are **not bundled application assets** and are not uploaded by Housemates.

- Dishwasher: Carlos Paes, [Dishwasher open for loading.jpg, Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Dishwasher_open_for_loading.jpg). The Commons page records copyrighted free use with permission verification. [Original image](https://upload.wikimedia.org/wikipedia/commons/8/82/Dishwasher_open_for_loading.jpg). Temporary fixture: `/private/tmp/housemates-dishwasher-test.jpg`.
- Negative animal example: [tiger.jpg from the Hugging Face Transformers.js documentation dataset](https://huggingface.co/datasets/Xenova/transformers.js-docs/resolve/main/tiger.jpg), also used by the official zero-shot image-classification example. Temporary fixture: `/private/tmp/housemates-recognition-tiger.jpg`.

Recognition remains sensitive to framing, lighting, occlusion, candidate wording, and unfamiliar appliance designs. A clear photograph can still produce a wrong or unsupported result. User confirmation and the manual path are therefore permanent parts of the interaction.

## Focused scan-review update

The consumer flow now starts with camera/upload, offers a provisional photo-to-sprite reveal, and collects reviewed specifications in three short cards. The expanded classifier uses measured image detail to reject nearly blank inputs and route low-detail text images to manual review. The separate image-style comparison is advisory: product styling, drawings and backgrounds cannot veto an otherwise usable category match. Neither step authenticates photos. Visually confusable categories require explicit choice, and a vehicle image requires confirmation that it represents an EV or plug-in hybrid charging setup. The selected model is reused for both comparisons; one scan does not load both CLIP and SigLIP. See [SCAN-PHOTO-EVALUATION.md](SCAN-PHOTO-EVALUATION.md) and [SCAN-EVALUATION.md](SCAN-EVALUATION.md) for actual local-model results and limitations. Raw photos are never stored in household passports; a confirmed reveal is cosmetic and does not approve execution.

### Current model comparison and review limits

The expanded catalog switched to SigLIP only after actual same-image native CPU comparison: 30/31 new supported images had the correct top category, versus CLIP 25/31; six unsupported boundaries ranked unsupported, versus CLIP five. These are raw rankings, not accepted suggestions or calibrated accuracy. Two additional fresh laundry photos ranked correctly; this tiny holdout does not establish general performance. Drawings and text-overlaid images can still mislead semantic models. Measured low-detail checks, explicit family choices, weak-score review, and contradictory scene/category review are retained. An unrelated animal/person/outdoor scene check can request subject confirmation; cartoon or product styling alone cannot veto a match.

Native comparison used the installed runtime, pinned q8 weights and 512px white-background preprocessing. Browser canvas preprocessing now also fills white before painting transparent images. Native CPU timings and memory are not phone/WASM benchmarks. See [SCAN-PHOTO-EVALUATION.md](SCAN-PHOTO-EVALUATION.md) for the full corpus, original failures, frozen thresholds and final policy replay.
