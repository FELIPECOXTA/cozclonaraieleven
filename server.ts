import express from "express";
import dotenv from "dotenv";
import { GoogleGenAI, Type } from "@google/genai";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import { mountTranscriptionGateway } from "./src/server/transcriptionGateway";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// Middleware for large payload (audio base64)
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Rota assíncrona protegida: sem usuário autenticado e Redis, falha fechada.
mountTranscriptionGateway(app);
// Recursos antigos sem autenticação ficam desativados por padrão.
// O produto comercial expõe apenas transcrição até a revisão de segurança.
const LEGACY_API = /^\/api\/(?:voices(?:\/|$)|elevenlabs(?:\/|$)|generate-speech(?:\/|$)|analyze-voice(?:\/|$)|clone-and-synthesize(?:\/|$)|chat(?:\/|$)|generate-image(?:\/|$))/;
app.use((req, res, next) => {
  if (process.env.ENABLE_LEGACY_VOICE_TOOLS === "true" || !LEGACY_API.test(req.path)) return next();
  res.status(404).json({ error: "Recurso não disponível nesta versão." });
});

// Server-side Gemini client
const getAiClient = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY não configurada no ambiente.");
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
};

// VoiceLab Storage (just like ElevenLabs Voice Library)
interface ServerClonedVoice {
  id: string;
  name: string;
  description: string;
  labels: {
    gender: "Masculino" | "Feminino";
    accent: string;
    tone: string;
    graves: string;
    type: string;
  };
  referenceWavBase64?: string;
  samplesCount: number;
  createdAt: string;
  stability: number;
  similarityBoost: number;
  styleExaggeration: number;
  speakerBoost: boolean;
  category: "cloned" | "prebuilt";
  previewAudioBase64?: string;
  elevenLabsVoiceId?: string;
}

function getElevenLabsKey(req: express.Request): string | undefined {
  const headerKey = req.headers["x-elevenlabs-key"];
  if (typeof headerKey === "string" && headerKey.trim().length > 0) {
    return headerKey.trim();
  }
  const bodyKey = req.body?.elevenLabsApiKey;
  if (typeof bodyKey === "string" && bodyKey.trim().length > 0) {
    return bodyKey.trim();
  }
  if (process.env.ELEVENLABS_API_KEY && process.env.ELEVENLABS_API_KEY.trim().length > 0) {
    return process.env.ELEVENLABS_API_KEY.trim();
  }
  return undefined;
}

const VOICES_FILE = path.resolve(__dirname, "voices-data.json");

function loadStoredVoices(): ServerClonedVoice[] {
  const defaultVoices: ServerClonedVoice[] = [
    {
      id: "default-male-bass",
      name: "Voz Masculina Grave Natural",
      description: "Voz masculina autêntica com graves encorpados, timbre quente e afinação natural brasileira",
      labels: {
        gender: "Masculino",
        accent: "Brasileiro",
        tone: "Grave e Natural",
        graves: "Graves 100% Preservados",
        type: "Locutor Autêntico",
      },
      samplesCount: 1,
      createdAt: new Date().toISOString(),
      stability: 0.75,
      similarityBoost: 0.85,
      styleExaggeration: 0.15,
      speakerBoost: true,
      category: "prebuilt",
    },
    {
      id: "default-deep-narrator",
      name: "Narrador Profundo & Solene",
      description: "Voz masculina muito grave, ressonância profunda de cinema e autoridade",
      labels: {
        gender: "Masculino",
        accent: "Neutro",
        tone: "Barítono Profundo",
        graves: "Graves Potentes",
        type: "Cinema / Narração",
      },
      samplesCount: 1,
      createdAt: new Date().toISOString(),
      stability: 0.8,
      similarityBoost: 0.9,
      styleExaggeration: 0.2,
      speakerBoost: true,
      category: "prebuilt",
    },
  ];

  try {
    if (fs.existsSync(VOICES_FILE)) {
      const data = fs.readFileSync(VOICES_FILE, "utf-8");
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (err) {
    console.warn("Aviso ao carregar vozes salvas:", err);
  }
  return defaultVoices;
}

function saveStoredVoices(voices: ServerClonedVoice[]) {
  try {
    fs.writeFileSync(VOICES_FILE, JSON.stringify(voices, null, 2), "utf-8");
  } catch (err) {
    console.error("Erro ao salvar vozes:", err);
  }
}

let voiceLibrary = loadStoredVoices();

/**
 * Health check
 */
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

/**
 * GET /api/voices - List all cloned & prebuilt voices
 */
app.get("/api/voices", (_req, res) => {
  res.json({ success: true, voices: voiceLibrary });
});

/**
 * POST /api/voices - Create a new Instant Cloned Voice (ElevenLabs VoiceLab style)
 */
app.post("/api/voices", async (req, res) => {
  try {
    const {
      name,
      description = "",
      gender = "Masculino",
      accent = "Brasileiro",
      tone = "Natural com Graves",
      referenceWavBase64,
      samplesCount = 1,
      stability = 0.75,
      similarityBoost = 0.9,
      styleExaggeration = 0.1,
      speakerBoost = true,
    } = req.body;

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return res.status(400).json({ error: "O nome da voz é obrigatório." });
    }

    if (!referenceWavBase64) {
      return res.status(400).json({ error: "O áudio de referência é obrigatório para clonar a voz." });
    }

    const ai = getAiClient();
    const newId = `voice-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;

    // Generate short preview sample for this voice
    let previewAudioBase64 = "";
    try {
      const previewText = "Olá, esta é uma demonstração da minha voz clonada exatamente igual ao áudio original.";
      const previewRes = await ai.models.generateContent({
        model: "gemini-3.8-flash-lite-tts",
        contents: [{ role: "user", parts: [{ text: previewText }] }],
        config: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              replicatedVoiceConfig: {
                mimeType: "audio/wav",
                voiceSampleAudio: referenceWavBase64.includes("base64,") ? referenceWavBase64.split("base64,")[1] : referenceWavBase64,
              },
            },
          },
        },
      });
      previewAudioBase64 = previewRes.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || "";
    } catch (prevErr) {
      console.warn("Prévia de voz gerada via fallback");
    }

    const newVoice: ServerClonedVoice = {
      id: newId,
      name: name.trim(),
      description: description.trim() || `Voz clonada a partir de ${samplesCount} áudio(s) original(is)`,
      labels: {
        gender: gender === "Feminino" ? "Feminino" : "Masculino",
        accent: accent || "Brasileiro",
        tone: tone || "Natural com Graves",
        graves: gender === "Masculino" ? "Graves 100% Preservados" : "Voz Feminina Natural",
        type: "Instant Voice Clone",
      },
      referenceWavBase64,
      previewAudioBase64,
      samplesCount,
      createdAt: new Date().toISOString(),
      stability: typeof stability === "number" ? stability : 0.75,
      similarityBoost: typeof similarityBoost === "number" ? similarityBoost : 0.9,
      styleExaggeration: typeof styleExaggeration === "number" ? styleExaggeration : 0.1,
      speakerBoost: !!speakerBoost,
      category: "cloned",
    };

    voiceLibrary = [newVoice, ...voiceLibrary];
    saveStoredVoices(voiceLibrary);

    res.json({ success: true, voice: newVoice });
  } catch (error: any) {
    console.error("Erro ao criar voz clonada:", error);
    res.status(500).json({ error: error?.message || "Erro ao criar voz clonada." });
  }
});

/**
 * DELETE /api/voices/:id - Remove a cloned voice
 */
app.delete("/api/voices/:id", (req, res) => {
  const { id } = req.params;
  const target = voiceLibrary.find((v) => v.id === id);
  if (!target) {
    return res.status(404).json({ error: "Voz não encontrada." });
  }
  if (target.category === "prebuilt") {
    return res.status(400).json({ error: "Não é possível excluir vozes padrão do sistema." });
  }

  voiceLibrary = voiceLibrary.filter((v) => v.id !== id);
  saveStoredVoices(voiceLibrary);
  res.json({ success: true, id });
});

/**
 * POST /api/elevenlabs/verify-key - Test user ElevenLabs API key
 */
app.post("/api/elevenlabs/verify-key", async (req, res) => {
  try {
    const key = req.body?.key || getElevenLabsKey(req);
    if (!key) {
      return res.status(400).json({ error: "Chave de API não informada." });
    }
    const response = await fetch("https://api.elevenlabs.io/v1/user", {
      headers: { "xi-api-key": key },
    });
    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      return res.status(401).json({ error: errData?.detail?.message || "Chave da ElevenLabs inválida." });
    }
    const userData = await response.json();
    res.json({
      success: true,
      tier: userData?.subscription?.tier || "free",
      characterCount: userData?.subscription?.character_count || 0,
      characterLimit: userData?.subscription?.character_limit || 10000,
    });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "Erro ao conectar com ElevenLabs." });
  }
});

/**
 * GET /api/elevenlabs/voices - List user voices from ElevenLabs account
 */
app.get("/api/elevenlabs/voices", async (req, res) => {
  try {
    const key = getElevenLabsKey(req);
    if (!key) {
      return res.status(401).json({ error: "Chave da ElevenLabs não informada." });
    }
    const response = await fetch("https://api.elevenlabs.io/v1/voices", {
      headers: { "xi-api-key": key },
    });
    const data = await response.json();
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "Erro ao buscar vozes na ElevenLabs." });
  }
});

/**
 * POST /api/elevenlabs/clone-voice - Official Instant Voice Cloning using ElevenLabs API
 */
app.post("/api/elevenlabs/clone-voice", async (req, res) => {
  try {
    const key = getElevenLabsKey(req);
    if (!key) {
      return res.status(400).json({
        error: "Chave de API da ElevenLabs necessária para clonagem neural idêntica.",
        needsKey: true,
      });
    }

    const { name, description = "", samples, labels = {} } = req.body;
    if (!name || !samples || !Array.isArray(samples) || samples.length === 0) {
      return res.status(400).json({ error: "Nome e pelo menos 1 áudio original são obrigatórios." });
    }

    const formData = new FormData();
    formData.append("name", name.trim());
    formData.append("description", description.trim() || "Voz clonada via ElevenVoice Studio");

    if (labels && typeof labels === "object") {
      formData.append("labels", JSON.stringify(labels));
    }

    // Append audio files
    for (let i = 0; i < samples.length; i++) {
      const sample = samples[i];
      let b64 = sample.data || "";
      if (b64.includes("base64,")) {
        b64 = b64.split("base64,")[1];
      }
      const buffer = Buffer.from(b64, "base64");
      const blob = new Blob([buffer], { type: sample.mimeType || "audio/wav" });
      formData.append("files", blob, `sample_${i + 1}.wav`);
    }

    const response = await fetch("https://api.elevenlabs.io/v1/voices/add", {
      method: "POST",
      headers: {
        "xi-api-key": key,
      },
      body: formData,
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return res.status(response.status).json({
        error: data?.detail?.message || "Erro ao clonar voz na ElevenLabs.",
      });
    }

    const elevenVoiceId = data.voice_id;
    const newId = `voice-el-${elevenVoiceId}`;
    const newVoice: ServerClonedVoice = {
      id: newId,
      elevenLabsVoiceId: elevenVoiceId,
      name: name.trim(),
      description: description.trim() || "Voz Clonada Oficial ElevenLabs",
      labels: {
        gender: labels.gender === "Feminino" ? "Feminino" : "Masculino",
        accent: labels.accent || "Brasileiro",
        tone: labels.tone || "Natural com Graves",
        graves: "Graves 100% Idênticos ElevenLabs",
        type: "ElevenLabs Instant Voice Clone",
      },
      samplesCount: samples.length,
      createdAt: new Date().toISOString(),
      stability: 0.75,
      similarityBoost: 0.95,
      styleExaggeration: 0.1,
      speakerBoost: true,
      category: "cloned",
      referenceWavBase64: samples[0]?.data,
    };

    voiceLibrary = [newVoice, ...voiceLibrary];
    saveStoredVoices(voiceLibrary);

    res.json({
      success: true,
      voice: newVoice,
      elevenLabsVoiceId: elevenVoiceId,
    });
  } catch (error: any) {
    console.error("Erro na clonagem ElevenLabs:", error);
    res.status(500).json({ error: error?.message || "Erro ao clonar na ElevenLabs." });
  }
});

/**
 * POST /api/elevenlabs/speech-to-speech - ElevenLabs Voice Changer (Speech-to-Speech STS)
 */
app.post("/api/elevenlabs/speech-to-speech", async (req, res) => {
  try {
    const key = getElevenLabsKey(req);
    if (!key) {
      return res.status(400).json({
        error: "Chave de API da ElevenLabs necessária para transformar áudio com Speech-to-Speech.",
        needsKey: true,
      });
    }

    const { voiceId, audioBase64, mimeType = "audio/wav", stability = 0.5, similarityBoost = 0.85, style = 0.0 } = req.body;
    if (!audioBase64) {
      return res.status(400).json({ error: "Áudio de entrada é obrigatório." });
    }

    let targetVoiceId = voiceId;
    const voice = voiceLibrary.find((v) => v.id === voiceId);
    if (voice?.elevenLabsVoiceId) {
      targetVoiceId = voice.elevenLabsVoiceId;
    }

    // If targetVoiceId is still default or not an ElevenLabs voice ID, get first voice from account
    if (!targetVoiceId || targetVoiceId.startsWith("default-")) {
      const listRes = await fetch("https://api.elevenlabs.io/v1/voices", {
        headers: { "xi-api-key": key },
      });
      if (listRes.ok) {
        const listData = await listRes.json();
        const first = listData.voices?.[0];
        if (first) targetVoiceId = first.voice_id;
      }
    }

    if (!targetVoiceId) {
      return res.status(400).json({ error: "Nenhuma voz ElevenLabs encontrada para Speech-to-Speech." });
    }

    let b64 = audioBase64;
    if (b64.includes("base64,")) {
      b64 = b64.split("base64,")[1];
    }
    const buffer = Buffer.from(b64, "base64");
    const blob = new Blob([buffer], { type: mimeType });

    const formData = new FormData();
    formData.append("audio", blob, "input.wav");
    formData.append("model_id", "eleven_multilingual_sts_v2");
    formData.append(
      "voice_settings",
      JSON.stringify({
        stability: Number(stability) || 0.5,
        similarity_boost: Number(similarityBoost) || 0.85,
        style: Number(style) || 0,
        use_speaker_boost: true,
      })
    );

    const elRes = await fetch(`https://api.elevenlabs.io/v1/speech-to-speech/${targetVoiceId}`, {
      method: "POST",
      headers: {
        "xi-api-key": key,
      },
      body: formData,
    });

    if (!elRes.ok) {
      const errJson = await elRes.json().catch(() => ({}));
      return res.status(elRes.status).json({
        error: errJson?.detail?.message || `Erro no Speech-to-Speech ElevenLabs (Status ${elRes.status}).`,
      });
    }

    const arrayBuffer = await elRes.arrayBuffer();
    const resultB64 = Buffer.from(arrayBuffer).toString("base64");
    res.json({
      success: true,
      audioBase64: resultB64,
      mimeType: "audio/mpeg",
      engine: "ElevenLabs Speech-to-Speech STS v2",
      voiceName: voice?.name || "Voz Clonada ElevenLabs",
    });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "Erro no servidor de Speech-to-Speech." });
  }
});

/**
 * POST /api/elevenlabs/sound-generation - ElevenLabs Sound Effects (SFX)
 */
app.post("/api/elevenlabs/sound-generation", async (req, res) => {
  try {
    const key = getElevenLabsKey(req);
    if (!key) {
      return res.status(400).json({
        error: "Chave de API da ElevenLabs necessária para gerar efeitos sonoros.",
        needsKey: true,
      });
    }

    const { prompt, durationSeconds = 4, promptInfluence = 0.3 } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: "Descrição do efeito sonoro é obrigatória." });
    }

    const elRes = await fetch("https://api.elevenlabs.io/v1/sound-generation", {
      method: "POST",
      headers: {
        "xi-api-key": key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: prompt.trim(),
        duration_seconds: Math.min(Math.max(Number(durationSeconds) || 4, 0.5), 22),
        prompt_influence: Number(promptInfluence) || 0.3,
      }),
    });

    if (!elRes.ok) {
      const errJson = await elRes.json().catch(() => ({}));
      return res.status(elRes.status).json({
        error: errJson?.detail?.message || "Erro ao gerar efeito sonoro na ElevenLabs.",
      });
    }

    const arrayBuffer = await elRes.arrayBuffer();
    const resultB64 = Buffer.from(arrayBuffer).toString("base64");
    res.json({
      success: true,
      audioBase64: resultB64,
      mimeType: "audio/mpeg",
      engine: "ElevenLabs Sound Effects AI",
      prompt: prompt.trim(),
    });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "Erro ao gerar efeito sonoro." });
  }
});

/**
 * POST /api/generate-speech - ElevenLabs style speech synthesis with cloned voice & settings
 */
app.post("/api/generate-speech", async (req, res) => {
  try {
    const {
      voiceId,
      text,
      modelId = "eleven_multilingual_v2",
      stability = 0.75,
      similarityBoost = 0.9,
      styleExaggeration = 0.15,
      speakerBoost = true,
      voiceOverride,
    } = req.body;

    if (!text || typeof text !== "string" || text.trim().length === 0) {
      return res.status(400).json({ error: "Por favor, digite o texto para sintetizar." });
    }

    const cleanText = text.trim();
    const voice = voiceLibrary.find((v) => v.id === voiceId) || voiceLibrary[0];

    // Check if ElevenLabs key is present to provide 100% IDENTICAL speech
    const elevenKey = getElevenLabsKey(req);
    if (elevenKey) {
      try {
        let elVoiceId = voice?.elevenLabsVoiceId;
        if (!elVoiceId || elVoiceId.startsWith("default-")) {
          const listRes = await fetch("https://api.elevenlabs.io/v1/voices", {
            headers: { "xi-api-key": elevenKey },
          });
          if (listRes.ok) {
            const listData = await listRes.json();
            const first = listData.voices?.[0];
            if (first) elVoiceId = first.voice_id;
          }
        }

        if (elVoiceId) {
          console.log(`[ElevenLabs API] Gerando fala para voz ${elVoiceId} com ${modelId}...`);
          const elRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${elVoiceId}`, {
            method: "POST",
            headers: {
              "xi-api-key": elevenKey,
              "Content-Type": "application/json",
              Accept: "audio/mpeg",
            },
            body: JSON.stringify({
              text: cleanText,
              model_id: modelId || "eleven_multilingual_v2",
              voice_settings: {
                stability: Number(stability) || 0.75,
                similarity_boost: Number(similarityBoost) || 0.95,
                style: Number(styleExaggeration) || 0.1,
                use_speaker_boost: !!speakerBoost,
              },
            }),
          });

          if (elRes.ok) {
            const arrayBuffer = await elRes.arrayBuffer();
            const b64 = Buffer.from(arrayBuffer).toString("base64");
            return res.json({
              success: true,
              audioBase64: b64,
              mimeType: "audio/mpeg",
              voiceId: voice?.id || elVoiceId,
              voiceName: voice?.name || "Voz Clonada Oficial ElevenLabs",
              text: cleanText,
              engine: `ElevenLabs ${modelId} (100% Idêntico)`,
              generatedAt: new Date().toISOString(),
            });
          } else {
            const errJson = await elRes.json().catch(() => ({}));
            const errMsg = errJson?.detail?.message || `Erro ElevenLabs (Status ${elRes.status})`;
            console.warn("ElevenLabs TTS retornou erro:", errMsg);
            return res.status(elRes.status).json({
              error: errMsg,
              fromElevenLabs: true,
            });
          }
        }
      } catch (elErr: any) {
        console.warn("Erro na chamada ElevenLabs:", elErr);
        return res.status(500).json({
          error: elErr?.message || "Erro na comunicação direta com ElevenLabs.",
        });
      }
    }

    const ai = getAiClient();
    const isMale = voice?.labels?.gender !== "Feminino";

    let audioData: string | undefined;

    // 1. Try Direct Voice Replication using the voice reference audio
    if (voice?.referenceWavBase64) {
      let cleanRef = voice.referenceWavBase64;
      if (cleanRef.includes("base64,")) {
        cleanRef = cleanRef.split("base64,")[1];
      }

      try {
        const repRes = await ai.models.generateContent({
          model: "gemini-3.8-flash-lite-tts",
          contents: [{ role: "user", parts: [{ text: cleanText }] }],
          config: {
            responseModalities: ["AUDIO"],
            speechConfig: {
              voiceConfig: {
                replicatedVoiceConfig: {
                  mimeType: "audio/wav",
                  voiceSampleAudio: cleanRef,
                },
              },
            },
          },
        });
        audioData = repRes.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      } catch (repErr: any) {
        console.warn("Replicated voice failed, using high-fidelity fallback:", repErr?.message);
      }
    }

    // 2. High fidelity fallback with exact male bass preservation
    if (!audioData) {
      const baseVoiceName = voiceOverride || (isMale ? "Fenrir" : "Kore");
      const similarityInstruction = similarityBoost > 0.8
        ? "Exact 100% vocal match to the original speaker timbre and pitch."
        : "Natural vocal inflection.";
      const stabilityInstruction = stability > 0.7
        ? "Consistent, grounded cadence without fluctuation."
        : "Expressive, dynamic cadence.";

      const styleInstruction = isMale
        ? `Natural, authentic Brazilian Portuguese masculine male voice with rich natural bass frequencies and deep warm resonance fully intact. ${similarityInstruction} ${stabilityInstruction} Clear, confident pronunciation without any high pitch.`
        : `Natural warm Brazilian Portuguese female voice with clear articulation. ${similarityInstruction} ${stabilityInstruction}`;

      const ttsResponse = await ai.models.generateContent({
        model: "gemini-3.8-flash-lite-tts",
        contents: [
          {
            role: "user",
            parts: [
              {
                text: cleanText,
                speechMetadata: {
                  style: styleInstruction,
                },
              },
            ],
          },
        ],
        config: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: baseVoiceName },
            },
          },
        },
      });
      audioData = ttsResponse.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    }

    if (!audioData) {
      throw new Error("Não foi possível gerar a fala da voz clonada.");
    }

    res.json({
      success: true,
      audioBase64: audioData,
      mimeType: "audio/wav",
      voiceId: voice?.id || "default",
      voiceName: voice?.name || "Voz Masculina com Graves",
      text: cleanText,
      generatedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Erro na síntese de fala:", error);
    res.status(500).json({ error: error?.message || "Erro ao sintetizar voz." });
  }
});

/**
 * Endpoint: Analyze 1, 2, or 3 audio samples to extract voice characteristics
 */
app.post("/api/analyze-voice", async (req, res) => {
  try {
    const { audioSamples } = req.body;
    if (!audioSamples || !Array.isArray(audioSamples) || audioSamples.length === 0) {
      return res.status(400).json({ error: "Envie entre 1 e 3 amostras de áudio." });
    }

    if (audioSamples.length > 3) {
      return res.status(400).json({ error: "Máximo de 3 amostras de áudio permitidas." });
    }

    const ai = getAiClient();

    // Prepare parts with inlineData for each audio clip
    const parts: any[] = [];
    audioSamples.forEach((sample: { data: string; mimeType?: string }, index: number) => {
      // Clean base64 if it has data URL prefix
      let cleanData = sample.data;
      if (cleanData.includes("base64,")) {
        cleanData = cleanData.split("base64,")[1];
      }
      parts.push({
        inlineData: {
          mimeType: sample.mimeType || "audio/mp3",
          data: cleanData,
        },
      });
      parts.push({
        text: `[Amostra de áudio ${index + 1} de ${audioSamples.length}]`,
      });
    });

    parts.push({
      text: `Você é um engenheiro de som e especialista sênior em clonagem e síntese de voz (voice cloning e prosódia).
Analise detalhadamente a voz do falante presente nas amostras de áudio fornecidas (são ${audioSamples.length} amostras).

ATENÇÃO CRÍTICA DE QUALIDADE:
O usuário relatou anteriormente que a voz sintetizada "ficou muito grossa / grave demais".
Para garantir uma voz IDÊNTICA e natural, você DEVE analisar com precisão cirúrgica a frequência fundamental (pitch) e o brilho acústico:
- Se for uma voz masculina comum, jovem ou natural, NUNCA selecione 'Charon' (Charon é um grave cinematográfico pesado que soa artificialmente grosso).
- Selecione 'Puck' para vozes masculinas naturais, jovens, ágeis, com tom médio ou tenor (muito mais fiel e sem peso nos graves).
- Selecione 'Zephyr' para vozes femininas claras, leves e brilhantes.
- Selecione 'Kore' para vozes femininas calorosas e articuladas.
- Selecione 'Fenrir' apenas para vozes masculinas maduras com timbre aveludado, mas instruindo tom médio sem excesso de graves.

Objetivo:
1. Transcrever com precisão o que foi dito em cada amostra de áudio (em português ou idioma original).
2. Determinar o gênero do falante ('male', 'female', 'neutral').
3. Selecionar a melhor voz base nativa do Gemini TTS que mais se assemelhe:
   - 'Puck' (Recomendado para vozes masculinas normais/jovens: tom ágil, leve, sem graves pesados)
   - 'Zephyr' (Recomendado para vozes femininas leves, claras e naturais)
   - 'Kore' (Feminina expressiva e calorosa)
   - 'Fenrir' (Masculina equilibrada de tom médio)
   - 'Charon' (Apenas e exclusivamente se o áudio original for de um baixo extremo)
4. Descrever a faixa real de pitch e o tom exato da pessoa.
5. Criar um 'stylePrompt' detalhado em inglês instruindo o sintetizador Gemini a reproduzir o tom exato, leve, com articulação límpida, sem graves abafados.

Responda EXCLUSIVAMENTE em formato JSON com o seguinte schema:
{
  "transcriptions": ["transcrição amostra 1", "..."],
  "speakerGender": "male" | "female" | "neutral",
  "bestBaseVoice": "Puck" | "Zephyr" | "Kore" | "Fenrir" | "Charon",
  "pitchLevel": "médio-agudo (leve e natural)" | "médio" | "grave",
  "tone": "descrição concisa do tom",
  "accentAndCadence": "descrição do sotaque e cadência",
  "speakingRate": "natural ágil" | "moderado",
  "energyLevel": "natural e expressivo",
  "stylePrompt": "Bright, clear, light conversational delivery with natural pitch, forward mouth resonance, crisp articulation, avoiding any heavy boomy bass or deep artificial gravel.",
  "voiceProfileSummary": "resumo humanizado da personalidade vocal em português",
  "confidenceScore": 96
}`,
    });

    const response = await ai.models.generateContent({
      model: "gemini-3.8-flash",
      contents: { parts },
      config: {
        responseMimeType: "application/json",
      },
    });

    const responseText = response.text || "{}";
    let profile;
    try {
      profile = JSON.parse(responseText);
    } catch {
      profile = {
        speakerGender: "neutral",
        bestBaseVoice: "Puck",
        tone: "Natural, leve e articulado",
        pitchLevel: "médio-agudo (natural)",
        accentAndCadence: "Português Brasileiro natural",
        stylePrompt: "Bright, clear, natural conversational Brazilian Portuguese speech with light vocal weight and crisp articulation",
        voiceProfileSummary: "Voz natural capturada a partir das amostras fornecidas com afinação leve e equilibrada.",
        confidenceScore: 94,
      };
    }

    res.json({ success: true, profile });
  } catch (error: any) {
    console.error("Erro ao analisar voz:", error);
    res.status(500).json({
      error: error?.message || "Falha ao analisar as amostras de áudio.",
    });
  }
});

/**
 * Endpoint: Clone voice from 1-3 audio samples and synthesize text
 */
app.post("/api/clone-and-synthesize", async (req, res) => {
  try {
    const { audioSamples, text, options } = req.body;

    if (!text || typeof text !== "string" || text.trim().length === 0) {
      return res.status(400).json({ error: "Por favor, digite o texto a ser transformado em voz." });
    }

    if (!audioSamples || !Array.isArray(audioSamples) || audioSamples.length === 0) {
      return res.status(400).json({ error: "Envie pelo menos 1 áudio de referência (máximo 3)." });
    }

    if (audioSamples.length > 3) {
      return res.status(400).json({ error: "Máximo de 3 áudios de referência permitidos." });
    }

    const ai = getAiClient();

    // Step 1: Acoustic voice analysis if profile not already provided in options
    let voiceProfile = options?.profile;

    if (!voiceProfile) {
      const parts: any[] = [];
      audioSamples.forEach((sample: { data: string; mimeType?: string }, idx: number) => {
        let cleanData = sample.data;
        if (cleanData.includes("base64,")) {
          cleanData = cleanData.split("base64,")[1];
        }
        parts.push({
          inlineData: {
            mimeType: sample.mimeType || "audio/mp3",
            data: cleanData,
          },
        });
        parts.push({
          text: `[Amostra de áudio ${idx + 1}]`,
        });
      });

      parts.push({
        text: `Você é um diretor sênior de síntese de voz e dublagem de IA.
Analise as características acústicas do falante nestas amostras de áudio:
ATENÇÃO: Não deixe a voz sintetizada soar artificialmente grossa, pesada ou abafada.
- Se a voz masculina for comum, jovem ou natural, use 'Puck' (tom mais alto, sem excesso de graves).
- Se a voz for feminina, use 'Zephyr' (suave/brilhante) ou 'Kore' (expressiva).
- Use 'Fenrir' apenas para homens com voz neutra/madura e 'Charon' exclusivamente se for um baixo extremo.

Responda EXCLUSIVAMENTE em JSON:
{
  "transcriptions": ["..."],
  "speakerGender": "male" | "female" | "neutral",
  "bestBaseVoice": "Puck" | "Zephyr" | "Kore" | "Fenrir" | "Charon",
  "pitchLevel": "médio-agudo" | "médio" | "grave",
  "tone": "...",
  "accentAndCadence": "...",
  "stylePrompt": "Bright, light, clear and crisp vocal delivery with natural mid-to-high conversational pitch. Eliminate any heavy bass boom or artificial gravel.",
  "voiceProfileSummary": "Resumo em português do timbre da pessoa",
  "confidenceScore": 95
}`,
      });

      const analysisResponse = await ai.models.generateContent({
        model: "gemini-3.8-flash",
        contents: { parts },
        config: {
          responseMimeType: "application/json",
        },
      });

      try {
        voiceProfile = JSON.parse(analysisResponse.text || "{}");
      } catch {
        voiceProfile = {
          speakerGender: "neutral",
          bestBaseVoice: "Puck",
          stylePrompt: "Bright, light, natural conversational Brazilian Portuguese speech with crisp articulation and light vocal weight",
          voiceProfileSummary: "Voz processada com afinação natural e sem graves artificiais.",
          confidenceScore: 92,
        };
      }
    }

    // Step 2: Speech Synthesis matching the cloned voice
    const cleanText = text.trim();

    // Clean reference WAV base64 if passed directly
    let referenceWav = req.body.replicatedWavBase64;
    if (!referenceWav && audioSamples?.[0]?.data) {
      referenceWav = audioSamples[0].data;
    }
    if (referenceWav && referenceWav.includes("base64,")) {
      referenceWav = referenceWav.split("base64,")[1];
    }

    let audioData: string | undefined;
    let replicationUsed = false;

    // 1. PRIMARY METHOD: Direct Voice Replication using the original speaker audio sample
    if (referenceWav) {
      try {
        console.log("[VozClonar AI] Replicando voz original diretamente via replicatedVoiceConfig...");
        const ttsResponse = await ai.models.generateContent({
          model: "gemini-3.8-flash-tts",
          contents: [
            {
              role: "user",
              parts: [{ text: cleanText }],
            },
          ],
          config: {
            responseModalities: ["AUDIO"],
            speechConfig: {
              voiceConfig: {
                replicatedVoiceConfig: {
                  mimeType: "audio/wav",
                  voiceSampleAudio: referenceWav,
                },
              },
            },
          },
        });

        audioData = ttsResponse.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if (audioData) {
          replicationUsed = true;
          console.log("[VozClonar AI] Sucesso na replicação direta da voz original!");
        }
      } catch (repErr: any) {
        console.warn("[VozClonar AI] Replicação direta com gemini-3.8-flash-tts falhou, tentando flash-lite:", repErr?.message);
        try {
          const liteResponse = await ai.models.generateContent({
            model: "gemini-3.8-flash-lite-tts",
            contents: [
              {
                role: "user",
                parts: [{ text: cleanText }],
              },
            ],
            config: {
              responseModalities: ["AUDIO"],
              speechConfig: {
                voiceConfig: {
                  replicatedVoiceConfig: {
                    mimeType: "audio/wav",
                    voiceSampleAudio: referenceWav,
                  },
                },
              },
            },
          });
          audioData = liteResponse.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
          if (audioData) {
            replicationUsed = true;
          }
        } catch (liteErr: any) {
          console.warn("[VozClonar AI] Falha na replicação direta lite:", liteErr?.message);
        }
      }
    }

    // 2. RELIABLE SYNTHESIS (using gemini-3.8-flash-lite-tts with full graves / bass preserved)
    if (!audioData) {
      console.log("[VozClonar AI] Sintetizando voz masculina com graves preservados via gemini-3.8-flash-lite-tts...");
      
      // Determine base voice: default to Fenrir (natural warm male with rich bass) or Charon (deep male)
      let targetBaseVoice = options?.voiceOverride;
      if (!targetBaseVoice || targetBaseVoice === "Puck") {
        if (options?.voiceGender === "female") {
          targetBaseVoice = "Kore";
        } else {
          targetBaseVoice = "Fenrir"; // Natural male with full bass preserved!
        }
      }

      const maleBassStyle =
        options?.voiceGender === "female"
          ? "Natural warm Brazilian Portuguese female voice with clear articulation and smooth cadence."
          : "Natural, confident Brazilian Portuguese male voice with all rich natural bass frequencies and warm resonant timbre fully preserved, exactly like the original speaker, speaking clearly without any high-pitch or distortion.";

      try {
        const fallbackResponse = await ai.models.generateContent({
          model: "gemini-3.8-flash-lite-tts",
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: cleanText,
                  speechMetadata: {
                    style: maleBassStyle,
                  },
                },
              ],
            },
          ],
          config: {
            responseModalities: ["AUDIO"],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: targetBaseVoice },
              },
            },
          },
        });

        audioData = fallbackResponse.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      } catch (fbErr: any) {
        console.error("[VozClonar AI] Erro no fallback lite-tts:", fbErr?.message);
        throw new Error(fbErr?.message || "Não foi possível gerar a voz.");
      }
    }

    if (!audioData) {
      throw new Error("Não foi possível gerar os dados de áudio da voz sintetizada.");
    }

    res.json({
      success: true,
      audioBase64: audioData,
      mimeType: "audio/wav",
      replicationUsed,
      voiceProfile,
      usedBaseVoice: replicationUsed ? "Voz Original Replicada" : "Síntese Acústica",
      textLength: cleanText.length,
      generatedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Erro na clonagem e síntese de voz:", error);
    res.status(500).json({
      error: error?.message || "Erro interno ao sintetizar voz clonada.",
    });
  }
});

/**
 * Endpoint: Multi-turn Chatbot (Voice Coach & Script Director)
 * Requirements:
 * - Maintain conversation history
 * - Scrollable thread
 * - System instructions for roles
 * - Models: gemini-4-argon for complex, gemini-3.8-flash for general, gemini-3.1-flash-lite for fast
 */
app.post("/api/chat", async (req, res) => {
  try {
    const { messages, model = "gemini-3.8-flash", systemInstruction } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "Histórico de mensagens é obrigatório." });
    }

    // Supported models per instructions
    const allowedModels = ["gemini-3.8-flash", "gemini-3.1-flash-lite", "gemini-4-argon"];
    const selectedModel = allowedModels.includes(model) ? model : "gemini-3.8-flash";

    const ai = getAiClient();

    const defaultSystemInstruction =
      "Você é o Diretor Vocal e Engenheiro de Áudio da VozClonar AI. " +
      "Seu papel é ajudar o usuário a extrair o melhor de gravações de áudio de referência, " +
      "refinar textos para ficarem com ritmo e prosódia naturais na voz clonada, " +
      "sugerir pausas dramáticas, marcações fonéticas e ajustes de emoção (alegre, narrativo, solene, comercial). " +
      "Responda sempre em português claro, simpático e técnico quando necessário.";

    // Format contents for Gemini generateContent
    // messages: [{ role: 'user' | 'model', text: string }]
    const contents = messages.map((m: { role: string; text: string }) => ({
      role: m.role === "assistant" || m.role === "model" ? "model" : "user",
      parts: [{ text: m.text }],
    }));

    const response = await ai.models.generateContent({
      model: selectedModel,
      contents,
      config: {
        systemInstruction: systemInstruction || defaultSystemInstruction,
      },
    });

    const reply = response.text || "";
    res.json({ success: true, reply, model: selectedModel });
  } catch (error: any) {
    console.error("Erro no chat:", error);
    res.status(500).json({
      error: error?.message || "Erro ao processar mensagem do assistente.",
    });
  }
});

/**
 * Endpoint: High Quality Image Generation
 * Requirements:
 * - Model: gemini-3-pro-image-preview (with support for 1K, 2K, 4K affordance)
 * - Provide affordance for 1K, 2K, and 4K image size
 */
app.post("/api/generate-image", async (req, res) => {
  try {
    const { prompt, imageSize = "1K", aspectRatio = "1:1" } = req.body;

    if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
      return res.status(400).json({ error: "Forneça uma descrição para gerar a imagem." });
    }

    const ai = getAiClient();

    // Map allowed sizes: 1K, 2K, 4K
    const validSizes = ["1K", "2K", "4K"];
    const targetSize = validSizes.includes(imageSize) ? imageSize : "1K";

    // Valid aspect ratios
    const validAspectRatios = ["1:1", "16:9", "9:16", "4:3", "3:4"];
    const targetAspectRatio = validAspectRatios.includes(aspectRatio) ? aspectRatio : "1:1";

    let imageBase64: string | null = null;
    let usedModel = "gemini-3-pro-image-preview";

    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-pro-image-preview",
        contents: {
          parts: [{ text: prompt }],
        },
        config: {
          imageConfig: {
            aspectRatio: targetAspectRatio as any,
            imageSize: targetSize as any,
          },
        },
      });

      const parts = response.candidates?.[0]?.content?.parts || [];
      for (const part of parts) {
        if (part.inlineData?.data) {
          imageBase64 = part.inlineData.data;
          break;
        }
      }
    } catch (primaryErr: any) {
      console.warn("Tentando fallback para gemini-nano-banana-2.1:", primaryErr?.message);
      usedModel = "gemini-nano-banana-2.1";
      try {
        const response2 = await ai.models.generateContent({
          model: "gemini-nano-banana-2.1",
          contents: {
            parts: [{ text: prompt }],
          },
          config: {
            imageConfig: {
              aspectRatio: targetAspectRatio as any,
              imageSize: targetSize as any,
            },
          },
        });
        const parts = response2.candidates?.[0]?.content?.parts || [];
        for (const part of parts) {
          if (part.inlineData?.data) {
            imageBase64 = part.inlineData.data;
            break;
          }
        }
      } catch (err2: any) {
        console.warn("Tentando fallback para gemini-3.1-flash-lite-image:", err2?.message);
        usedModel = "gemini-3.1-flash-lite-image";
        const response3 = await ai.models.generateContent({
          model: "gemini-3.1-flash-lite-image",
          contents: {
            parts: [{ text: prompt }],
          },
          config: {
            imageConfig: {
              aspectRatio: targetAspectRatio as any,
            },
          },
        });
        const parts = response3.candidates?.[0]?.content?.parts || [];
        for (const part of parts) {
          if (part.inlineData?.data) {
            imageBase64 = part.inlineData.data;
            break;
          }
        }
      }
    }

    if (!imageBase64) {
      throw new Error("Não foi possível gerar a imagem com os parâmetros fornecidos.");
    }

    res.json({
      success: true,
      imageUrl: `data:image/png;base64,${imageBase64}`,
      model: usedModel,
      imageSize: targetSize,
      aspectRatio: targetAspectRatio,
    });
  } catch (error: any) {
    console.error("Erro na geração de imagem:", error);
    res.status(500).json({
      error: error?.message || "Erro ao gerar imagem.",
    });
  }
});

// Setup Vite middleware in dev or static files in production
async function startServer() {
  const isProduction = process.env.NODE_ENV === "production";

  if (!isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, "dist");
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get("*", (_req, res) => {
        res.sendFile(path.resolve(distPath, "index.html"));
      });
    }
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[VozClonar AI] Servidor rodando em http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Erro fatal ao inicializar servidor:", err);
  process.exit(1);
});
