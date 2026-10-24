# Optional on-device appliance suggestions

Housemates can compare a local photo against supported appliance types using CLIP. This is working, optional browser inference—not a remote recognition API and not automatic device discovery. A suggestion never selects, adds, configures, or controls an appliance. The user must choose an appliance and confirm it.

## Pipeline and runtime

| Setting | Value |
| --- | --- |
| Package | `@huggingface/transformers` pinned to `4.3.1` |
| Pipeline | `zero-shot-image-classification` |
| Model | `Xenova/clip-vit-base-patch32` |
| Model revision | `d15189d7028b43f1d3e65039190477f6af591c2a` |
| Precision/backend | `dtype: "q8"`, `device: "wasm"` |
| Execution | Dedicated module Web Worker, one WASM thread; no main-thread inference |
| ONNX Runtime Web in current lockfile | `1.31.0-dev.20260914-8d85527a0` |
| Quantized model file | `onnx/model_quantized.onnx`, 153,695,702 bytes |
| First-use download notice | Approximately 190 MB including the model, runtime, tokenizer, and supporting files |

The implementation follows the [official pipeline API](https://huggingface.co/docs/transformers.js/api/pipelines), [quantized model options](https://huggingface.co/docs/transformers.js/guides/dtypes), and [worker-based Next.js example](https://huggingface.co/docs/transformers.js/tutorials/next). Package availability was checked against the [official 4.3.1 release](https://github.com/huggingface/transformers.js/releases/tag/4.3.1); model metadata and file size were checked in the [pinned model repository](https://huggingface.co/Xenova/clip-vit-base-patch32/tree/d15189d7028b43f1d3e65039190477f6af591c2a/onnx).

The worker is created only after **Suggest appliance on this device** is pressed. Selecting a photo alone starts no model download. The first run needs a network connection and a modern browser with Web Workers, WebAssembly, `createImageBitmap`, and `OffscreenCanvas`. Browser support, available memory, network policy, and download speed can prevent inference. Manual selection remains available.

The preview accepts supported raster photos up to 10 MB; decoding rejects images over 40 megapixels. Inside the worker, the image is resized proportionally to a maximum dimension of 512 pixels before CLIP's own preprocessing. No OCR, nameplate reading, wattage estimation, model-number lookup, or charging-power identification is performed.

## Candidate matching and abstention

The three supported classes are an EV charging station, a kitchen dishwasher, and an air-conditioning unit. Eleven negative candidates cover laundry machines, refrigerators, cooking appliances, countertop appliances, fans/heaters, rooms/furniture, people, animals, vehicles, outdoor scenes, and documents/screens. The exact descriptions live in `src/domain/appliance-recognition.ts`.

Descriptions distinguish overlapping categories: for example, a dishwasher washes dishes, while the unsupported small-appliance category specifies a countertop appliance. These are general semantic descriptions; no fixture image, filename, brand, or expected answer is hardcoded into inference.

The model scores are **relative candidate matches, not calibrated probabilities**. A supported candidate must rank first, score at least 0.40, and exceed the runner-up by at least 0.15 to produce a suggestion. These are conservative prototype heuristics, not validated confidence levels. A negative winner produces an unsupported result; weak or close supported matches produce an uncertain result. Both leave the user with manual selection. Invalid, missing, duplicate, nonfinite, or inconsistent model output is rejected.

Even a strong suggestion leaves the confirmation button disabled until the user selects an appliance. Scores and alternative matches are available in an expandable explanation. Energy settings continue to come from the household model and user input, never from the photo.

## Privacy, caching, and lifecycle

- Photos use local object URLs for preview and are passed as a `File`/`Blob` to the worker. Pixel decoding and inference happen locally. Photos are not uploaded, saved to household storage, or included in model-download requests.
- Public model/tokenizer files are downloaded from Hugging Face; the WASM runtime comes from the runtime CDN. These requests still expose ordinary connection metadata to those hosts. No account, API key, paid API, or inference endpoint is used.
- Browser model caching is enabled. Cached model/runtime files may reduce later downloads, subject to browser support, storage quota, and eviction. Offline operation is not guaranteed. Photos and recognition results are not cached by the application.
- Cancel, photo replacement, photo removal, confirmation, and unmount terminate the worker and invalidate its request ID. Late results cannot change a replacement photo's state. Preview URLs are revoked when replaced, removed, or unmounted.
- Downloads show file-level progress. Initialization and inference show separate status messages. Network/runtime errors and the five-minute timeout expose retry and manual paths. Cancellation does not erase model files already cached by the browser.

## Verification evidence — October 24, 2026

These observations are smoke tests, **not an accuracy benchmark across all three classes**. EV-charger and air-conditioner recognition have not been accuracy-benchmarked. Device/browser coverage is also limited; no physical-phone performance certification is claimed.

| Actual inference run | Observed result |
| --- | --- |
| Native CPU, pinned q8 model, dishwasher fixture | Dishwasher 0.97665; countertop appliance 0.01022; laundry machine 0.00678. Supported suggestion. |
| Browser WASM worker, same dishwasher fixture | Dishwasher approximately 0.967; laundry machine 0.016; countertop appliance 0.008. UI displayed **Suggested match: Dishwasher**. Confirmation remained disabled until manual selection. |
| Native CPU, pinned q8 model, tiger fixture | Animal 0.96648; person 0.01940. Unsupported/manual result. |
| Browser WASM worker, tiger fixture | Animal approximately 0.963; person 0.021; outdoor scene 0.004. UI displayed **No reliable supported match**. |

CPU and browser runs use different image-loading/resizing paths and runtimes, so exact score parity is not expected. None of these scores is a probability of correct identification.

The initial vague prompt set incorrectly preferred “small kitchen appliance” on the dishwasher fixture. Independent CPU replay reproduced the browser result. General descriptions were clarified across supported and unsupported classes, then both positive and negative fixtures were rerun. Acceptance thresholds and the mandatory-confirmation rule were unchanged.

Automated regression coverage in `tests/appliance-recognition.test.ts` checks supported/unsupported/ambiguous output, malformed scores, ordering, opt-in loading, absence of automatic selection, cancellation, stale photo results, network failure, timeout, retry, and unmount cleanup. The actual component is exercised with worker/hook test doubles; those tests do not replace the real inference runs above. At this checkpoint, the full 117-test suite, lint, TypeScript, and production build with worker bundling passed. Dependency audit reported no known vulnerabilities for the installed package set.

## QA fixture attribution

These images were downloaded only to temporary local QA paths. They are **not bundled application assets** and are not uploaded by Housemates.

- Dishwasher: Carlos Paes, [Dishwasher open for loading.jpg, Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Dishwasher_open_for_loading.jpg). The Commons page records copyrighted free use with permission verification. [Original image](https://upload.wikimedia.org/wikipedia/commons/8/82/Dishwasher_open_for_loading.jpg). Temporary fixture: `/private/tmp/housemates-dishwasher-test.jpg`.
- Negative animal example: [tiger.jpg from the Hugging Face Transformers.js documentation dataset](https://huggingface.co/datasets/Xenova/transformers.js-docs/resolve/main/tiger.jpg), also used by the official zero-shot image-classification example. Temporary fixture: `/private/tmp/housemates-recognition-tiger.jpg`.

Recognition remains sensitive to framing, lighting, occlusion, candidate wording, and unfamiliar appliance designs. A clear photograph can still produce a wrong or unsupported result. User confirmation and the manual path are therefore permanent parts of the interaction.
