import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent
} from "react";
import {
  autoScanPainting,
  canvasToJpegDataUrl,
  defaultCorners,
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

export function ImageEditModal({
  sourceDataUrl,
  mode = "upload",
  onCancel,
  onSave
}: {
  sourceDataUrl: string;
  /** upload = straighten first + keep original as extra; retouch = edit only */
  mode?: "upload" | "retouch";
  onCancel: () => void;
  onSave: (result: ImageEditSaveResult) => void | Promise<void>;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const straightenStageRef = useRef<HTMLDivElement>(null);
  const [originalDataUrl] = useState(sourceDataUrl);
  const [step, setStep] = useState<"straighten" | "edit">(
    mode === "upload" ? "straighten" : "edit"
  );
  const [rawImage, setRawImage] = useState<HTMLImageElement | null>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [scannedPreview, setScannedPreview] = useState<string | null>(null);
  const [corners, setCorners] = useState<Point[] | null>(null);
  const [detected, setDetected] = useState(false);
  const [cornerDrag, setCornerDrag] = useState<number | null>(null);
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
        if (mode === "retouch") {
          setImage(img);
          setDetecting(false);
          return;
        }
        await runAutoScan(img);
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

  // Keep the corrected preview in sync while the user drags corners.
  useEffect(() => {
    if (step !== "straighten") return;
    if (!rawImage || !corners || cornerDrag != null || detecting) return;
    if (previewCornersRef.current === corners) return;
    const handle = window.setTimeout(() => {
      try {
        const canvas = warpPaintingPerspective(rawImage, orderCorners(corners));
        previewCornersRef.current = corners;
        setScannedPreview(canvasToJpegDataUrl(canvas));
      } catch {
        setScannedPreview(null);
      }
    }, 120);
    return () => window.clearTimeout(handle);
  }, [rawImage, corners, cornerDrag, detecting, step]);

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
    return {
      x: clamp(
        ((clientX - rect.left) / rect.width) * rawImage.naturalWidth,
        0,
        rawImage.naturalWidth - 1
      ),
      y: clamp(
        ((clientY - rect.top) / rect.height) * rawImage.naturalHeight,
        0,
        rawImage.naturalHeight - 1
      )
    };
  }

  function onCornerPointerDown(
    index: number,
    event: ReactPointerEvent<HTMLButtonElement>
  ) {
    event.preventDefault();
    event.stopPropagation();
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
    setCornerDrag(index);
  }

  function onStraightenPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (cornerDrag == null || !corners) return;
    const point = clientToImagePoint(event.clientX, event.clientY);
    if (!point) return;
    setCorners((current) => {
      if (!current) return current;
      const next = current.map((c) => ({ ...c }));
      next[cornerDrag] = point;
      return next;
    });
  }

  function onStraightenPointerUp() {
    setCornerDrag(null);
  }

  async function redetectAroundClick(clientX: number, clientY: number) {
    if (!rawImage || detecting || busy) return;
    const point = clientToImagePoint(clientX, clientY);
    if (!point) return;
    await runAutoScan(rawImage, point);
  }

  function resetCorners() {
    if (!rawImage) return;
    setCorners(defaultCorners(rawImage.naturalWidth, rawImage.naturalHeight));
    setDetected(false);
  }

  async function acceptScannedAndEdit() {
    setBusy(true);
    setError("");
    try {
      let preview = scannedPreview;
      if (!preview && rawImage && corners) {
        const canvas = warpPaintingPerspective(
          rawImage,
          orderCorners(corners)
        );
        preview = canvasToJpegDataUrl(canvas);
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
      const rotated = document.createElement("canvas");
      rotated.width = natural.width;
      rotated.height = natural.height;
      const rctx = rotated.getContext("2d");
      if (!rctx) throw new Error("No se pudo preparar el lienzo.");
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
      octx.filter = filterCss;
      octx.drawImage(rotated, sx, sy, sw, sh, 0, 0, sw, sh);
      octx.filter = "none";

      const dataUrl = out.toDataURL("image/jpeg", 0.92);
      await onSave({
        editedDataUrl: dataUrl,
        originalDataUrl,
        keepOriginalAsExtra: mode === "upload"
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo guardar.");
      setBusy(false);
    }
  }

  const orderedCorners = corners ? orderCorners(corners) : null;

  return (
    <div className="modal-backdrop image-edit-backdrop" onClick={onCancel}>
      <div
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
                ? "Toca el cuadro en la foto para detectarlo, o arrastra las esquinas."
                : "Puedes girar, recortar y ajustar color. Luego pulsa «Guardar foto»."}
            </p>
          </div>
          <button type="button" className="ghost small" onClick={onCancel}>
            Cerrar
          </button>
        </div>

        {step === "straighten" ? (
          <div className="image-edit-layout">
            <div className="image-edit-stage-wrap">
              {detecting ? (
                <div className="image-edit-loading">
                  Buscando el cuadro y corrigiendo…
                </div>
              ) : rawImage && orderedCorners ? (
                <div
                  className="image-edit-stage image-straighten-stage"
                  ref={straightenStageRef}
                  style={{
                    aspectRatio: `${rawImage.naturalWidth} / ${rawImage.naturalHeight}`
                  }}
                  onPointerMove={onStraightenPointerMove}
                  onPointerUp={onStraightenPointerUp}
                  onPointerCancel={onStraightenPointerUp}
                  onClick={(event) => {
                    if (cornerDrag != null) return;
                    if (
                      (event.target as HTMLElement).closest(
                        ".image-straighten-handle"
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
                  {orderedCorners.map((point, index) => (
                    <button
                      key={index}
                      type="button"
                      className="image-straighten-handle"
                      style={{
                        left: `${(point.x / rawImage.naturalWidth) * 100}%`,
                        top: `${(point.y / rawImage.naturalHeight) * 100}%`
                      }}
                      aria-label={`Esquina ${index + 1}`}
                      onPointerDown={(event) =>
                        onCornerPointerDown(index, event)
                      }
                    />
                  ))}
                </div>
              ) : (
                <div className="image-edit-loading">Cargando imagen…</div>
              )}
            </div>

            <div className="image-edit-controls">
              <p className="image-straighten-status">
                {detecting
                  ? "Detectando bordes…"
                  : detected
                    ? "Así quedará el cuadro. Si no acertó, toca el cuadro en la foto."
                    : "No se encontró el cuadro. Tócalo en la foto o arrastra las esquinas."}
              </p>
              {scannedPreview ? (
                <img
                  className="image-scan-result"
                  src={scannedPreview}
                  alt="Resultado"
                  draggable={false}
                />
              ) : null}
              <div className="row-actions" style={{ flexWrap: "wrap", gap: "0.45rem" }}>
                <button
                  type="button"
                  className="ghost small"
                  disabled={!rawImage || busy}
                  onClick={resetCorners}
                >
                  Toda la foto
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
                  style={{ aspectRatio: `${natural.width} / ${natural.height}` }}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  onPointerCancel={onPointerUp}
                >
                  <canvas
                    className="image-edit-canvas"
                    ref={canvasRef}
                    style={{ filter: filterCss }}
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

            <div className="image-edit-controls">
              {mode === "upload" ? (
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
              ) : null}
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
