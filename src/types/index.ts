export interface AudioSample {
  id: string;
  name: string;
  data: string; // base64 string
  mimeType: string;
  duration?: number;
  sizeBytes?: number;
  blobUrl?: string;
  isPreset?: boolean;
  detectedPitchHz?: number;
  detectedPitchLabel?: string;
}

export interface VoiceProfile {
  transcriptions?: string[];
  speakerGender?: "male" | "female" | "neutral";
  bestBaseVoice?: string;
  pitchLevel?: string;
  tone?: string;
  accentAndCadence?: string;
  speakingRate?: string;
  energyLevel?: string;
  stylePrompt?: string;
  voiceProfileSummary?: string;
  confidenceScore?: number;
  estimatedHz?: number;
}

export interface SynthesisResult {
  id: string;
  audioBase64: string;
  mimeType: string;
  text: string;
  voiceProfile?: VoiceProfile;
  usedBaseVoice: string;
  generatedAt: string;
  pitchShiftSemitones?: number;
  antiGrossaApplied?: boolean;
}

export interface ChatMessage {
  id: string;
  role: "user" | "model";
  text: string;
  timestamp: string;
  modelUsed?: string;
}

export type ChatModel = "gemini-3.8-flash" | "gemini-3.1-flash-lite" | "gemini-4-argon";

export interface ImageGenerationRequest {
  prompt: string;
  imageSize: "1K" | "2K" | "4K";
  aspectRatio: "1:1" | "16:9" | "9:16" | "4:3" | "3:4";
}

export interface ClonedVoice {
  id: string;
  name: string;
  description?: string;
  labels: {
    gender: "Masculino" | "Feminino";
    accent?: string;
    tone?: string;
    graves?: string;
    type?: string;
  };
  referenceWavBase64?: string;
  previewAudioBase64?: string;
  samplesCount: number;
  createdAt: string;
  stability: number; // 0 to 1
  similarityBoost: number; // 0 to 1
  styleExaggeration: number; // 0 to 1
  speakerBoost: boolean;
  category: "cloned" | "prebuilt" | "designed";
  elevenLabsVoiceId?: string;
}
