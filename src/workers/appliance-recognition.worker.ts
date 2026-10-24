import { env, pipeline, RawImage } from "@huggingface/transformers";
import { RECOGNITION_CANDIDATES, RECOGNITION_MODEL, RECOGNITION_REVISION } from "../domain/appliance-recognition";
import { APPLIMON_RECOGNITION_CANDIDATES, APPLIMON_PHOTO_CANDIDATES, APPLIMON_MODEL, APPLIMON_MODEL_REVISION, APPLIMON_HYPOTHESIS_TEMPLATE } from "../domain/applimon-recognition";
import { analyzeApplianceImage } from "../domain/appliance-image-evidence";

// Browser-only worker. No inference endpoint and no photo upload.
env.allowLocalModels = false;
env.useBrowserCache = true;
env.backends.onnx.wasm!.numThreads = 1;
env.backends.onnx.wasm!.proxy = false;

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<{ requestId: number; photo: Blob; catalogMode?: boolean }>) => void) | null;
  postMessage: (message: unknown) => void;
};

scope.onmessage = async ({ data }) => {
  const { requestId, photo } = data;
  const send = (message: Record<string, unknown>) => scope.postMessage({ requestId, ...message });
  let classifier: Awaited<ReturnType<typeof makeClassifier>> | null = null;
  function makeClassifier() {
    return pipeline("zero-shot-image-classification", data.catalogMode === true ? APPLIMON_MODEL : RECOGNITION_MODEL, {
      revision: data.catalogMode === true ? APPLIMON_MODEL_REVISION : RECOGNITION_REVISION,
      dtype: "q8",
      device: "wasm",
      progress_callback: progress => {
        if (progress.status === "progress") send({ status: "download", file: progress.file, loaded: progress.loaded, total: progress.total, percent: progress.progress });
        else if (progress.status === "initiate") send({ status: "loading", message: "Opening model files…" });
        else if (progress.status === "done") send({ status: "loading", message: "Preparing the model on this device…" });
      },
    });
  }
  try {
    if (!(photo instanceof Blob) || !photo.size || photo.size > 10 * 1024 * 1024) throw new Error("Choose a photo no larger than 10 MB.");
    if (typeof createImageBitmap !== "function" || typeof OffscreenCanvas !== "function") throw new Error("This browser cannot process photos in a background worker. Please choose an appliance manually.");
    send({ status: "loading", message: "Reading your photo locally…" });
    const bitmap = await createImageBitmap(photo);
    let image: RawImage;
    try {
      if (bitmap.width * bitmap.height > 40_000_000) throw new Error("Choose a smaller photo (under 40 megapixels).");
      const ratio = Math.min(1, 512 / Math.max(bitmap.width, bitmap.height));
      const canvas = new OffscreenCanvas(Math.max(1, Math.round(bitmap.width * ratio)), Math.max(1, Math.round(bitmap.height * ratio)));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Photo processing is unavailable. Please choose manually.");
      // Match evaluated product-image preprocessing, including transparent PNGs.
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      image = RawImage.fromCanvas(canvas);
    } finally { bitmap.close(); }
    const imageEvidence = data.catalogMode === true ? analyzeApplianceImage(image) : undefined;
    send({ status: "loading", message: "Loading the on-device model. First use downloads model files…" });
    classifier = await makeClassifier();
    send({ status: "running", message: "Comparing appliance candidates on this device…" });
    const candidates=data.catalogMode===true?APPLIMON_RECOGNITION_CANDIDATES:RECOGNITION_CANDIDATES;
    const categoryLabels = candidates.map(candidate => candidate.label);
    const matches = data.catalogMode === true
      ? await classifier(image, categoryLabels, { hypothesis_template: APPLIMON_HYPOTHESIS_TEMPLATE })
      : await classifier(image, categoryLabels);
    if (data.catalogMode === true) {
      send({ status: "running", message: "Reviewing image detail and style…" });
      const photoMatches = await classifier(image, APPLIMON_PHOTO_CANDIDATES.map(candidate => candidate.label), { hypothesis_template: APPLIMON_HYPOTHESIS_TEMPLATE });
      send({ status: "complete", matches, photoMatches, imageEvidence });
    } else send({ status: "complete", matches });
  } catch (error) {
    send({ status: "error", message: error instanceof Error ? error.message.slice(0, 240) : "On-device recognition failed. Please retry or choose manually." });
  } finally {
    await classifier?.dispose();
  }
};
