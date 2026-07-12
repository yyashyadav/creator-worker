// Bubble rendering tuned to match the browser DialogueBubble component exactly.
//
// The frontend renders bubbles with Tailwind's `text-sm` (14px / 1.625 line
// height), `px-4 py-3` (16px / 12px padding) inside a `max-w-[70%]` box whose
// positioning wrapper has an auto (shrink-to-fit) width. Because the wrapper's
// width isn't known ahead of time, browsers first size it to the *unwrapped*
// text width, then apply the 70% cap against that — producing a noticeably
// tighter/smaller bubble than a naive "70% of the frame" calculation would.
// We reproduce that same two-pass sizing here so bubbles wrap the same way
// (same line breaks, same compact footprint) as what shows up in the preview.
//
// All measurements below are CSS px values scaled from a representative
// preview frame width of 960px up to the 1920px render canvas (scale = 2).
const FONT_SIZE = 28;
const LINE_HEIGHT = 45.5; // 14px * 1.625 leading-relaxed, scaled
const PADDING_X = 32; // px-4 (16px), scaled
const PADDING_Y = 24; // py-3 (12px), scaled
const BORDER_WIDTH = 2; // 1px border, scaled
const MAX_WIDTH_FACTOR = 0.7; // Tailwind max-w-[70%]
const MIN_CONTENT_WIDTH = FONT_SIZE * 2;

const FONT = `400 ${FONT_SIZE}px system-ui, -apple-system, "Segoe UI", sans-serif`;
const FONT_BOLD = `700 ${FONT_SIZE}px system-ui, -apple-system, "Segoe UI", sans-serif`;
const FONT_ITALIC = `italic 400 ${FONT_SIZE}px system-ui, -apple-system, sans-serif`;

function wrapText(ctx, text, maxWidth) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";

  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }

  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

// Mirrors the frontend's accidental-but-consistent double-shrink sizing:
// the wrapper first sizes to the unwrapped text, then the 70% max-width caps
// that, and only then does the text re-wrap into the narrower box.
function layoutBubble(ctx, text, font) {
  ctx.font = font;
  const naturalWidth = ctx.measureText(text).width;
  const w1 = naturalWidth + PADDING_X * 2;
  const cappedContentWidth = Math.max(
    MAX_WIDTH_FACTOR * w1 - PADDING_X * 2,
    MIN_CONTENT_WIDTH
  );

  const lines = wrapText(ctx, text, cappedContentWidth);
  const widestLine = Math.max(...lines.map((line) => ctx.measureText(line).width));

  const width = widestLine + PADDING_X * 2 + BORDER_WIDTH;
  const height = lines.length * LINE_HEIGHT + PADDING_Y * 2 + BORDER_WIDTH;
  return { lines, width, height };
}

function drawRoundedRect(ctx, x, y, w, h, radius) {
  const r = Math.max(0, Math.min(radius, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// speech tail: a 16px (scaled) square rotated 45deg, only its bottom-right
// edges are visible — matches `-bottom-2 left-8 h-4 w-4 rotate-45 border-b
// border-r bg-white`.
function drawSpeechTail(ctx, bx, by, bw, bh, fill, stroke) {
  const size = 16 * 2;
  const cx = bx + Math.min(32 * 2, bw * 0.3) + size / 2;
  const cy = by + bh - size / 2 + 4;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(Math.PI / 4);
  ctx.fillStyle = fill;
  ctx.fillRect(-size / 2, -size / 2, size, size);
  ctx.strokeStyle = stroke;
  ctx.lineWidth = BORDER_WIDTH;
  ctx.beginPath();
  ctx.moveTo(-size / 2, size / 2);
  ctx.lineTo(size / 2, size / 2);
  ctx.lineTo(size / 2, -size / 2);
  ctx.stroke();
  ctx.restore();
}

// shout tail: same square-rotated-45 shape but fully filled (amber gradient)
// and slightly higher, matching `-bottom-3 left-8 h-4 w-4 rotate-45`.
function drawShoutTail(ctx, bx, by, bw, bh, fill, stroke) {
  const size = 16 * 2;
  const cx = bx + Math.min(32 * 2, bw * 0.3) + size / 2;
  const cy = by + bh - size / 2 + 6;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(Math.PI / 4);
  ctx.beginPath();
  ctx.moveTo(0, size / 2);
  ctx.lineTo(-size / 2, -size / 2);
  ctx.lineTo(size / 2, -size / 2);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = BORDER_WIDTH;
  ctx.stroke();
  ctx.restore();
}

// thought tail: three shrinking circles trailing down-left from the bubble,
// matching `-bottom-5 left-6` with 10px/8px/6px (scaled) dots.
function drawThoughtDots(ctx, bx, by, bw, bh) {
  const startX = bx + Math.min(24 * 2, bw * 0.25);
  const startY = by + bh;
  const dots = [
    { r: 10, dx: 0, dy: 10 },
    { r: 8, dx: -20, dy: 26 },
    { r: 6, dx: -34, dy: 40 },
  ];

  ctx.fillStyle = "rgba(255,255,255,0.95)";
  ctx.strokeStyle = "#e4e4e7";
  ctx.lineWidth = BORDER_WIDTH * 0.75;

  for (const dot of dots) {
    ctx.beginPath();
    ctx.arc(startX + dot.dx, startY + dot.dy, dot.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
}

function fillGradient(ctx, x, y, w, h, from, to, vertical = true) {
  const gradient = vertical
    ? ctx.createLinearGradient(0, y, 0, y + h)
    : ctx.createLinearGradient(x, y, x + w, y + h);
  gradient.addColorStop(0, from);
  gradient.addColorStop(1, to);
  return gradient;
}

function drawLines(ctx, lines, x, y) {
  lines.forEach((line, i) => {
    ctx.fillText(line, x + PADDING_X, y + PADDING_Y + FONT_SIZE * 0.92 + i * LINE_HEIGHT);
  });
}

export function measureBubble(ctx, text, shape) {
  const font = shape === "shout" ? FONT_BOLD : shape === "whisper" ? FONT_ITALIC : FONT;
  const drawText = shape === "shout" ? text.toUpperCase() : text;
  return layoutBubble(ctx, drawText, font);
}

export function drawDialogueBubble(ctx, text, shape, centerX, centerY, opacity) {
  if (!text) return;

  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.textBaseline = "alphabetic";

  const isShout = shape === "shout";
  const isWhisper = shape === "whisper";
  const drawText = isShout ? text.toUpperCase() : text;
  const font = isShout ? FONT_BOLD : isWhisper ? FONT_ITALIC : FONT;

  const { lines, width, height } = layoutBubble(ctx, drawText, font);
  const x = centerX - width / 2;
  const y = centerY - height / 2;

  ctx.font = font;

  // Caption — dark narration box (rounded-md, no tail).
  if (shape === "caption") {
    ctx.shadowColor = "rgba(0,0,0,0.35)";
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 6;
    ctx.fillStyle = fillGradient(ctx, x, y, width, height, "rgba(24,24,27,0.95)", "rgba(9,9,11,0.95)");
    drawRoundedRect(ctx, x, y, width, height, 12);
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.strokeStyle = "#3f3f46";
    ctx.lineWidth = BORDER_WIDTH;
    drawRoundedRect(ctx, x, y, width, height, 12);
    ctx.stroke();

    ctx.fillStyle = "#ffffff";
    drawLines(ctx, lines, x, y);
    ctx.restore();
    return;
  }

  // Shout — bold amber bubble with a rotated-square tail.
  if (shape === "shout") {
    ctx.shadowColor = "rgba(245,158,11,0.35)";
    ctx.shadowBlur = 22;
    ctx.shadowOffsetY = 8;
    ctx.fillStyle = fillGradient(ctx, x, y, width, height, "#fef3c7", "#fde68a", false);
    drawRoundedRect(ctx, x, y, width, height, 20);
    ctx.fill();
    ctx.shadowColor = "transparent";

    drawShoutTail(ctx, x, y, width, height, "#fde68a", "#f59e0b");

    ctx.strokeStyle = "#fbbf24";
    ctx.lineWidth = BORDER_WIDTH;
    drawRoundedRect(ctx, x, y, width, height, 20);
    ctx.stroke();

    ctx.fillStyle = "#451a03";
    drawLines(ctx, lines, x, y);
    ctx.restore();
    return;
  }

  // Speech / Thought / Whisper — light bubbles, shared base style.
  ctx.shadowColor = "rgba(24,24,27,0.18)";
  ctx.shadowBlur = 16;
  ctx.shadowOffsetY = 6;
  ctx.fillStyle = isWhisper ? "rgba(255,255,255,0.85)" : fillGradient(ctx, x, y, width, height, "#ffffff", "#fafafa");
  ctx.strokeStyle = isWhisper ? "#a1a1aa" : "#e4e4e7";
  ctx.lineWidth = BORDER_WIDTH;
  ctx.setLineDash(isWhisper ? [10, 8] : []);

  const radius = shape === "thought" ? 64 : shape === "speech" ? 32 : 9999;
  drawRoundedRect(ctx, x, y, width, height, radius);
  ctx.fill();
  ctx.shadowColor = "transparent";
  drawRoundedRect(ctx, x, y, width, height, radius);
  ctx.stroke();
  ctx.setLineDash([]);

  if (shape === "speech") {
    drawSpeechTail(ctx, x, y, width, height, "#ffffff", "#e4e4e7");
  }

  if (shape === "thought") {
    drawThoughtDots(ctx, x, y, width, height);
  }

  ctx.fillStyle = isWhisper ? "#52525b" : "#27272a";
  drawLines(ctx, lines, x, y);

  ctx.restore();
}
