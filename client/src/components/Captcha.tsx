import { useEffect, useRef, useCallback } from "react";
import { RefreshCw } from "lucide-react";

const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CAPTCHA_LENGTH = 5;

export function generateCaptchaCode(): string {
  return Array.from({ length: CAPTCHA_LENGTH }, () =>
    CHARS[Math.floor(Math.random() * CHARS.length)]
  ).join("");
}

interface CaptchaProps {
  code: string;
  onRefresh: () => void;
}

const PALETTE = ["#1a5c2e", "#0a3d1f", "#2d8a4e", "#145c35", "#006b30", "#0c4a26"];

export default function Captcha({ code, onRefresh }: CaptchaProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#f8fafc";
    ctx.fillRect(0, 0, W, H);

    // Background noise lines
    for (let i = 0; i < 7; i++) {
      ctx.beginPath();
      ctx.moveTo(Math.random() * W, Math.random() * H);
      ctx.bezierCurveTo(
        Math.random() * W, Math.random() * H,
        Math.random() * W, Math.random() * H,
        Math.random() * W, Math.random() * H
      );
      ctx.strokeStyle = `rgba(${Math.floor(Math.random() * 160)},${Math.floor(Math.random() * 160)},${Math.floor(Math.random() * 160)},0.18)`;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Dots noise
    for (let i = 0; i < 50; i++) {
      ctx.beginPath();
      ctx.arc(Math.random() * W, Math.random() * H, Math.random() * 1.5 + 0.5, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${Math.floor(Math.random() * 180)},${Math.floor(Math.random() * 180)},${Math.floor(Math.random() * 180)},0.25)`;
      ctx.fill();
    }

    // Draw characters
    const charW = W / (CAPTCHA_LENGTH + 1);
    code.split("").forEach((char, i) => {
      ctx.save();
      const x = charW * (i + 0.65) + charW * 0.25;
      const y = H / 2 + (Math.random() - 0.5) * 6;
      const rotation = (Math.random() - 0.5) * 0.5;
      const fontSize = 20 + Math.floor(Math.random() * 5);

      ctx.translate(x, y);
      ctx.rotate(rotation);

      ctx.font = `bold ${fontSize}px 'Courier New', monospace`;
      ctx.fillStyle = PALETTE[i % PALETTE.length];
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.shadowColor = "rgba(0,0,0,0.12)";
      ctx.shadowBlur = 3;
      ctx.shadowOffsetX = 1;
      ctx.shadowOffsetY = 1;
      ctx.fillText(char, 0, 0);
      ctx.restore();
    });

    // Subtle border
    ctx.strokeStyle = "#e2e8f0";
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, W - 1, H - 1);
  }, [code]);

  useEffect(() => {
    draw();
  }, [draw]);

  return (
    <div className="flex items-center gap-2">
      <canvas
        ref={canvasRef}
        width={176}
        height={52}
        style={{ borderRadius: "10px", userSelect: "none", cursor: "default", display: "block" }}
        data-testid="captcha-canvas"
      />
      <button
        type="button"
        onClick={onRefresh}
        title="Nouveau code"
        className="flex items-center justify-center w-10 h-10 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 hover:border-slate-300 hover:text-slate-700 transition-all duration-150 flex-shrink-0"
        data-testid="captcha-refresh"
      >
        <RefreshCw className="w-4 h-4" />
      </button>
    </div>
  );
}
