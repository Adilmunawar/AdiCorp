import { useCallback, useEffect, useRef, useState } from "react";
import { Eraser, Type } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const MAX_BYTES = 250_000;

/** Signature ink in the brand blue (read from the --primary token so it prints on white in any theme). */
function inkColor(): string {
  if (typeof window === "undefined") return "hsl(216 93% 37%)";
  const v = getComputedStyle(document.documentElement).getPropertyValue("--primary").trim();
  return v ? `hsl(${v})` : "hsl(216 93% 37%)";
}

/** Why a drawn signature is not acceptable, or null when it is (mirrors the server check, plus ink). */
export function signatureProblem(canvas: HTMLCanvasElement): string | null {
  const ctx = canvas.getContext("2d");
  if (!ctx) return "Your browser cannot draw signatures.";
  const { width, height } = canvas;
  const data = ctx.getImageData(0, 0, width, height).data;
  let ink = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] > 64) ink++;
  if (ink < 150) return "The box is empty. Sign in it with your finger or mouse.";
  if (ink / (width * height) > 0.5) return "That does not look like a signature. Clear it and sign again.";
  return null;
}

export interface SignaturePadProps {
  /** Called with a PNG data URL after each stroke, or null when cleared / not acceptable. */
  onChange: (png: string | null, problem: string | null) => void;
  /** Used by "Use my typed name". */
  typedName?: string;
  disabled?: boolean;
  className?: string;
}

/** A canvas you sign with a finger, pen or mouse. Exports a transparent PNG. */
export function SignaturePad({ onChange, typedName, disabled, className }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const scale = useRef(1);
  const [empty, setEmpty] = useState(true);

  // Size the backing store to the element (and pixel ratio, capped at 2) once mounted. The server
  // accepts images up to 2400 x 1200 pixels, so the ratio is also capped to stay inside that.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const ratio = Math.min(2, window.devicePixelRatio || 1, 2400 / Math.max(1, rect.width), 1200 / Math.max(1, rect.height));
    canvas.width = Math.max(200, Math.round(rect.width * ratio));
    canvas.height = Math.max(80, Math.round(rect.height * ratio));
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.scale(ratio, ratio);
      scale.current = ratio;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineWidth = 2.4;
      ctx.strokeStyle = inkColor();
    }
  }, []);

  const emit = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const problem = signatureProblem(canvas);
    if (problem) {
      onChange(null, problem);
      return;
    }
    const png = canvas.toDataURL("image/png");
    if (png.length * 0.75 > MAX_BYTES) {
      onChange(null, "That signature image is too large. Clear it and sign again.");
      return;
    }
    onChange(png, null);
  }, [onChange]);

  /** Drawing size in canvas units (the backing store over the scale it was set up with). */
  const drawingSize = (canvas: HTMLCanvasElement) => ({ width: canvas.width / scale.current, height: canvas.height / scale.current });

  // Map the pointer into canvas units, so strokes stay under the finger even if the box was
  // resized after mounting (phone rotated, window resized).
  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = e.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const size = drawingSize(canvas);
    return {
      x: ((e.clientX - rect.left) * size.width) / Math.max(1, rect.width),
      y: ((e.clientY - rect.top) * size.height) / Math.max(1, rect.height),
    };
  };

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    last.current = point(e);
    const ctx = e.currentTarget.getContext("2d");
    if (ctx && last.current) {
      ctx.beginPath();
      ctx.arc(last.current.x, last.current.y, 1.1, 0, Math.PI * 2);
      ctx.fillStyle = inkColor();
      ctx.fill();
    }
  };

  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current || disabled) return;
    const ctx = e.currentTarget.getContext("2d");
    const p = point(e);
    if (ctx && last.current) {
      ctx.beginPath();
      ctx.moveTo(last.current.x, last.current.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }
    last.current = p;
    if (empty) setEmpty(false);
  };

  const onUp = () => {
    if (!drawing.current) return;
    drawing.current = false;
    last.current = null;
    setEmpty(false);
    emit();
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    setEmpty(true);
    onChange(null, null);
  };

  const fillTypedName = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    const name = typedName?.trim();
    if (!canvas || !ctx || !name) return;
    clear();
    const rect = drawingSize(canvas);
    let size = Math.min(44, rect.height * 0.5);
    ctx.fillStyle = inkColor();
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    const font = (s: number) => `italic 600 ${s}px "Segoe Script", "Brush Script MT", "Snell Roundhand", cursive`;
    ctx.font = font(size);
    while (ctx.measureText(name).width > rect.width * 0.86 && size > 14) {
      size -= 2;
      ctx.font = font(size);
    }
    ctx.fillText(name, rect.width / 2, rect.height / 2);
    setEmpty(false);
    emit();
  };

  return (
    <div className={cn("space-y-2", className)}>
      <div className="relative overflow-hidden rounded-xl border-2 border-dashed border-primary/30 bg-background">
        <canvas
          ref={canvasRef}
          className={cn("block h-36 w-full touch-none sm:h-40", disabled ? "cursor-not-allowed opacity-60" : "cursor-crosshair")}
          aria-label="Signature pad. Draw your signature with a finger, pen or mouse."
          role="img"
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerLeave={onUp}
          onPointerCancel={onUp}
        />
        {empty && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="micro-label text-muted-foreground/70">Sign here</span>
          </div>
        )}
        <div className="pointer-events-none absolute bottom-6 left-6 right-6 border-b border-muted-foreground/25" aria-hidden />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5 rounded-lg text-xs" onClick={clear} disabled={disabled}>
          <Eraser className="h-3.5 w-3.5" aria-hidden /> Clear
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5 rounded-lg text-xs"
          onClick={fillTypedName}
          disabled={disabled || !typedName?.trim()}
        >
          <Type className="h-3.5 w-3.5" aria-hidden /> Use my typed name
        </Button>
      </div>
    </div>
  );
}
