import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent
} from "react";

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

function rotatedSize(width: number, height: number, rotation: number) {
  return rotation % 180 === 0
    ? { width, height }
    : { width: height, height: width };
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

export function ImageEditModal({
  sourceDataUrl,
  onCancel,
  onSave
}: {
  sourceDataUrl: string;
  onCancel: () => void;
  onSave: (dataUrl: string) => void | Promise<void>;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [rotation, setRotation] = useState(0);
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

  useEffect(() => {
    let cancelled = false;
    loadImage(sourceDataUrl)
      .then((img) => {
        if (!cancelled) setImage(img);
      })
      .catch((caught) => {
        if (!cancelled) {
          setError(
            caught instanceof Error ? caught.message : "Error al cargar."
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [sourceDataUrl]);

  const natural = image
    ? rotatedSize(image.naturalWidth, image.naturalHeight, rotation)
    : { width: 1, height: 1 };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !image) return;
    canvas.width = natural.width;
    canvas.height = natural.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    drawRotated(ctx, image, rotation);
  }, [image, rotation, natural.width, natural.height]);

  const filterCss = [
    `brightness(${(brightness * exposure) / 100}%)`,
    `contrast(${contrast}%)`,
    `saturate(${saturate}%)`,
    `sepia(${warmth}%)`,
    `hue-rotate(${tint}deg)`
  ].join(" ");

  function resetAll() {
    setRotation(0);
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
    mode: DragMode,
    event: ReactPointerEvent<HTMLElement>
  ) {
    if (!cropEnabled) return;
    event.preventDefault();
    event.stopPropagation();
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
    const point = clientToNorm(event.clientX, event.clientY);
    dragOrigin.current = { x: point.x, y: point.y, crop: { ...crop } };
    setDrag(mode);
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
      await onSave(dataUrl);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo guardar.");
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop image-edit-backdrop" onClick={onCancel}>
      <div
        className="modal image-edit-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <div>
            <h3>Editar foto</h3>
            <p className="muted small-note">
              Ajusta color y luz. El recorte es opcional (off al empezar). Luego
              «Guardar foto».
            </p>
          </div>
          <button type="button" className="ghost small" onClick={onCancel}>
            Cerrar
          </button>
        </div>

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
            <div className="image-edit-group">
              <span className="image-edit-label">Girar y recorte</span>
              <div className="row-actions">
                <button
                  type="button"
                  className="ghost small"
                  onClick={() => {
                    setRotation((value) => (value + 270) % 360);
                    setCrop(FULL_CROP);
                  }}
                >
                  ↶ 90°
                </button>
                <button
                  type="button"
                  className="ghost small"
                  onClick={() => {
                    setRotation((value) => (value + 90) % 360);
                    setCrop(FULL_CROP);
                  }}
                >
                  ↷ 90°
                </button>
                <button
                  type="button"
                  className={`ghost small${cropEnabled ? " on-chip" : ""}`}
                  onClick={() => {
                    setCropEnabled((value) => !value);
                    setCrop(FULL_CROP);
                  }}
                >
                  {cropEnabled ? "Quitar recorte" : "Recortar"}
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

        <div className="modal-actions">
          <button
            type="button"
            className="ghost"
            onClick={onCancel}
            disabled={busy}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={!image || busy}
          >
            {busy ? "Guardando…" : "Guardar foto"}
          </button>
        </div>
      </div>
    </div>
  );
}
