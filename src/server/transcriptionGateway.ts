import type { Express, Request, Response } from "express";
import Redis from "ioredis";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { createHash, createHmac, createCipheriv, createDecipheriv, randomBytes, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const exec = promisify(execFile);
export const MAX_AUDIO_SECONDS = 180;
const MAX_BYTES = 15 * 1024 * 1024;
const MAX_GATEWAY_MS = 14_000;
const JOB_TTL_SECONDS = 30 * 60;
const RESULT_TTL_SECONDS = 24 * 3600;
const AUDIO_TYPES = new Set([
  "audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg",
  "audio/mp3", "audio/wav", "audio/x-wav", "audio/aac"
]);
export function isPermittedMime(mime: string) {
  return AUDIO_TYPES.has(mime.toLowerCase().split(";")[0].trim());
}
export function decodeAudio(base64: unknown): Buffer | null {
  if (typeof base64 !== "string" || base64.length > Math.ceil(MAX_BYTES / 3) * 4 + 16) return null;
  if (!base64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64) || base64.length % 4 !== 0) return null;
  const data = Buffer.from(base64, "base64");
  return data.length > 0 && data.length <= MAX_BYTES ? data : null;
}
export async function verifyDuration(data: Buffer): Promise<number> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "oraculo-record-"));
  const filepath = path.join(dir, "recording");
  try {
    await writeFile(filepath, data, { mode: 0o600 });
    const { stdout } = await exec(
      "ffprobe",
      ["-v", "error", "-show_entries", "format=duration", "-of", "default=nokey=1:noprint_wrappers=1", filepath],
      { timeout: 3_000, maxBuffer: 128_000 }
    );
    const seconds = Number(stdout.trim());
    if (!Number.isFinite(seconds) || seconds <= 0) throw Error("Invalid audio duration");
    return seconds;
  } finally { await rm(dir, { recursive: true, force: true }); }
}
export function scopedCacheKey(secret: string, userId: string, audio: Buffer): string {
  const hash = createHash("sha256").update(audio).digest("hex");
  return createHmac("sha256", secret).update(userId + ":" + hash).digest("hex");
}

type Job = { id: string; userId: string; status: "processing" | "ready" | "failed"; transcript?: string; error?: string; duration: number };

/** Criptografa o texto antes de persistir no Redis. A chave só existe no servidor. */
export function sealTranscript(value:string,secret:string):string {
  const key=createHash("sha256").update(secret+"|transcription-encryption").digest();
  const nonce=randomBytes(12);
  const cipher=createCipheriv("aes-256-gcm",key,nonce);
  const ciphertext=Buffer.concat([cipher.update(value,"utf8"),cipher.final()]);
  const tag=cipher.getAuthTag();
  return [nonce.toString("base64url"),tag.toString("base64url"),ciphertext.toString("base64url")].join(".");
}
export function unsealTranscript(payload:string,secret:string):string {
  const parts=payload.split(".");
  if(parts.length!==3)throw Error("Invalid encrypted transcription");
  const [nonce,tag,data]=parts.map(part=>Buffer.from(part,"base64url"));
  const key=createHash("sha256").update(secret+"|transcription-encryption").digest();
  const decipher=createDecipheriv("aes-256-gcm",key,nonce);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data),decipher.final()]).toString("utf8");
}

const redisUrl = process.env.REDIS_URL;
const supabaseUrl = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const cacheSecret = process.env.TRANSCRIPTION_CACHE_SECRET;
const elevenlabsKey = process.env.ELEVENLABS_API_KEY;
const configured = Boolean(redisUrl && supabaseUrl && cacheSecret && elevenlabsKey);
const redis = configured ? new Redis(redisUrl!, { lazyConnect: true, maxRetriesPerRequest: 1, connectTimeout: 3000 }) : null;
const jwks = supabaseUrl ? createRemoteJWKSet(new URL(supabaseUrl + "/auth/v1/.well-known/jwks.json")) : null;
if (redis) redis.on("error", () => { /* failure is reported by route responses; do not log private payloads */ });

async function getUserId(req: Request): Promise<string | null> {
  if (!jwks) return null;
  const header = req.headers.authorization || "";
  if (!/^Bearer [^\s]+$/.test(header)) return null;
  try {
    const jwt = header.slice(7);
    const { payload } = await jwtVerify(jwt, jwks, {
      issuer: supabaseUrl + "/auth/v1",
      audience: "authenticated",
      algorithms: ["RS256", "ES256"]
    });
    return typeof payload.sub === "string" && payload.sub.length > 0 ? payload.sub : null;
  } catch { return null; }
}

async function transcribeViaElevenLabs(audio: Buffer, mime: string): Promise<string> {
  const form = new FormData();
  form.append("model_id", "scribe_v2");
  form.append("file", new Blob([new Uint8Array(audio)], { type: mime }), "gravacao");
  const response = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
    method: "POST",
    headers: { "xi-api-key": elevenlabsKey! },
    body: form,
    signal: AbortSignal.timeout(110_000)
  });
  if (!response.ok) throw Error("Speech-to-text provider unavailable");
  const payload = await response.json() as { text?: string };
  if (typeof payload.text !== "string" || !payload.text.trim()) throw Error("Empty transcription");
  return payload.text.trim();
}
async function processJob(
  job: Job, audio: Buffer, mime: string, cacheKey: string, freeKey: string
) {
  if (!redis) return;
  const key = "ov:job:" + job.id;
  try {
    const transcript = await transcribeViaElevenLabs(audio, mime);
    // Results stored privately, only retrievable after verified JWT for the matching user.
    await redis.set("ov:result:" + cacheKey, sealTranscript(transcript,cacheSecret!), "EX", RESULT_TTL_SECONDS);
    await redis.set(key, JSON.stringify({ ...job, status: "ready", transcript: sealTranscript(transcript,cacheSecret!) }), "EX", JOB_TTL_SECONDS);
  } catch {
    await redis.set(key, JSON.stringify({ ...job, status: "failed", error: "Não foi possível transcrever. Tente novamente." }), "EX", JOB_TTL_SECONDS);
    // Restore free attempt on provider failure only if this job claimed it.
    const existing = await redis.get(freeKey);
    if (existing === job.id) await redis.del(freeKey);
  }
}
export function mountTranscriptionGateway(app: Express) {
  // The API gateway must acknowledge with cached result or job ID in <= 14s;
  // never hold an HTTP response open for three minutes of AI inference.
  app.post("/api/transcription/jobs", async (req: Request, res: Response) => {
    res.setTimeout(MAX_GATEWAY_MS, () => { if (!res.headersSent) res.status(504).json({ error: "Gateway timeout", retryable: true }); });
    res.setHeader("Cache-Control", "no-store");
    if (!configured || !redis) return res.status(503).json({ error: "Transcrição temporariamente indisponível. Configure autenticação e armazenamento seguro." });
    const userId = await getUserId(req);
    if (!userId) return res.status(401).json({ error: "Entre na sua conta para transcrever." });
    const mime = typeof req.body?.mimeType === "string" ? req.body.mimeType.toLowerCase().split(";")[0] : "";
    const audio = decodeAudio(req.body?.audioBase64);
    if (!audio || !isPermittedMime(mime)) return res.status(400).json({ error: "Áudio inválido ou formato incompatível." });
    let duration: number;
    try { duration = await verifyDuration(audio); }
    catch { return res.status(400).json({ error: "Formato de áudio inválido. Verifique se o arquivo não está corrompido." }); }
    if (duration > MAX_AUDIO_SECONDS + 0.75) return res.status(413).json({ error: "A duração máxima é de três minutos." });
    const cacheKey = scopedCacheKey(cacheSecret!, userId, audio);
    try {
      const cached = await redis.get("ov:result:" + cacheKey);
      if (cached !== null) return res.json({ status: "ready", cached: true, transcription: unsealTranscript(cached,cacheSecret!), duration });
      const existing = await redis.get("ov:pending:" + cacheKey);
      if (existing) {
        const status = await redis.get("ov:job:" + existing);
        if (status && JSON.parse(status).status === "processing") return res.status(202).json({ status: "processing", jobId: existing, reused: true });
      }
      const freeKey = "ov:free:" + userId;
      const jobId = randomUUID();
      const claimed = await redis.set(freeKey, jobId, "EX", 90 * 86400, "NX");
      if (claimed !== "OK") return res.status(429).json({ error: "Sua sessão gratuita já foi utilizada." });
      const job: Job = { id: jobId, userId, status: "processing", duration };
      await redis.set("ov:job:" + jobId, JSON.stringify(job), "EX", JOB_TTL_SECONDS);
      await redis.set("ov:pending:" + cacheKey, jobId, "EX", JOB_TTL_SECONDS);
      // No provider call in request/response path. In single-instance MVP the job
      // runs in this process; production needs a durable external job queue.
      setImmediate(() => { void processJob(job, audio, mime, cacheKey, freeKey).catch(() => {}); });
      return res.status(202).json({ status: "processing", jobId, estimatedMaximumSeconds: 180 });
    } catch { return res.status(503).json({ error: "Armazenamento temporariamente indisponível." }); }
  });
  app.get("/api/transcription/jobs/:jobId", async (req: Request, res: Response) => {
    res.setTimeout(MAX_GATEWAY_MS);
    res.setHeader("Cache-Control", "no-store");
    if (!configured || !redis) return res.status(503).json({ error: "Serviço indisponível." });
    const userId = await getUserId(req);
    if (!userId) return res.status(401).json({ error: "Entre na sua conta." });
    if (!/^[0-9a-f-]{36}$/i.test(req.params.jobId)) return res.status(400).json({ error: "Identificador inválido." });
    try {
      const json = await redis.get("ov:job:" + req.params.jobId);
      if (!json) return res.status(404).json({ error: "Tarefa expirada ou não encontrada." });
      const job = JSON.parse(json) as Job;
      if (job.userId !== userId) return res.status(404).json({ error: "Tarefa não encontrada." });
      return res.json({ status: job.status, transcription: job.status === "ready" && job.transcript ? unsealTranscript(job.transcript,cacheSecret!) : undefined, error: job.error });
    } catch { return res.status(503).json({ error: "Não foi possível consultar a tarefa." }); }
  });
}
