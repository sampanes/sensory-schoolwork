import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from "react";

type Point = { x: number; y: number };
type GuideStyle = "none" | "primary-lines";

export interface WritingCanvasHandle {
  clear: () => void;
  getCanvas: () => HTMLCanvasElement | null;
}

interface WritingCanvasProps {
  /** When true, touch pointer events are rejected; only pen/mouse input draws. */
  penOnly?: boolean;
  /** When true, no drawing input is accepted. Non-canvas buttons remain usable. */
  disabled?: boolean;
  /** Called when the user begins a new stroke. */
  onStrokeStart?: () => void;
  /** Called when the user lifts the pen/pointer after a stroke. */
  onStrokeEnd?: () => void;
  /** Optional background guide treatment for early handwriting practice. */
  guideStyle?: GuideStyle;
  minLineWidth?: number;
  maxLineWidth?: number;
  /** Line width as a fraction of the canvas CSS width (clamped to min/max). */
  lineWidthFraction?: number;
  className?: string;
  ariaLabel?: string;
}

/**
 * A self-sizing drawing canvas that manages its own ResizeObserver and DPR
 * scaling. Expose a ref typed as `WritingCanvasHandle` to call `clear()` or
 * `getCanvas()` from the parent.
 */
const WritingCanvas = forwardRef<WritingCanvasHandle, WritingCanvasProps>(
  function WritingCanvas(
    {
      penOnly = false,
      disabled = false,
      onStrokeStart,
      onStrokeEnd,
      guideStyle = "none",
      minLineWidth = 5,
      maxLineWidth = 10,
      lineWidthFraction = 0.025,
      className,
      ariaLabel = "Handwriting canvas",
    },
    ref
  ) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const drawingRef = useRef(false);
    const lastPointRef = useRef<Point | null>(null);
    const activePointerIdRef = useRef<number | null>(null);
    const surfaceMetricsRef = useRef({ width: 280, height: 240, ratio: 1 });

    const paintSurface = useCallback((ctx: CanvasRenderingContext2D, width: number, height: number, ratio: number) => {
      ctx.save();
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
      ctx.restore();
    }, []);

    const clearSurface = useCallback(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const { width, height, ratio } = surfaceMetricsRef.current;
      paintSurface(ctx, width, height, ratio);
    }, [paintSurface]);

    useImperativeHandle(
      ref,
      () => ({
        clear: clearSurface,
        getCanvas: () => canvasRef.current,
      }),
      [clearSurface]
    );

    const resizeCanvas = useCallback(() => {
      const canvas = canvasRef.current;
      const parent = canvas?.parentElement;
      if (!canvas || !parent) return;

      const bounds = parent.getBoundingClientRect();
      const width = Math.max(bounds.width, 280);
      const height = Math.max(bounds.height, 240);
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const newWidth = Math.floor(width * ratio);
      const newHeight = Math.floor(height * ratio);
      if (canvas.width === newWidth && canvas.height === newHeight) return;

      canvas.width = newWidth;
      canvas.height = newHeight;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      surfaceMetricsRef.current = { width, height, ratio };

      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = "#0f172a";
      ctx.lineWidth = Math.max(minLineWidth, Math.min(maxLineWidth, width * lineWidthFraction));
      paintSurface(ctx, width, height, ratio);
    }, [lineWidthFraction, maxLineWidth, minLineWidth, paintSurface]);

    useEffect(() => {
      const canvas = canvasRef.current;
      const parent = canvas?.parentElement;
      if (!canvas || !parent) return;

      resizeCanvas();
      const observer = new ResizeObserver(() => resizeCanvas());
      observer.observe(parent);
      window.addEventListener("resize", resizeCanvas);
      return () => {
        observer.disconnect();
        window.removeEventListener("resize", resizeCanvas);
      };
    }, [resizeCanvas]);

    const getPoint = (e: React.PointerEvent<HTMLCanvasElement>): Point => {
      const rect = e.currentTarget.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    const isTouchBlocked = useCallback(
      (pointerType: string) => penOnly && pointerType === "touch",
      [penOnly]
    );

    const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (disabled) return;
      if (isTouchBlocked(e.pointerType)) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      const ctx = canvasRef.current?.getContext("2d");
      if (!ctx) return;

      drawingRef.current = true;
      activePointerIdRef.current = e.pointerId;
      lastPointRef.current = getPoint(e);
      onStrokeStart?.();

      const { x, y } = lastPointRef.current;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 0.01, y + 0.01);
      ctx.stroke();
      e.currentTarget.setPointerCapture(e.pointerId);
    };

    const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (isTouchBlocked(e.pointerType)) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (activePointerIdRef.current !== null && e.pointerId !== activePointerIdRef.current) return;
      if (!drawingRef.current) return;

      const ctx = canvasRef.current?.getContext("2d");
      const previousPoint = lastPointRef.current;
      if (!ctx || !previousPoint) return;

      const point = getPoint(e);
      ctx.beginPath();
      ctx.moveTo(previousPoint.x, previousPoint.y);
      ctx.lineTo(point.x, point.y);
      ctx.stroke();
      lastPointRef.current = point;
    };

    const finishStroke = (e?: React.PointerEvent<HTMLCanvasElement>) => {
      if (e && activePointerIdRef.current !== null && e.pointerId !== activePointerIdRef.current) {
        return;
      }
      if (!drawingRef.current) return;
      drawingRef.current = false;
      activePointerIdRef.current = null;
      lastPointRef.current = null;
      onStrokeEnd?.();
    };

    const swallowTouchEvent = (e: React.TouchEvent<HTMLCanvasElement>) => {
      if (!penOnly) return;
      e.preventDefault();
      e.stopPropagation();
    };

    return (
      <div className={`relative h-full w-full${className ? ` ${className}` : ""}`}>
        {guideStyle === "primary-lines" ? (
          <div className="pointer-events-none absolute inset-0 z-10">
            {/* Top Solid Line (Blue/Grey) */}
            <div className="absolute left-0 right-0 top-[15%] border-t-4 border-slate-300/40" />
            {/* Middle Dashed Line (Lighter Grey) */}
            <div className="absolute left-0 right-0 top-[50%] border-t-2 border-dashed border-slate-200/60" />
            {/* Bottom Solid Line (Blue/Grey) */}
            <div className="absolute left-0 right-0 bottom-[15%] border-b-4 border-slate-300/40" />
          </div>
        ) : null}
        <canvas
          ref={canvasRef}
          className="absolute inset-0 z-0 h-full w-full touch-none cursor-crosshair"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={finishStroke}
          onPointerCancel={finishStroke}
          onPointerLeave={finishStroke}
          onTouchStart={swallowTouchEvent}
          onTouchMove={swallowTouchEvent}
          onTouchEnd={swallowTouchEvent}
          aria-label={ariaLabel}
        />
      </div>
    );
  }
);

export default WritingCanvas;
