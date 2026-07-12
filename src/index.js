import "dotenv/config";
import { Worker } from "bullmq";
import { connectDb } from "./config/db.js";
import { getRedisConnectionConfig, getRedisHostLabel } from "./config/redis.js";
import { processRenderJob } from "./jobs/renderVideo.js";

async function start() {
  await connectDb();

  const worker = new Worker(
    "video-render",
    async (job) => {
      console.log(`[worker] Starting render job ${job.id}`);
      await processRenderJob(job.data);
      console.log(`[worker] Completed render job ${job.id}`);
    },
    {
      connection: getRedisConnectionConfig(),
      concurrency: 1,
    }
  );

  worker.on("failed", (job, error) => {
    console.error(`[worker] Job ${job?.id} failed:`, error.message);
  });

  worker.on("error", (error) => {
    console.error("[worker] Worker error:", error.message);
  });

  console.log(`[worker] Connected to Redis at ${getRedisHostLabel()}`);
  console.log("[worker] Video render worker listening on queue: video-render");
}

start().catch((error) => {
  console.error("[worker] Failed to start:", error.message);
  process.exit(1);
});
