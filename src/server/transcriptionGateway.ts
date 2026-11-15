import type { Express, Request, Response } from "express";
import Redis from "ioredis";
import { Queue, Worker } from "bullmq";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { createHash, createHmac, createCipheriv, createDecipheriv, randomBytes, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createTranscriptionProviders, transcribeWithFallback } from "./transcriptionProviders";

const exec = promisify(execFile);
export const MAX_AUDIO_SECONDS = 180;
export const GATEWAY_BUDGET_MS = 14_000;
const MAX_BYTES = 15 * 1024 * 1024;
const JOB_TTL_SECONDS = 30 * 60;
const RESULT_TTL_SECONDS = 24 * 3600;
const FREE_WINDOW_SECONDS = 90 * 86400; // MVP trial. Move to persistent DB before charging.
const QUEUE_NAME = "voice-transcription-v1";
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
  const dir = await mkdtemp(path.join(os.tmpdir(), "voice-record-"));
  const filepath = path.join(dir, "audio");
  try {
    await writeFile(filepath, data, { mode: 0o600 });
    const { stdout } = await exec(
      "ffprobe",
      ["-v", "error", "-show_entries", "format=duration", "-of", "default=nokey=1:noprint_wrappers=1", filepath],
      { timeout: 3_000, maxBuffer: 128_000 }
    );
    const seconds = Number(stdout.trim());
    if (!Number.isFinite(seconds) || seconds <= 0) throw Error("Invalid duration");
    return seconds;
  } finally { await rm(dir, { recursive: true, force: true }); }
}
export function scopedCacheKey(secret: string, userId: string, audio: Buffer): string {
  const hash = createHash("sha256").update(audio).digest("hex");
  return createHmac("sha256", secret).update(userId + ":" + hash).digest("hex");
}
type JobStatus = "processing" | "ready" | "failed";
type PublicJob = { id: string; userId: string; status: JobStatus; duration: number; transcript?: string; error?: string };
type QueueData = {
  userId: string; jobId: string; mime: string; audioEncrypted: string;
  cacheKey: string; freeKey: string; pendingKey: string; duration: number;
};

/** AES-256-GCM for both job audio and cached text; never store plaintext in Redis. */
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
  if(parts.length!==3)throw Error("Invalid encrypted data");
  const [nonce,tag,data]=parts.map(part=>Buffer.from(part,"base64url"));
  const key=createHash("sha256").update(secret+"|transcription-encryption").digest();
  const decipher=createDecipheriv("aes-256-gcm",key,nonce);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data),decipher.final()]).toString("utf8");
}

const redisUrl = process.env.REDIS_URL;
const supabaseUrl = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const cacheSecret = process.env.TRANSCRIPTION_CACHE_SECRET;
const providers = createTranscriptionProviders();
const configured = Boolean(redisUrl && supabaseUrl && cacheSecret && providers.length);
const redis = configured ? new Redis(redisUrl!, { maxRetriesPerRequest: null, connectTimeout: 3000 }) : null;
const queue = redis ? new Queue<QueueData>(QUEUE_NAME, { connection: redis }) : null;
const jwks = supabaseUrl ? createRemoteJWKSet(new URL(supabaseUrl + "/auth/v1/.well-known/jwks.json")) : null;
if (redis) redis.on("error", () => { /* do not log secrets */ });

async function getUserId(req: Request): Promise<string | null> {
  if (!jwks) return null;
  const header = req.headers.authorization || "";
  if (!/^Bearer [^\s]+$/.test(header)) return null;
  try {
    const { payload } = await jwtVerify(header.slice(7), jwks, {
      issuer: supabaseUrl + "/auth/v1",
      audience: "authenticated",
      algorithms: ["RS256", "ES256"]
    });
    return typeof payload.sub === "string" && payload.sub ? payload.sub : null;
  } catch { return null; }
}
function gatewayGuard(res: Response) {
  res.setHeader("Cache-Control","no-store");
  // The reverse proxy must also limit end-to-end request time, including upload.
  res.setTimeout(GATEWAY_BUDGET_MS, () => {
    if (!res.headersSent) res.status(504).json({ error:"Este envio está demorando. Sua gravação continua salva no aparelho.", retryable:true });
  });
}
const JOB_PREFIX="ov:job:";
const RESULT_PREFIX="ov:result:";
async function finishJob(data:QueueData) {
  if (!redis || !cacheSecret) throw Error("Storage unavailable");
  const jobKey = JOB_PREFIX + data.jobId;
  const current=await redis.get(jobKey);
  if (current && (JSON.parse(current) as PublicJob).status === "ready") return;
  const raw = unsealTranscript(data.audioEncrypted, cacheSecret);
  const audio = Buffer.from(raw, "base64");
  const job:PublicJob={id:data.jobId,userId:data.userId,status:"processing",duration:data.duration};
  try {
    const result=await transcribeWithFallback(providers,{audio,mime:data.mime},
      (provider,outcome,elapsed)=>{if(outcome!=="starting")console.info("[stt] stage",provider,outcome,elapsed+"ms");}
    );
    const encrypted=sealTranscript(result.text,cacheSecret);
    await redis.set(RESULT_PREFIX + data.cacheKey, encrypted, "EX", RESULT_TTL_SECONDS);
    await redis.set(jobKey,JSON.stringify({...job,status:"ready",transcript:encrypted}),"EX",JOB_TTL_SECONDS);
  } catch {
    await redis.set(jobKey,JSON.stringify({...job,status:"failed",error:"Não conseguimos concluir agora. Sua gravação está preservada."}),"EX",JOB_TTL_SECONDS);
    // Never charge the free session if all providers fail.
    const claimed = await redis.get(data.freeKey);
    if (claimed === data.jobId) await redis.del(data.freeKey);
  } finally {
    if (await redis.get(data.pendingKey) === data.jobId) await redis.del(data.pendingKey);
  }
}
let worker:Worker<QueueData>|null=null;
function startWorker() {
  if (worker || !redis) return;
  worker=new Worker<QueueData>(QUEUE_NAME, async task => {
    await finishJob(task.data);
  }, { connection: redis.duplicate(), concurrency: 2, lockDuration: 90_000 });
  worker.on("error", () => { /* monitored in infrastructure */ });
}
export function mountTranscriptionGateway(app: Express) {
  if (queue) startWorker();
  app.post("/api/transcription/jobs",async(req:Request,res:Response)=>{
    gatewayGuard(res);
    if (!configured || !queue || !redis || !cacheSecret) return res.status(503).json({error:"Transcrição indisponível por enquanto. Tente novamente mais tarde."});
    const userId=await getUserId(req);
    if (!userId)return res.status(401).json({error:"Entre na sua conta para enviar o áudio."});
    const mime=typeof req.body?.mimeType==="string"?req.body.mimeType.toLowerCase().split(";")[0].trim():"";
    const audio=decodeAudio(req.body?.audioBase64);
    if(!audio||!isPermittedMime(mime))return res.status(400).json({error:"Não foi possível ler sua gravação. Grave novamente."});
    let duration:number;
    try {duration=await verifyDuration(audio);}
    catch {return res.status(400).json({error:"Não conseguimos verificar a gravação. Confira e tente novamente."});}
    if(duration>MAX_AUDIO_SECONDS+0.75)return res.status(413).json({error:"O áudio deve ter até 3 minutos."});
    const cacheKey=scopedCacheKey(cacheSecret,userId,audio);
    const pendingKey="ov:pending:"+cacheKey;
    const freeKey="ov:free:"+userId;
    let locked=false;
    let freeClaimed=false;
    const jobId=randomUUID();
    try {
      const cached=await redis.get(RESULT_PREFIX+cacheKey);
      if(cached!==null)return res.json({status:"ready",cached:true,transcription:unsealTranscript(cached,cacheSecret),duration});
      const pending=await redis.get(pendingKey);
      if(pending){
        const pendingJob=await redis.get(JOB_PREFIX+pending);
        if(pendingJob && (JSON.parse(pendingJob) as PublicJob).status==="processing")
          return res.status(202).json({status:"processing",jobId:pending,reused:true});
      }
      locked=(await redis.set(pendingKey,jobId,"EX",JOB_TTL_SECONDS,"NX"))==="OK";
      if(!locked){
        const existing=await redis.get(pendingKey);
        if(existing)return res.status(202).json({status:"processing",jobId:existing,reused:true});
        return res.status(503).json({error:"Ainda estamos preparando sua transcrição. Tente mais uma vez."});
      }
      freeClaimed=(await redis.set(freeKey,jobId,"EX",FREE_WINDOW_SECONDS,"NX"))==="OK";
      if(!freeClaimed){
        await redis.del(pendingKey);
        locked=false;
        return res.status(429).json({error:"Sua sessão gratuita já foi utilizada."});
      }
      const newJob:PublicJob={id:jobId,userId,status:"processing",duration};
      await redis.set(JOB_PREFIX+jobId,JSON.stringify(newJob),"EX",JOB_TTL_SECONDS);
      await queue.add("speech-to-text",{
        jobId,userId,mime,duration,cacheKey,pendingKey,freeKey,
        audioEncrypted:sealTranscript(audio.toString("base64"),cacheSecret),
      },{jobId,attempts:1,removeOnComplete:{age:3600,count:1000},removeOnFail:{age:3600,count:1000}});
      return res.status(202).json({status:"processing",jobId});
    } catch {
      // Roll back only this newly reserved job; an existing finished job isn't touched.
      if(locked && await redis.get(pendingKey)===jobId)await redis.del(pendingKey).catch(()=>{});
      if(freeClaimed && await redis.get(freeKey)===jobId)await redis.del(freeKey).catch(()=>{});
      return res.status(503).json({error:"Não foi possível iniciar agora. Seu áudio continua no aparelho."});
    }
  });
  app.get("/api/transcription/jobs/:jobId",async(req:Request,res:Response)=>{
    gatewayGuard(res);
    if(!configured||!redis||!cacheSecret)return res.status(503).json({error:"Serviço temporariamente indisponível."});
    const userId=await getUserId(req);
    if(!userId)return res.status(401).json({error:"Entre na sua conta para continuar."});
    if(!/^[0-9a-f-]{36}$/i.test(req.params.jobId))return res.status(404).json({error:"Não encontramos essa transcrição."});
    try{
      const raw=await redis.get(JOB_PREFIX+req.params.jobId);
      if(!raw)return res.status(404).json({error:"Não encontramos essa transcrição. Seu áudio continua no aparelho."});
      const job=JSON.parse(raw) as PublicJob;
      if(job.userId!==userId)return res.status(404).json({error:"Não encontramos essa transcrição."});
      return res.json({
        status:job.status,
        transcription:job.status==="ready"&&job.transcript?unsealTranscript(job.transcript,cacheSecret):undefined,
        error:job.status==="failed"?job.error:undefined,
      });
    }catch{return res.status(503).json({error:"Estamos tentando consultar sua transcrição. Aguarde um instante."});}
  });
}
