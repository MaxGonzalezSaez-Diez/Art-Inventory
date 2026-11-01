import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent
} from "react";
import {
  autoScanPainting,
  canvasToJpegDataUrl,
  canvasToPngDataUrl,
  defaultCorners,
  fullFrameCorners,
  orderCorners,
  warpPaintingPerspective,
  type Point
} from "./perspectiveCorrect";

import type { ImageEditSaveResult } from "./imageEditTypes";
export type { ImageEditSaveResult } from "./imageEditTypes";

type CropNorm = { x: number; y: number; w: number; h: number };
type DragMode =
  | "move"
  | "n"
  | "s"
  | "e"
  | "w"
  | "ne"
  | "nw"
  | "se"
  | "sw"
  | null;

const FULL_CROP: CropNorm = { x: 0, y: 0, w: 1, h: 1 };
const MIN_CROP = 0.08;

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("No se pudo cargar la imagen."));
    img.src = src;
  });
}

/** Bounding box for an arbitrary rotation (any degree, not just 90°). */
function rotatedSize(width: number, height: number, rotation: number) {
  const rad = ((rotation % 360) * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  return {
    width: Math.max(1, Math.ceil(width * cos + height * sin)),
    height: Math.max(1, Math.ceil(width * sin + height * cos))
  };
}

function drawRotated(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  rotation: number
) {
  const { width, height } = rotatedSize(
    image.naturalWidth,
    image.naturalHeight,
    rotation
  );
  ctx.clearRect(0, 0, width, height);
  ctx.save();
  ctx.translate(width / 2, height / 2);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);
  ctx.restore();
}

function normalizeDeg(value: number) {
  return ((value % 360) + 360) % 360;
}

function isFullFrame(corners: Point[], width: number, height: number) {
  const full = fullFrameCorners(width, height);
  return orderCorners(corners).every(
    (point, index) =>
      Math.abs(point.x - full[index].x) < 1 && Math.abs(point.y - full[index].y) < 1
  );
}

export function ImageEditModal({
  sourceDataUrl,
  mode = "upload",
  onCancel,
  onSave
}: {
  sourceDataUrl: string;
  /** upload = straighten first + keep original as extra; retouch = straighten first, no new original */
  mode?: "upload" | "retouch";
  onCancel: () => void;
  onSave: (result: ImageEditSaveResult) => void | Promise<void>;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const straightenStageRef = useRef<HTMLDivElement>(null);
  const [originalDataUrl] = useState(sourceDataUrl);
  const [step, setStep] = useState<"straighten" | "edit">("straighten");
  const [rawImage, setRawImage] = useState<HTMLImageElement | null>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [scannedPreview, setScannedPreview] = useState<string | null>(null);
  const [corners, setCorners] = useState<Point[] | null>(null);
  const [detected, setDetected] = useState(false);
  /** Corners were set to the whole photo (retouch start or «Toda la foto»). */
  const [showingFullPhoto, setShowingFullPhoto] = useState(false);
  /** Corner index, or edge between ordered corners i and (i+1)%4. */
  const [straightenDrag, setStraightenDrag] = useState<
    | { kind: "corner"; index: number; grabOffset: Point }
    | {
        kind: "edge";
        index: number;
        startPoint: Point;
        startCorners: Point[];
        /** true = move only X (vertical edge); false = only Y (horizontal). */
        horizontal: boolean;
      }
    | null
  >(null);
  const [detecting, setDetecting] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [quarterTurns, setQuarterTurns] = useState(0);
  const [fineDeg, setFineDeg] = useState(0);
  const rotation = normalizeDeg(quarterTurns * 90 + fineDeg);
  const [cropEnabled, setCropEnabled] = useState(false);
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [saturate, setSaturate] = useState(100);
  const [warmth, setWarmth] = useState(0);
  const [tint, setTint] = useState(0);
  const [exposure, setExposure] = useState(100);
  const [crop, setCrop] = useState<CropNorm>(FULL_CROP);
  const [drag, setDrag] = useState<DragMode>(null);
  const dragOrigin = useRef({ x: 0, y: 0, crop: FULL_CROP });
  const previewCornersRef = useRef<Point[] | null>(null);

  async function runAutoScan(img: HTMLImageElement, click?: Point | null) {
    setDetecting(true);
    setError("");
    setShowingFullPhoto(false);
    try {
      const result = autoScanPainting(img, click);
      previewCornersRef.current = result.corners;
      setCorners(result.corners);
      setDetected(result.detected);
      setScannedPreview(result.dataUrl);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "No se pudo detectar el cuadro."
      );
      const fallback = defaultCorners(img.naturalWidth, img.naturalHeight);
      setCorners(fallback);
      setDetected(false);
      setScannedPreview(null);
    } finally {
      setDetecting(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    setDetecting(true);
    loadImage(sourceDataUrl)
      .then(async (img) => {
        if (cancelled) return;
        setRawImage(img);
        // The current photo is usually already straightened and cropped, and
        // auto-detect would then find a shape inside the painting. Start from
        // the whole photo; tapping the painting still runs detection.
        if (mode === "retouch") {
          showFullPhoto(img);
          setDetecting(false);
        } else {
          await runAutoScan(img);
        }
      })
      .catch((caught) => {
        if (!cancelled) {
          setError(
            caught instanceof Error ? caught.message : "Error al cargar."
          );
          setDetecting(false);
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceDataUrl, mode]);

  // Keep the corrected preview in sync while the user drags corners/edges.
  useEffect(() => {
    if (step !== "straighten") return;
    if (!rawImage || !corners || straightenDrag != null || detecting) return;
    if (previewCornersRef.current === corners) return;
    const handle = window.setTimeout(() => {
      try {
        const canvas = warpPaintingPerspective(rawImage, orderCorners(corners));
        previewCornersRef.current = corners;
        setScannedPreview(canvasToPngDataUrl(canvas));
      } catch {
        setScannedPreview(null);
      }
    }, 120);
    return () => window.clearTimeout(handle);
  }, [rawImage, corners, straightenDrag, detecting, step]);

  const natural = image
    ? rotatedSize(image.naturalWidth, image.naturalHeight, rotation)
    : { width: 1, height: 1 };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !image || step !== "edit") return;
    canvas.width = natural.width;
    canvas.height = natural.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    drawRotated(ctx, image, rotation);
  }, [image, rotation, natural.width, natural.height, step]);

  const filterCss = [
    `brightness(${(brightness * exposure) / 100}%)`,
    `contrast(${contrast}%)`,
    `saturate(${saturate}%)`,
    `sepia(${warmth}%)`,
    `hue-rotate(${tint}deg)`
  ].join(" ");
  const filtersNeutral =
    brightness === 100 &&
    contrast === 100 &&
    saturate === 100 &&
    warmth === 0 &&
    tint === 0 &&
    exposure === 100;

  function resetAll() {
    setQuarterTurns(0);
    setFineDeg(0);
    setCropEnabled(false);
    setBrightness(100);
    setContrast(100);
    setSaturate(100);
    setWarmth(0);
    setTint(0);
    setExposure(100);
    setCrop(FULL_CROP);
  }

  function clientToNorm(
    clientX: number,
    clientY: number
  ): { x: number; y: number } {
    const stage = stageRef.current;
    if (!stage) return { x: 0, y: 0 };
    const rect = stage.getBoundingClientRect();
    return {
      x: clamp((clientX - rect.left) / rect.width, 0, 1),
      y: clamp((clientY - rect.top) / rect.height, 0, 1)
    };
  }

  function onPointerDown(
    modeHandle: DragMode,
    event: ReactPointerEvent<HTMLElement>
  ) {
    if (!cropEnabled) return;
    event.preventDefault();
    event.stopPropagation();
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
    const point = clientToNorm(event.clientX, event.clientY);
    dragOrigin.current = { x: point.x, y: point.y, crop: { ...crop } };
    setDrag(modeHandle);
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!drag || !cropEnabled) return;
    const point = clientToNorm(event.clientX, event.clientY);
    const dx = point.x - dragOrigin.current.x;
    const dy = point.y - dragOrigin.current.y;
    const start = dragOrigin.current.crop;

    setCrop(() => {
      if (drag === "move") {
        const w = start.w;
        const h = start.h;
        return {
          x: clamp(start.x + dx, 0, 1 - w),
          y: clamp(start.y + dy, 0, 1 - h),
          w,
          h
        };
      }

      let left = start.x;
      let top = start.y;
      let right = start.x + start.w;
      let bottom = start.y + start.h;

      if (drag.includes("e")) {
        right = clamp(start.x + start.w + dx, left + MIN_CROP, 1);
      }
      if (drag.includes("w")) {
        left = clamp(start.x + dx, 0, right - MIN_CROP);
      }
      if (drag.includes("s")) {
        bottom = clamp(start.y + start.h + dy, top + MIN_CROP, 1);
      }
      if (drag.includes("n")) {
        top = clamp(start.y + dy, 0, bottom - MIN_CROP);
      }

      return {
        x: left,
        y: top,
        w: right - left,
        h: bottom - top
      };
    });
  }

  function onPointerUp() {
    setDrag(null);
  }

  function clientToImagePoint(clientX: number, clientY: number): Point | null {
    const stage = straightenStageRef.current;
    if (!stage || !rawImage) return null;
    const rect = stage.getBoundingClientRect();
    // Allow the true edges (0 … width/height inclusive of last pixel).
    const maxX = Math.max(0, rawImage.naturalWidth - 1);
    const maxY = Math.max(0, rawImage.naturalHeight - 1);
    return {
      x: clamp(((clientX - rect.left) / rect.width) * rawImage.naturalWidth, 0, maxX),
      y: clamp(
        ((clientY - rect.top) / rect.height) * rawImage.naturalHeight,
        0,
        maxY
      )
    };
  }

  function onCornerPointerDown(
    index: number,
    event: ReactPointerEvent<HTMLButtonElement>
  ) {
    event.preventDefault();
    event.stopPropagation();
    if (!corners) return;
    const point = clientToImagePoint(event.clientX, event.clientY);
    if (!point) return;
    // Lock corner order for the whole drag so handles don't jump when
    // one corner crosses another.
    const ordered = orderCorners(corners).map((c) => ({ ...c }));
    setCorners(ordered);
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
    setStraightenDrag({
      kind: "corner",
      index,
      // Keep the ring from jumping to the cursor on first move.
      grabOffset: {
        x: ordered[index].x - point.x,
        y: ordered[index].y - point.y
      }
    });
  }

  function onEdgePointerDown(
    edgeIndex: number,
    event: ReactPointerEvent<HTMLButtonElement>
  ) {
    event.preventDefault();
    event.stopPropagation();
    if (!corners || !rawImage) return;
    const point = clientToImagePoint(event.clientX, event.clientY);
    if (!point) return;
    const ordered = orderCorners(corners);
    const a = ordered[edgeIndex];
    const b = ordered[(edgeIndex + 1) % 4];
    // Mostly-horizontal sides slide vertically; mostly-vertical sides slide
    // horizontally — like nudging a crop edge.
    const horizontal = Math.abs(b.x - a.x) < Math.abs(b.y - a.y);
    setCorners(ordered.map((c) => ({ ...c })));
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
    setStraightenDrag({
      kind: "edge",
      index: edgeIndex,
      startPoint: point,
      startCorners: ordered.map((c) => ({ ...c })),
      horizontal
    });
  }

  function onStraightenPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (straightenDrag == null || !rawImage) return;
    const point = clientToImagePoint(event.clientX, event.clientY);
    if (!point) return;
    if (straightenDrag.kind === "corner") {
      const maxX = rawImage.naturalWidth - 1;
      const maxY = rawImage.naturalHeight - 1;
      const { grabOffset, index } = straightenDrag;
      setCorners((current) => {
        if (!current) return current;
        // Do NOT re-order while dragging — that made the ring jump.
        const next = current.map((c) => ({ ...c }));
        next[index] = {
          x: clamp(point.x + grabOffset.x, 0, maxX),
          y: clamp(point.y + grabOffset.y, 0, maxY)
        };
        return next;
      });
      return;
    }
    const dx = point.x - straightenDrag.startPoint.x;
    const dy = point.y - straightenDrag.startPoint.y;
    const moveX = straightenDrag.horizontal ? dx : 0;
    const moveY = straightenDrag.horizontal ? 0 : dy;
    const i0 = straightenDrag.index;
    const i1 = (i0 + 1) % 4;
    const maxX = rawImage.naturalWidth - 1;
    const maxY = rawImage.naturalHeight - 1;
    setCorners(
      straightenDrag.startCorners.map((c, i) => {
        if (i !== i0 && i !== i1) return c;
        return {
          x: clamp(c.x + moveX, 0, maxX),
          y: clamp(c.y + moveY, 0, maxY)
        };
      })
    );
  }

  function onStraightenPointerUp() {
    setStraightenDrag(null);
    setCorners((current) => (current ? orderCorners(current) : current));
  }

  async function redetectAroundClick(clientX: number, clientY: number) {
    if (!rawImage || detecting || busy) return;
    const point = clientToImagePoint(clientX, clientY);
    if (!point) return;
    await runAutoScan(rawImage, point);
  }

  function showFullPhoto(img: HTMLImageElement) {
    // Full frame — no crop, all the way to the edges. The result is the
    // photo itself, so show it directly instead of re-warping.
    const full = fullFrameCorners(img.naturalWidth, img.naturalHeight);
    previewCornersRef.current = full;
    setCorners(full);
    setDetected(false);
    setShowingFullPhoto(true);
    setScannedPreview(originalDataUrl);
  }

  function resetCorners() {
    if (rawImage) showFullPhoto(rawImage);
  }

  async function acceptScannedAndEdit() {
    if (
      rawImage &&
      corners &&
      isFullFrame(corners, rawImage.naturalWidth, rawImage.naturalHeight)
    ) {
      // Nothing to straighten — keep the original pixels.
      skipStraighten();
      return;
    }
    setBusy(true);
    setError("");
    try {
      let preview = scannedPreview;
      if (!preview && rawImage && corners) {
        const canvas = warpPaintingPerspective(
          rawImage,
          orderCorners(corners)
        );
        preview = canvasToPngDataUrl(canvas);
        setScannedPreview(preview);
      }
      if (!preview) {
        skipStraighten();
        return;
      }
      const warped = await loadImage(preview);
      setImage(warped);
      resetAll();
      setStep("edit");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "No se pudo abrir el resultado."
      );
    } finally {
      setBusy(false);
    }
  }

  function skipStraighten() {
    if (!rawImage) return;
    setImage(rawImage);
    resetAll();
    setStep("edit");
  }

  async function save() {
    if (!image) return;
    setBusy(true);
    setError("");
    try {
      const rotationZero = normalizeDeg(rotation) === 0;
      const cropFull =
        !cropEnabled ||
        (crop.x <= 0.0001 &&
          crop.y <= 0.0001 &&
          crop.w >= 0.999 &&
          crop.h >= 0.999);
      // No color / crop / rotate edits → keep pixels already on the image.
      // Prefer the current bitmap’s data URL (post-straighten PNG) over another
      // canvas round-trip, which makes colors look a touch more intense.
      if (filtersNeutral && rotationZero && cropFull) {
        const passthrough =
          image === rawImage
            ? originalDataUrl
            : image.src.startsWith("data:")
              ? image.src
              : "";
        if (passthrough) {
          await onSave({
            editedDataUrl: passthrough,
            originalDataUrl,
            keepOriginalAsExtra:
              mode === "upload" && passthrough !== originalDataUrl
          });
          return;
        }
      }

      const rotated = document.createElement("canvas");
      rotated.width = natural.width;
      rotated.height = natural.height;
      // Default canvas (no forced colorSpace) — matches how <img> displays the file.
      const rctx = rotated.getContext("2d");
      if (!rctx) throw new Error("No se pudo preparar el lienzo.");
      // 1:1 copy — smoothing can add contrast/halo.
      rctx.imageSmoothingEnabled = false;
      if (!filtersNeutral) {
        rctx.fillStyle = "#ffffff";
        rctx.fillRect(0, 0, rotated.width, rotated.height);
      }
      drawRotated(rctx, image, rotation);

      const activeCrop = cropEnabled ? crop : FULL_CROP;
      const sx = Math.round(activeCrop.x * rotated.width);
      const sy = Math.round(activeCrop.y * rotated.height);
      const sw = Math.max(1, Math.round(activeCrop.w * rotated.width));
      const sh = Math.max(1, Math.round(activeCrop.h * rotated.height));

      const out = document.createElement("canvas");
      out.width = sw;
      out.height = sh;
      const octx = out.getContext("2d");
      if (!octx) throw new Error("No se pudo preparar el lienzo.");
      const scaling =
        sw !== rotated.width ||
        sh !== rotated.height ||
        sx !== 0 ||
        sy !== 0 ||
        !rotationZero;
      octx.imageSmoothingEnabled = scaling;
      octx.imageSmoothingQuality = "high";
      if (!filtersNeutral) {
        octx.fillStyle = "#ffffff";
        octx.fillRect(0, 0, sw, sh);
        octx.filter = filterCss;
      }
      octx.drawImage(rotated, sx, sy, sw, sh, 0, 0, sw, sh);
      octx.filter = "none";

      const dataUrl = filtersNeutral
        ? canvasToPngDataUrl(out)
        : canvasToJpegDataUrl(out, 0.98);
      await onSave({
        editedDataUrl: dataUrl,
        originalDataUrl,
        keepOriginalAsExtra: mode === "upload"
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo guardar.");
    } finally {
      setBusy(false);
    }
  }

  const orderedCorners = corners
    ? straightenDrag
      ? corners
      : orderCorners(corners)
    : null;

  return (
    <div className="modal-backdrop image-edit-backdrop" onClick={onCancel}>
      <div
        data-help-modal={step === "straighten" ? "photoStraighten" : "photoEdit"}
        className="modal image-edit-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <div>
            <h3>
              {step === "straighten"
                ? "Foto del cuadro"
                : "Editar foto"}
            </h3>
            <p className="muted small-note">
              {step === "straighten"
                ? "Toca el cuadro, arrastra una esquina, o desliza un lado."
                : "Puedes girar, recortar y ajustar color. Luego pulsa «Guardar foto»."}
            </p>
          </div>
          <button type="button" className="ghost small" onClick={onCancel}>
            Cerrar
          </button>
        </div>

        {step === "straighten" ? (
          <div className="image-edit-layout image-straighten-layout">
            <div className="image-edit-stage-wrap" data-help="photo-stage">
              {detecting ? (
                <div className="image-edit-loading">
                  Buscando el cuadro y corrigiendo…
                </div>
              ) : rawImage && orderedCorners ? (
                <div
                  className={`image-edit-stage image-straighten-stage${
                    straightenDrag ? " is-dragging" : ""
                  }`}
                  ref={straightenStageRef}
                  onPointerMove={onStraightenPointerMove}
                  onPointerUp={onStraightenPointerUp}
                  onPointerCancel={onStraightenPointerUp}
                  onClick={(event) => {
                    if (straightenDrag != null) return;
                    if (
                      (event.target as HTMLElement).closest(
                        ".image-straighten-handle, .image-straighten-edge"
                      )
                    ) {
                      return;
                    }
                    void redetectAroundClick(event.clientX, event.clientY);
                  }}
                >
                  <img
                    className="image-edit-canvas"
                    src={originalDataUrl}
                    alt=""
                    draggable={false}
                  />
                  <svg
                    className="image-straighten-overlay"
                    viewBox={`0 0 ${rawImage.naturalWidth} ${rawImage.naturalHeight}`}
                    preserveAspectRatio="none"
                  >
                    <polygon
                      className="image-straighten-quad"
                      points={orderedCorners
                        .map((p) => `${p.x},${p.y}`)
                        .join(" ")}
                    />
                  </svg>
                  {orderedCorners.map((point, index) => {
                    const next = orderedCorners[(index + 1) % 4];
                    const midX = (point.x + next.x) / 2;
                    const midY = (point.y + next.y) / 2;
                    const dx = next.x - point.x;
                    const dy = next.y - point.y;
                    const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
                    const horizontal = Math.abs(dx) < Math.abs(dy);
                    return (
                      <button
                        key={`edge-${index}`}
                        type="button"
                        className={`image-straighten-edge${
                          horizontal
                            ? " image-straighten-edge-v"
                            : " image-straighten-edge-h"
                        }`}
                        style={{
                          left: `${(midX / rawImage.naturalWidth) * 100}%`,
                          top: `${(midY / rawImage.naturalHeight) * 100}%`,
                          transform: `translate(-50%, -50%) rotate(${angleDeg}deg)`
                        }}
                        aria-label={`Lado ${index + 1}`}
                        onPointerDown={(event) =>
                          onEdgePointerDown(index, event)
                        }
                      />
                    );
                  })}
                  {(() => {
                    const maxX = Math.max(0, rawImage.naturalWidth - 1);
                    const maxY = Math.max(0, rawImage.naturalHeight - 1);
                    const edgePad = Math.max(
                      10,
                      Math.hypot(rawImage.naturalWidth, rawImage.naturalHeight) *
                        0.012
                    );
                    const cornerNames = ["tl", "tr", "br", "bl"] as const;
                    return orderedCorners.map((point, index) => {
                      // Keep handles on-image so overflow:hidden doesn’t clip
                      // them when corners sit on the true edges.
                      let hx = point.x;
                      let hy = point.y;
                      if (hx < edgePad) hx = Math.min(point.x + edgePad * 0.35, maxX);
                      if (hx > maxX - edgePad)
                        hx = Math.max(point.x - edgePad * 0.35, 0);
                      if (hy < edgePad) hy = Math.min(point.y + edgePad * 0.35, maxY);
                      if (hy > maxY - edgePad)
                        hy = Math.max(point.y - edgePad * 0.35, 0);
                      return (
                        <button
                          key={`corner-${index}`}
                          type="button"
                          className={`image-straighten-handle image-straighten-handle-${cornerNames[index]}`}
                          style={{
                            left: `${(hx / rawImage.naturalWidth) * 100}%`,
                            top: `${(hy / rawImage.naturalHeight) * 100}%`
                          }}
                          aria-label={`Esquina ${index + 1}`}
                          onPointerDown={(event) =>
                            onCornerPointerDown(index, event)
                          }
                        />
                      );
                    });
                  })()}
                </div>
              ) : (
                <div className="image-edit-loading">Cargando imagen…</div>
              )}
            </div>

            <div className="image-edit-stage-wrap image-straighten-result-wrap">
              {scannedPreview ? (
                <img
                  className="image-scan-result"
                  src={scannedPreview}
                  alt="Resultado"
                  draggable={false}
                />
              ) : (
                <div className="image-edit-loading">Vista corregida…</div>
              )}
            </div>

            <div className="image-straighten-footer">
              <p className="image-straighten-status">
                {detecting
                  ? "Detectando bordes…"
                  : detected
                    ? "Así quedará el cuadro. Si no acertó, toca el cuadro en la foto."
                    : showingFullPhoto
                      ? "Foto entera, sin recortar. Arrastra las esquinas o toca el cuadro para detectarlo."
                      : "No se encontró el cuadro. Tócalo en la foto o arrastra las esquinas."}
              </p>
              <div className="row-actions" style={{ flexWrap: "wrap", gap: "0.45rem" }}>
                <button
                  type="button"
                  className="ghost small"
                  data-help="photo-full"
                  disabled={!rawImage || busy}
                  onClick={resetCorners}
                >
                  Toda la foto (sin recortar)
                </button>
              </div>
              {error ? <p className="error-text">{error}</p> : null}
            </div>
          </div>
        ) : (
          <div className="image-edit-layout">
            <div className="image-edit-stage-wrap">
              {image ? (
                <div
                  className="image-edit-stage"
                  ref={stageRef}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  onPointerCancel={onPointerUp}
                >
                  <canvas
                    className="image-edit-canvas"
                    ref={canvasRef}
                    style={filtersNeutral ? undefined : { filter: filterCss }}
                  />
                  {cropEnabled ? (
                    <div
                      className="image-edit-crop"
                      style={{
                        left: `${crop.x * 100}%`,
                        top: `${crop.y * 100}%`,
                        width: `${crop.w * 100}%`,
                        height: `${crop.h * 100}%`
                      }}
                      onPointerDown={(event) => onPointerDown("move", event)}
                    >
                      <span
                        className="image-edit-handle n"
                        onPointerDown={(e) => onPointerDown("n", e)}
                      />
                      <span
                        className="image-edit-handle s"
                        onPointerDown={(e) => onPointerDown("s", e)}
                      />
                      <span
                        className="image-edit-handle e"
                        onPointerDown={(e) => onPointerDown("e", e)}
                      />
                      <span
                        className="image-edit-handle w"
                        onPointerDown={(e) => onPointerDown("w", e)}
                      />
                      <span
                        className="image-edit-handle nw"
                        onPointerDown={(e) => onPointerDown("nw", e)}
                      />
                      <span
                        className="image-edit-handle ne"
                        onPointerDown={(e) => onPointerDown("ne", e)}
                      />
                      <span
                        className="image-edit-handle sw"
                        onPointerDown={(e) => onPointerDown("sw", e)}
                      />
                      <span
                        className="image-edit-handle se"
                        onPointerDown={(e) => onPointerDown("se", e)}
                      />
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="image-edit-loading">Cargando imagen…</div>
              )}
            </div>

            <div className="image-edit-controls" data-help="photo-controls">
              <button
                type="button"
                className="ghost small"
                onClick={() => {
                  setStep("straighten");
                  setImage(null);
                }}
              >
                ← Volver a enderezar
              </button>
              <div className="image-edit-group">
                <span className="image-edit-label">Girar foto</span>
                <p className="muted small-note" style={{ margin: "0 0 0.4rem" }}>
                  90° si está de lado; la rueda de abajo ajusta grado a grado.
                </p>
                <div className="row-actions image-edit-rotate-row">
                  <button
                    type="button"
                    className="image-edit-rotate-btn"
                    onClick={() => {
                      setQuarterTurns((value) => (value + 3) % 4);
                      setFineDeg(0);
                      setCrop(FULL_CROP);
                    }}
                  >
                    ↶ 90°
                  </button>
                  <button
                    type="button"
                    className="image-edit-rotate-btn"
                    onClick={() => {
                      setQuarterTurns((value) => (value + 1) % 4);
                      setFineDeg(0);
                      setCrop(FULL_CROP);
                    }}
                  >
                    90° ↷
                  </button>
                  {(fineDeg !== 0 || quarterTurns !== 0) && (
                    <button
                      type="button"
                      className="ghost small"
                      onClick={() => {
                        setQuarterTurns(0);
                        setFineDeg(0);
                        setCrop(FULL_CROP);
                      }}
                    >
                      Restablecer
                    </button>
                  )}
                </div>
                <label className="image-edit-slider image-edit-rotate-wheel">
                  <span>
                    Ajuste fino · {fineDeg > 0 ? `+${fineDeg}` : fineDeg}°
                    {quarterTurns !== 0
                      ? `  (total ${Math.round(rotation)}°)`
                      : ""}
                  </span>
                  <input
                    type="range"
                    min={-45}
                    max={45}
                    step={1}
                    value={fineDeg}
                    onChange={(event) => setFineDeg(Number(event.target.value))}
                  />
                  <div className="rotate-wheel-track" aria-hidden>
                    <span>−45°</span>
                    <span>0°</span>
                    <span>+45°</span>
                  </div>
                </label>
                <span
                  className="image-edit-label"
                  style={{ marginTop: "0.75rem" }}
                >
                  Recorte
                </span>
                <div className="row-actions">
                  <button
                    type="button"
                    className={`ghost small${cropEnabled ? " on-chip" : ""}`}
                    onClick={() => {
                      setCropEnabled((value) => !value);
                      setCrop(FULL_CROP);
                    }}
                  >
                    {cropEnabled ? "Quitar recorte" : "Activar recorte"}
                  </button>
                </div>
              </div>

              <label className="image-edit-slider">
                <span>Exposición · {exposure}%</span>
                <input
                  type="range"
                  min={60}
                  max={140}
                  value={exposure}
                  onChange={(event) => setExposure(Number(event.target.value))}
                />
              </label>
              <label className="image-edit-slider">
                <span>Brillo · {brightness}%</span>
                <input
                  type="range"
                  min={50}
                  max={150}
                  value={brightness}
                  onChange={(event) => setBrightness(Number(event.target.value))}
                />
              </label>
              <label className="image-edit-slider">
                <span>Contraste · {contrast}%</span>
                <input
                  type="range"
                  min={50}
                  max={150}
                  value={contrast}
                  onChange={(event) => setContrast(Number(event.target.value))}
                />
              </label>
              <label className="image-edit-slider">
                <span>Saturación · {saturate}%</span>
                <input
                  type="range"
                  min={0}
                  max={200}
                  value={saturate}
                  onChange={(event) => setSaturate(Number(event.target.value))}
                />
              </label>
              <label className="image-edit-slider">
                <span>Calidez · {warmth}%</span>
                <input
                  type="range"
                  min={0}
                  max={60}
                  value={warmth}
                  onChange={(event) => setWarmth(Number(event.target.value))}
                />
              </label>
              <label className="image-edit-slider">
                <span>Tinte · {tint}°</span>
                <input
                  type="range"
                  min={-40}
                  max={40}
                  value={tint}
                  onChange={(event) => setTint(Number(event.target.value))}
                />
              </label>

              <button type="button" className="ghost small" onClick={resetAll}>
                Restablecer ajustes
              </button>

              {error ? <p className="error-text">{error}</p> : null}
            </div>
          </div>
        )}

        <div className="modal-actions">
          <button
            type="button"
            className="ghost"
            onClick={onCancel}
            disabled={busy}
          >
            Cancelar
          </button>
          {step === "straighten" ? (
            <>
              <button
                type="button"
                className="ghost"
                disabled={!rawImage || busy || detecting}
                onClick={skipStraighten}
              >
                Saltar
              </button>
              <button
                type="button"
                disabled={!rawImage || busy || detecting || (!scannedPreview && !corners)}
                onClick={() => void acceptScannedAndEdit()}
              >
                {busy ? "Preparando…" : "Usar esta foto"}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => void save()}
              disabled={!image || busy}
            >
              {busy ? "Guardando…" : "Guardar foto"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
