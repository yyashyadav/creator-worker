import IORedis from "ioredis";

const REDIS_URL = process.env.REDIS_URL;

function parseRedisUrl(urlString) {
  const parsed = new URL(urlString);

  return {
    host: parsed.hostname,
    port: Number(parsed.port) || 6379,
    username: decodeURIComponent(parsed.username || "default"),
    password: decodeURIComponent(parsed.password || ""),
    tls: parsed.protocol === "rediss:" ? {} : undefined,
  };
}

export function buildRedisOptions() {
  if (!REDIS_URL) {
    throw new Error(
      "REDIS_URL is not set. Add your Redis Cloud URL to .env (redis:// or rediss://)."
    );
  }

  const { host, port, username, password, tls } = parseRedisUrl(REDIS_URL);

  return {
    host,
    port,
    username,
    password,
    maxRetriesPerRequest: null,
    family: 4,
    ...(tls ? { tls } : {}),
  };
}

export function createRedisConnection() {
  return new IORedis(buildRedisOptions());
}

export function getRedisConnectionConfig() {
  return buildRedisOptions();
}

export function getRedisHostLabel() {
  if (!REDIS_URL) return "not configured";
  try {
    return new URL(REDIS_URL).host;
  } catch {
    return "invalid REDIS_URL";
  }
}
