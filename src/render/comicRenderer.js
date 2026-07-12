import fs from "fs";
import path from "path";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "ffmpeg-static";
import { getCharacterOpacity, getTypedDialogue } from "./animations.js";
import { drawDialogueBubble } from "./drawBubble.js";

ffmpeg.setFfmpegPath(ffmpegPath);

const WIDTH = parseInt(process.env.RENDER_WIDTH || "1920", 10);
const HEIGHT = parseInt(process.env.RENDER_HEIGHT || "1080", 10);
const FPS = parseInt(process.env.RENDER_FPS || "30", 10);

function drawBackground(ctx) {
  const gradient = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  gradient.addColorStop(0, "#e0f2fe");
  gradient.addColorStop(1, "#f0f9ff");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
}

function drawCharacter(ctx, image, position, opacity) {
  if (!image) return;

  // Mirrors the frontend's `h-full max-w-full object-contain` behavior:
  // scale the image to fill the frame (upscale small images too, not just downscale).
  const maxH = HEIGHT;
  const maxW = WIDTH;
  const scale = Math.min(maxH / image.height, maxW / image.width);
  const w = image.width * scale;
  const h = image.height * scale;

  let x;
  if (position === "left") x = WIDTH * 0.03;
  else if (position === "right") x = WIDTH - w - WIDTH * 0.03;
  else x = (WIDTH - w) / 2;

  const y = (HEIGHT - h) / 2;

  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.drawImage(image, x, y, w, h);
  ctx.restore();
}

async function loadSceneImage(url, cache) {
  if (!url) return null;
  if (cache.has(url)) return cache.get(url);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${url}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const image = await loadImage(buffer);
  cache.set(url, image);
  return image;
}

function drawFrame(ctx, scene, image, progress) {
  drawBackground(ctx);

  const fadeIn = scene.animation?.in || "fadeIn";
  const fadeOut = scene.animation?.out || "fadeOut";
  const textEffect = scene.animation?.textEffect || "typing";
  const opacity = getCharacterOpacity(progress, scene.duration, fadeIn, fadeOut);
  const dialogue = getTypedDialogue(
    scene.dialogue || "",
    progress,
    scene.duration,
    textEffect
  );

  drawCharacter(ctx, image, scene.position || "center", opacity);

  if (dialogue) {
    const pos = scene.dialoguePosition || { x: 50, y: 18 };
    const centerX = (pos.x / 100) * WIDTH;
    const centerY = (pos.y / 100) * HEIGHT;
    drawDialogueBubble(
      ctx,
      dialogue,
      scene.dialogueShape || "speech",
      centerX,
      centerY,
      opacity
    );
  }
}

async function encodeFrames(framesDir, outputPath) {
  await new Promise((resolve, reject) => {
    ffmpeg()
      .input(path.join(framesDir, "frame_%06d.png"))
      .inputFPS(FPS)
      .outputOptions(["-pix_fmt", "yuv420p", "-c:v", "libx264", "-preset", "fast"])
      .save(outputPath)
      .on("end", resolve)
      .on("error", reject);
  });
}

export async function renderComicVideo(scenes, outputPath, onProgress) {
  const framesDir = path.join(path.dirname(outputPath), `frames-${Date.now()}`);
  fs.mkdirSync(framesDir, { recursive: true });

  const imageCache = new Map();
  const totalFrames = scenes.reduce((sum, scene) => sum + Math.ceil(scene.duration * FPS), 0);
  let frameIndex = 0;

  try {
    for (const scene of scenes) {
      const image = await loadSceneImage(scene.characterImageUrl, imageCache);
      const sceneFrames = Math.ceil(scene.duration * FPS);

      for (let i = 0; i < sceneFrames; i += 1) {
        const progress = Math.min(i / sceneFrames, 0.999);
        const canvas = createCanvas(WIDTH, HEIGHT);
        const ctx = canvas.getContext("2d");

        drawFrame(ctx, scene, image, progress);

        const framePath = path.join(
          framesDir,
          `frame_${String(frameIndex + 1).padStart(6, "0")}.png`
        );
        fs.writeFileSync(framePath, canvas.toBuffer("image/png"));

        frameIndex += 1;

        if (onProgress && (frameIndex % 15 === 0 || frameIndex === totalFrames)) {
          await onProgress(Math.round((frameIndex / totalFrames) * 100));
        }
      }
    }

    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    await encodeFrames(framesDir, outputPath);
    await onProgress?.(100);
  } finally {
    fs.rmSync(framesDir, { recursive: true, force: true });
  }
}
