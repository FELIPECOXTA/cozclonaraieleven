/** Speech-to-text providers. Keys stay server-side; all provider failures are internal. */
export type ProviderName = "elevenlabs" | "gemini" | "openai";
export type ProviderInput = { audio: Buffer; mime: string; signal: AbortSignal };
export type Provider = {
  name: ProviderName;
  budgetMs: number;
  transcribe: (input: ProviderInput) => Promise<string>;
};

const DEFAULT_FIRST_MS = 7_000;
const DEFAULT_SECOND_MS = 7_000;
const DEFAULT_THIRD_MS = 12_000;
export const PROVIDER_BUDGETS = Object.freeze({
  elevenlabs: DEFAULT_FIRST_MS,
  gemini: DEFAULT_SECOND_MS,
  openai: DEFAULT_THIRD_MS,
});

export class ProvidersUnavailable extends Error {
  constructor() { super("No transcription providers succeeded"); this.name = "ProvidersUnavailable"; }
}

/** A stage deadline aborts its HTTP request; never retries the same provider automatically.
 * A remote service may still charge even if the request is aborted.
 */
export async function transcribeWithFallback(
  providers: Provider[],
  input: Omit<ProviderInput, "signal">,
  report?: (provider: ProviderName, outcome: "starting" | "failed" | "success", elapsedMs: number) => void,
  sleep: typeof setTimeout = setTimeout
): Promise<{ text: string; provider: ProviderName }> {
  for (const provider of providers) {
    const started = Date.now();
    const controller = new AbortController();
    const timeout = sleep(() => controller.abort(new Error("provider deadline")), provider.budgetMs);
    try {
      report?.(provider.name, "starting", 0);
      const text = (await provider.transcribe({ ...input, signal: controller.signal })).trim();
      if (controller.signal.aborted || !text) throw new Error("No transcription");
      report?.(provider.name, "success", Date.now() - started);
      return { text, provider: provider.name };
    } catch {
      // Do not expose model errors, texts or API keys in logs / client responses.
      report?.(provider.name, "failed", Date.now() - started);
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new ProvidersUnavailable();
}

async function requireText(response: Response, selector: (json: any) => string): Promise<string> {
  if (!response.ok) throw new Error("Provider request rejected");
  const json = await response.json();
  const value = selector(json);
  if (!value || typeof value !== "string" || !value.trim()) throw new Error("Empty transcription");
  return value.trim();
}

export function createTranscriptionProviders(env: NodeJS.ProcessEnv = process.env): Provider[] {
  const providers: Provider[] = [];
  if (env.ELEVENLABS_API_KEY?.trim()) {
    providers.push({
      name: "elevenlabs", budgetMs: PROVIDER_BUDGETS.elevenlabs,
      transcribe: async ({ audio, mime, signal }) => {
        const form = new FormData();
        const model = env.ELEVENLABS_STT_MODEL === "scribe_v3" ? "scribe_v3" : "scribe_v2";
        form.append("model_id", model);
        form.append("tag_audio_events", "false");
        form.append("file", new Blob([new Uint8Array(audio)], { type: mime }), "mensagem-de-voz");
        const response = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
          method: "POST",
          headers: { "xi-api-key": env.ELEVENLABS_API_KEY! },
          body: form,
          signal,
        });
        return requireText(response, payload => payload?.text);
      },
    });
  }
  if (env.GEMINI_API_KEY?.trim()) {
    providers.push({
      name: "gemini", budgetMs: PROVIDER_BUDGETS.gemini,
      transcribe: async ({ audio, mime, signal }) => {
        const model = env.GEMINI_STT_MODEL || "gemini-3.5-transcribe";
        // Restrict model name to a safe identifier, never accept a full URL from env.
        if (!/^[a-zA-Z0-9_.-]{3,70}$/.test(model)) throw new Error("Invalid Gemini model");
        const response = await fetch(
          "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent",
          {
            method: "POST",
            headers: { "x-goog-api-key": env.GEMINI_API_KEY!, "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ role: "user", parts: [
                { text: "Transcreva fielmente o áudio no idioma original. Não invente falas, nomes ou palavras. Se inaudível, marque [inaudível]. Retorne apenas a transcrição." },
                { inlineData: { mimeType: mime, data: audio.toString("base64") } },
              ] }],
            }),
            signal,
          }
        );
        return requireText(response, payload => {
          const parts = payload?.candidates?.[0]?.content?.parts;
          if (!Array.isArray(parts)) return "";
          return parts.map((p: any) => p?.text || p?.audioTranscription?.text || "").filter(Boolean).join("\n");
        });
      },
    });
  }
  if (env.OPENAI_API_KEY?.trim()) {
    providers.push({
      name: "openai", budgetMs: PROVIDER_BUDGETS.openai,
      transcribe: async ({ audio, mime, signal }) => {
        const form = new FormData();
        form.append("model", "gpt-transcribe");
        form.append("file", new Blob([new Uint8Array(audio)], { type: mime }), "mensagem-de-voz");
        const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
          method: "POST",
          headers: { Authorization: "Bearer " + env.OPENAI_API_KEY! },
          body: form,
          signal,
        });
        return requireText(response, payload => payload?.text);
      },
    });
  }
  return providers;
}
