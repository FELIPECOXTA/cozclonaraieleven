import React, { useState } from "react";
import {
  Volume2,
  Sparkles,
  RefreshCw,
  Download,
  AlertCircle,
  Key,
  Sliders,
  Music,
  Play,
  Pause,
} from "lucide-react";
import { WhatsAppAudioBubble } from "./WhatsAppAudioBubble";
import { AudioVisualizerPlayer } from "./AudioVisualizerPlayer";

interface ElevenLabsSoundEffectsProps {
  elevenLabsApiKey: string;
  onOpenApiKeyModal: () => void;
}

export const ElevenLabsSoundEffects: React.FC<ElevenLabsSoundEffectsProps> = ({
  elevenLabsApiKey,
  onOpenApiKeyModal,
}) => {
  const [prompt, setPrompt] = useState("Passos firmes em piso de madeira com eco suave");
  const [durationSeconds, setDurationSeconds] = useState(4);
  const [promptInfluence, setPromptInfluence] = useState(0.3);

  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [outputAudioBase64, setOutputAudioBase64] = useState<string | null>(null);
  const [outputMimeType, setOutputMimeType] = useState<string>("audio/mpeg");
  const [playerMode, setPlayerMode] = useState<"whatsapp" | "studio">("studio");

  const samplePrompts = [
    { title: "Passos", text: "Passos firmes em assoalho de madeira com eco suave" },
    { title: "Chuva na Janela", text: "Chuva constante batendo no vidro da janela com trovão distante" },
    { title: "Porta Rangendo", text: "Porta velha de madeira rangendo ao abrir lentamente" },
    { title: "Notificação Futurista", text: "Notificação sonora moderna de smartphone sci-fi elegante" },
    { title: "Cafeteria", text: "Ambiente calmo de cafeteria com xícaras de café e murmúrio suave" },
    { title: "Motor V8", text: "Motor potente roncando grave acelerando em estrada vazia" },
  ];

  const handleGenerateSFX = async () => {
    if (!prompt.trim()) {
      setError("Por favor, descreva o efeito sonoro.");
      return;
    }

    if (!elevenLabsApiKey.trim()) {
      setError("Para gerar efeitos sonoros com a ElevenLabs, conecte sua chave de API.");
      onOpenApiKeyModal();
      return;
    }

    setError(null);
    setIsGenerating(true);

    try {
      const response = await fetch("/api/elevenlabs/sound-generation", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-elevenlabs-key": elevenLabsApiKey.trim(),
        },
        body: JSON.stringify({
          prompt: prompt.trim(),
          durationSeconds,
          promptInfluence,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Erro ao gerar efeito sonoro.");
      }

      setOutputAudioBase64(data.audioBase64);
      setOutputMimeType(data.mimeType || "audio/mpeg");
    } catch (err: any) {
      setError(err?.message || "Falha ao gerar efeito sonoro na ElevenLabs.");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-purple-500/10 blur-3xl pointer-events-none rounded-full" />
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 relative z-10">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20 text-xs font-bold">
              <Music className="w-3.5 h-3.5" />
              ElevenLabs Sound Effects AI
            </div>
            <h2 className="text-2xl font-black text-white tracking-tight">
              Gerador de Efeitos Sonoros (SFX)
            </h2>
            <p className="text-xs sm:text-sm text-slate-400 max-w-2xl">
              Crie qualquer efeito de áudio ou som ambiente a partir de texto com o modelo oficial ElevenLabs Sound Effects.
            </p>
          </div>

          <button
            onClick={onOpenApiKeyModal}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-2xl text-xs font-bold transition-all border shrink-0 ${
              elevenLabsApiKey.trim()
                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                : "bg-amber-500/15 text-amber-300 border-amber-500/40 hover:bg-amber-500/25 animate-pulse"
            }`}
          >
            <Key className="w-4 h-4" />
            {elevenLabsApiKey.trim() ? "ElevenLabs Conectada" : "Conectar Chave ElevenLabs"}
          </button>
        </div>
      </div>

      {/* Main Studio Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-6">
        {/* Prompt Input */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-300 flex items-center justify-between">
            <span>Descrição do Efeito Sonoro:</span>
            <span className="text-[11px] text-slate-500">Ex: Passos, chuva, motor, cliques, etc.</span>
          </label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={3}
            placeholder="Descreva o som desejado..."
            className="w-full bg-slate-950 border border-slate-800 focus:border-purple-500 rounded-2xl p-4 text-sm text-slate-100 placeholder-slate-600 focus:outline-none transition-all resize-none font-medium leading-relaxed"
          />
        </div>

        {/* Quick Suggestions */}
        <div className="space-y-2">
          <span className="text-xs font-bold text-slate-400">Sugestões Rápidas:</span>
          <div className="flex flex-wrap gap-2">
            {samplePrompts.map((s, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setPrompt(s.text)}
                className="px-3 py-1.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-xs text-slate-300 hover:text-white transition-all"
              >
                {s.title}
              </button>
            ))}
          </div>
        </div>

        {/* Sliders: Duration & Prompt Influence */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-4 border-t border-slate-800/80">
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="font-semibold text-slate-300">Duração do Efeito:</span>
              <span className="font-mono text-purple-400 font-bold">{durationSeconds} segundos</span>
            </div>
            <input
              type="range"
              min="1"
              max="15"
              step="0.5"
              value={durationSeconds}
              onChange={(e) => setDurationSeconds(parseFloat(e.target.value))}
              className="w-full accent-purple-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
            />
            <span className="text-[10px] text-slate-500">De 1s até 15s de áudio</span>
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="font-semibold text-slate-300">Influência do Prompt:</span>
              <span className="font-mono text-purple-400 font-bold">
                {Math.round(promptInfluence * 100)}%
              </span>
            </div>
            <input
              type="range"
              min="0.1"
              max="1"
              step="0.05"
              value={promptInfluence}
              onChange={(e) => setPromptInfluence(parseFloat(e.target.value))}
              className="w-full accent-purple-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
            />
            <span className="text-[10px] text-slate-500">Aderência estrita à descrição</span>
          </div>
        </div>

        {/* Generate Button */}
        <button
          type="button"
          onClick={handleGenerateSFX}
          disabled={isGenerating || !prompt.trim()}
          className={`w-full py-3.5 px-6 rounded-2xl font-extrabold text-sm flex items-center justify-center gap-2 shadow-xl transition-all ${
            isGenerating || !prompt.trim()
              ? "bg-slate-800 text-slate-500 cursor-not-allowed"
              : "bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white shadow-purple-600/30 hover:scale-[1.01]"
          }`}
        >
          {isGenerating ? (
            <>
              <RefreshCw className="w-5 h-5 animate-spin" />
              <span>Gerando som com ElevenLabs SFX...</span>
            </>
          ) : (
            <>
              <Sparkles className="w-5 h-5 text-purple-200" />
              <span>Gerar Efeito Sonoro (SFX)</span>
            </>
          )}
        </button>

        {error && (
          <div className="p-3.5 bg-red-500/10 border border-red-500/30 rounded-2xl text-xs text-red-400 flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* Output Audio Player */}
      {outputAudioBase64 && (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-4 animate-in fade-in slide-in-from-bottom-4">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-purple-400 animate-pulse" />
              <h3 className="text-base font-extrabold text-white">
                Efeito Sonoro Gerado
              </h3>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-300 border border-purple-500/30">
                ElevenLabs SFX
              </span>
            </div>

            {/* Toggle player mode */}
            <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
              <button
                type="button"
                onClick={() => setPlayerMode("studio")}
                className={`px-3 py-1 rounded-lg transition-all ${
                  playerMode === "studio"
                    ? "bg-purple-600 text-white font-bold"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                Player Estúdio
              </button>
              <button
                type="button"
                onClick={() => setPlayerMode("whatsapp")}
                className={`px-3 py-1 rounded-lg transition-all ${
                  playerMode === "whatsapp"
                    ? "bg-emerald-600 text-white font-bold"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                Modo WhatsApp (✓✓)
              </button>
            </div>
          </div>

          {playerMode === "whatsapp" ? (
            <div className="p-4 bg-slate-950/60 rounded-2xl border border-slate-800/80 flex justify-center">
              <WhatsAppAudioBubble
                audioBase64={outputAudioBase64}
                mimeType={outputMimeType}
                senderName="Efeito Sonoro AI"
                text={prompt}
              />
            </div>
          ) : (
            <div className="p-4 bg-slate-950/60 rounded-2xl border border-slate-800/80">
              <AudioVisualizerPlayer
                result={{
                  id: `sfx-${Date.now()}`,
                  audioBase64: outputAudioBase64,
                  mimeType: outputMimeType,
                  text: prompt,
                  usedBaseVoice: "ElevenLabs SFX",
                  generatedAt: new Date().toISOString(),
                }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
};
