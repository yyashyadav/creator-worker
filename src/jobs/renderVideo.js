import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import Video from "../../../server/src/models/Video.js";
import Project from "../../../server/src/models/Project.js";
import Scene from "../../../server/src/models/Scene.js";
import { renderComicVideo } from "../render/comicRenderer.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function resolveOutputDir() {
  const configured = process.env.VIDEO_OUTPUT_DIR;
  if (configured) {
    return path.isAbsolute(configured)
      ? configured
      : path.resolve(process.cwd(), configured);
  }
  return path.resolve(__dirname, "../../../server/uploads/videos");
}

function buildFileUrl(filename) {
  const base = process.env.API_BASE_URL || "http://localhost:5001";
  return `${base}/uploads/videos/${filename}`;
}

class RenderCancelledError extends Error {
  constructor() {
    super("Render cancelled");
    this.name = "RenderCancelledError";
  }
}

async function assertNotCancelled(videoId) {
  const current = await Video.findById(videoId).select("status");
  if (current?.status === "cancelled") {
    throw new RenderCancelledError();
  }
}

export async function processRenderJob({ videoId, projectId }) {
  const video = await Video.findById(videoId);
  if (!video) {
    throw new Error(`Video not found: ${videoId}`);
  }

  if (video.status === "cancelled") {
    return;
  }

  const project = await Project.findById(projectId);
  if (!project) {
    throw new Error(`Project not found: ${projectId}`);
  }

  const scenes = await Scene.find({ projectId }).sort({ order: 1 });
  if (scenes.length === 0) {
    throw new Error("No scenes to render");
  }

  video.status = "processing";
  video.progress = 0;
  video.renderStartedAt = new Date();
  video.errorMessage = null;
  await video.save();

  const outputDir = resolveOutputDir();
  fs.mkdirSync(outputDir, { recursive: true });

  const filename = `${videoId}.mp4`;
  const outputPath = path.join(outputDir, filename);

  try {
    await renderComicVideo(
      scenes.map((scene) => ({
        characterImageUrl: scene.characterImageUrl,
        dialogue: scene.dialogue,
        duration: scene.duration,
        position: scene.position,
        dialoguePosition: scene.dialoguePosition,
        dialogueShape: scene.dialogueShape,
        animation: scene.animation,
      })),
      outputPath,
      async (progress) => {
        await assertNotCancelled(videoId);
        video.progress = progress;
        await video.save();
      }
    );

    await assertNotCancelled(videoId);

    video.status = "completed";
    video.progress = 100;
    video.fileUrl = buildFileUrl(filename);
    video.renderCompletedAt = new Date();
    await video.save();

    project.status = "completed";
    await project.save();
  } catch (error) {
    if (error instanceof RenderCancelledError) {
      if (fs.existsSync(outputPath)) {
        fs.unlinkSync(outputPath);
      }
      return;
    }

    const current = await Video.findById(videoId).select("status");
    if (current?.status === "cancelled") {
      if (fs.existsSync(outputPath)) {
        fs.unlinkSync(outputPath);
      }
      return;
    }

    video.status = "failed";
    video.errorMessage = error.message || "Render failed";
    video.renderCompletedAt = new Date();
    await video.save();

    project.status = "draft";
    await project.save();

    throw error;
  }
}
