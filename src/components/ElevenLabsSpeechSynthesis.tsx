import React, { useState, useEffect } from "react";
import {
  Volume2,
  Sliders,
  Sparkles,
  Play,
  Pause,
  RefreshCw,
  Plus,
  Trash2,
  CheckCircle2,
  ShieldCheck,
  User,
  Radio,
  FileText,
  RotateCcw,
  Download,
  Share2,
  AlertCircle,
  ChevronDown,
  Layers,
  MessageSquare,
} from "lucide-react";
import { ClonedVoice } from "../types";
import { WhatsAppAudioBubble } from "./WhatsAppAudioBubble";
import { AudioVisualizerPlayer } from "./AudioVisualizerPlayer";

interface ElevenLabsSpeechSynthesisProps {
  voices: ClonedVoice[];
  selectedVoiceId: string;
  onSelectVoiceId: (id: string) => void;
  onRequestCreateVoice: () => void;
  onDeleteVoice?: (id: string) => void;
  initialText?: string;
  elevenLabsApiKey?: string;
  onOpenApiKeyModal?: () => void;
}

export const ElevenLabsSpeechSynthesis: React.FC<ElevenLabsSpeechSynthesisProps> = ({
  voices,
  selectedVoiceId,
  onSelectVoiceId,
  onRequestCreateVoice,
  onDeleteVoice,
  initialText = "",
  elevenLabsApiKey = "",
  onOpenApiKeyModal,
}) => {
  // Current voice
  const activeVoice = voices.find((v) => v.id === selectedVoiceId) || voices[0];

  // Text input
  const [text, setText] = useState(
    initialText ||
      "Olá! Esta é uma demonstração da minha voz idêntica gerada com a inteligência artificial, mantendo todos os graves, o timbre autêntico e a entonação natural."
  );

  // ElevenLabs Model Selector
  const [modelId, setModelId] = useState<string>("eleven_multilingual_v2");

  // ElevenLabs Voice Settings Sliders
  const [showSettings, setShowSettings] = useState(true);
  const [stability, setStability] = useState(0.75); // 0.0 to 1.0
  const [similarityBoost, setSimilarityBoost] = useState(0.95); // 0.0 to 1.0 (Idêntica ao original)
  const [styleExaggeration, setStyleExaggeration] = useState(0.1); // 0.0 to 1.0
  const [speakerBoost, setSpeakerBoost] = useState(true); // Realce de graves e timbres

  // Male tone guarantee (Never turns female!)
  const [maleTone, setMaleTone] = useState<"natural" | "deep">("natural");

  // Output Player Style: 'whatsapp' (WhatsApp Voice Note with blue double-check ticks) or 'studio' (ElevenLabs visualizer)
  const [playerMode, setPlayerMode] = useState<"whatsapp" | "studio">("whatsapp");

  // Generation status
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Results & History
  interface GenerationItem {
    id: string;
    audioBase64: string;
    mimeType: string;
    text: string;
    voiceName: string;
    generatedAt: string;
    engine?: string;
  }
  const [latestAudio, setLatestAudio] = useState<GenerationItem | null>(null);
  const [history, setHistory] = useState<GenerationItem[]>([]);

  // Preview voice sample playback
  const [playingPreviewId, setPlayingPreviewId] = useState<string | null>(null);
  const previewAudioRef = React.useRef<HTMLAudioElement | null>(null);

  const togglePreviewVoice = (v: ClonedVoice, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (playingPreviewId === v.id) {
      if (previewAudioRef.current) previewAudioRef.current.pause();
      setPlayingPreviewId(null);
    } else {
      if (previewAudioRef.current) previewAudioRef.current.pause();
      if (v.previewAudioBase64) {
        const audio = new Audio(`data:audio/wav;base64,${v.previewAudioBase64}`);
        previewAudioRef.current = audio;
        audio.onended = () => setPlayingPreviewId(null);
        audio.play().catch(console.error);
        setPlayingPreviewId(v.id);
      } else if (v.referenceWavBase64) {
        const audio = new Audio(
          v.referenceWavBase64.startsWith("data:")
            ? v.referenceWavBase64
            : `data:audio/wav;base64,${v.referenceWavBase64}`
        );
        previewAudioRef.current = audio;
        audio.onended = () => setPlayingPreviewId(null);
        audio.play().catch(console.error);
        setPlayingPreviewId(v.id);
      }
    }
  };

  // Generate Speech Call
  const handleGenerate = async () => {
    if (!text.trim()) {
      setError("Por favor, digite o texto para ser falado.");
      return;
    }

    setError(null);
    setIsGenerating(true);

    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (elevenLabsApiKey.trim()) {
        headers["x-elevenlabs-key"] = elevenLabsApiKey.trim();
      }

      const response = await fetch("/api/generate-speech", {
        method: "POST",
        headers,
        body: JSON.stringify({
          voiceId: activeVoice?.id,
          text: text.trim(),
          modelId,
          stability,
          similarityBoost,
          styleExaggeration,
          speakerBoost,
          voiceOverride:
            activeVoice?.labels?.gender === "Feminino"
              ? "Kore"
              : maleTone === "deep"
              ? "Charon"
              : "Fenrir",
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Falha na geração de fala.");
      }

      const newItem: GenerationItem = {
        id: `gen-${Date.now()}`,
        audioBase64: data.audioBase64,
        mimeType: data.mimeType || "audio/wav",
        text: text.trim(),
        voiceName: activeVoice?.name || "Voz Masculina Idêntica",
        generatedAt: data.generatedAt || new Date().toISOString(),
        engine: data.engine || (elevenLabsApiKey.trim() ? "ElevenLabs Neural Oficial" : "Gemini TTS"),
      };

      setLatestAudio(newItem);
      setHistory((prev) => [newItem, ...prev]);
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Ocorreu um erro ao sintetizar o áudio.");
    } finally {
      setIsGenerating(false);
    }
  };

  // Quick preset texts
  const sampleTexts = [
    {
      title: "Mensagem WhatsApp",
      content:
        "Fala aí! Tô te mandando esse áudio aqui rapidinho só pra confirmar que já vi tudo e deu tudo certo, beleza?",
    },
    {
      title: "Voz com Graves",
      content:
        "Esta é uma demonstração em tempo real com todos os graves naturais do falante totalmente preservados.",
    },
    {
      title: "Recado Profissional",
      content:
        "Olá, obrigado pelo seu contato. Estou gravando este retorno com a minha voz clonada em alta fidelidade.",
    },
  ];

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Top Banner ElevenLabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-2xl font-extrabold text-white tracking-tight">
              Speech Synthesis • Texto para Fala
            </h2>
            <span className="text-[10px] font-mono uppercase bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-2.5 py-0.5 rounded-full font-bold">
              ElevenLabs AI Engine
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Sintetize qualquer texto na voz clonada com fidelidade idêntica, afinação natural e graves preservados
          </p>
        </div>

        {/* Quick button to create another voice */}
        <button
          onClick={onRequestCreateVoice}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-lg shadow-indigo-600/20 transition-all active:scale-95 self-start cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Clonar Nova Voz (VoiceLab)</span>
        </button>
      </div>

      {/* Voice Selection & Sliders Card */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-5 sm:p-6 space-y-5 shadow-2xl">
        {/* Voice Selector Row */}
        <div>
          <div className="flex items-center justify-between mb-2.5">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
              <User className="w-4 h-4 text-indigo-400" />
              Selecione a Voz para Falar:
            </label>
            <span className="text-[11px] text-slate-400">
              {voices.length} voz(es) disponível(is)
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {voices.map((v) => {
              const isSelected = v.id === selectedVoiceId;
              const isMale = v.labels?.gender !== "Feminino";
              return (
                <div
                  key={v.id}
                  onClick={() => onSelectVoiceId(v.id)}
                  className={`p-3.5 rounded-2xl border transition-all cursor-pointer relative group flex flex-col justify-between ${
                    isSelected
                      ? "bg-indigo-950/40 border-indigo-500 text-white shadow-xl shadow-indigo-500/10 ring-1 ring-indigo-500/50"
                      : "bg-slate-950/60 border-slate-800 text-slate-300 hover:border-slate-700 hover:bg-slate-950"
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-2 truncate">
                        <div
                          className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${
                            isSelected
                              ? "bg-indigo-500 text-white"
                              : "bg-slate-800 text-slate-300"
                          }`}
                        >
                          {v.name.charAt(0).toUpperCase()}
                        </div>
                        <span className="text-xs font-bold truncate">{v.name}</span>
                      </div>

                      {/* Preview Button */}
                      {(v.previewAudioBase64 || v.referenceWavBase64) && (
                        <button
                          type="button"
                          onClick={(e) => togglePreviewVoice(v, e)}
                          title="Ouvir prévia"
                          className="w-6 h-6 rounded-full bg-slate-800 hover:bg-indigo-600 text-white flex items-center justify-center transition-colors shrink-0"
                        >
                          {playingPreviewId === v.id ? (
                            <Pause className="w-3 h-3" />
                          ) : (
                            <Play className="w-3 h-3 ml-0.5" />
                          )}
                        </button>
                      )}
                    </div>

                    <p className="text-[11px] text-slate-400 line-clamp-1">
                      {v.description || "Voz personalizada"}
                    </p>
                  </div>

                  <div className="flex items-center justify-between pt-2.5 mt-2 border-t border-slate-800/80 text-[10px]">
                    <span
                      className={`font-semibold px-2 py-0.5 rounded-full ${
                        isMale
                          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                          : "bg-purple-500/10 text-purple-400 border border-purple-500/20"
                      }`}
                    >
                      {v.labels?.gender || "Masculino"} • {v.labels?.graves || "Graves 100%"}
                    </span>

                    {v.category === "cloned" && (
                      <span className="text-indigo-400 font-mono font-semibold">
                        Clonada
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ElevenLabs Model Selector */}
        <div className="pt-2">
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-400" />
              Modelo de Fala ElevenLabs:
            </label>
            <span className="text-[11px] font-mono text-indigo-400">
              {modelId === "eleven_multilingual_v2"
                ? "29 Idiomas • Português BR"
                : modelId === "eleven_flash_v2_5"
                ? "Latência ~75ms"
                : "Rápido & Expressivo"}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setModelId("eleven_multilingual_v2")}
              className={`p-3 rounded-2xl border text-left transition-all ${
                modelId === "eleven_multilingual_v2"
                  ? "bg-indigo-950/50 border-indigo-500 text-white shadow-md shadow-indigo-500/10 ring-1 ring-indigo-500/30"
                  : "bg-slate-950/60 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700"
              }`}
            >
              <div className="text-xs font-bold text-slate-100 flex items-center justify-between">
                <span>Multilingual v2</span>
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-mono">
                  Recomendado
                </span>
              </div>
              <div className="text-[10px] text-slate-400 mt-1 line-clamp-2">
                Melhor fidelidade de voz, graves e prosódia autêntica em Português.
              </div>
            </button>

            <button
              type="button"
              onClick={() => setModelId("eleven_flash_v2_5")}
              className={`p-3 rounded-2xl border text-left transition-all ${
                modelId === "eleven_flash_v2_5"
                  ? "bg-indigo-950/50 border-indigo-500 text-white shadow-md shadow-indigo-500/10 ring-1 ring-indigo-500/30"
                  : "bg-slate-950/60 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700"
              }`}
            >
              <div className="text-xs font-bold text-slate-100 flex items-center justify-between">
                <span>Eleven Flash v2.5</span>
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-mono">
                  75ms
                </span>
              </div>
              <div className="text-[10px] text-slate-400 mt-1 line-clamp-2">
                Velocidade extrema de geração com baixa latência.
              </div>
            </button>

            <button
              type="button"
              onClick={() => setModelId("eleven_turbo_v2_5")}
              className={`p-3 rounded-2xl border text-left transition-all ${
                modelId === "eleven_turbo_v2_5"
                  ? "bg-indigo-950/50 border-indigo-500 text-white shadow-md shadow-indigo-500/10 ring-1 ring-indigo-500/30"
                  : "bg-slate-950/60 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700"
              }`}
            >
              <div className="text-xs font-bold text-slate-100 flex items-center justify-between">
                <span>Eleven Turbo v2.5</span>
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 font-mono">
                  Turbo
                </span>
              </div>
              <div className="text-[10px] text-slate-400 mt-1 line-clamp-2">
                Equilíbrio de qualidade e resposta rápida para textos longos.
              </div>
            </button>
          </div>
        </div>

        {/* ElevenLabs Voice Settings Toggle */}
        <div className="pt-2">
          <button
            type="button"
            onClick={() => setShowSettings(!showSettings)}
            className="flex items-center justify-between w-full p-3 rounded-2xl bg-slate-950/60 hover:bg-slate-950 border border-slate-800 text-slate-300 text-xs font-bold transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-indigo-400" />
              <span>Configurações da Voz (Voice Settings ElevenLabs)</span>
              <span className="text-[10px] text-slate-400 font-normal">
                Estabilidade, Similaridade Idêntica & Speaker Boost
              </span>
            </div>
            <ChevronDown
              className={`w-4 h-4 text-slate-400 transition-transform ${
                showSettings ? "rotate-180" : ""
              }`}
            />
          </button>

          {showSettings && (
            <div className="mt-3 p-5 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-5">
              {/* Stability Slider */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-200">
                    Estabilidade (Stability):
                  </span>
                  <span className="font-mono text-indigo-400 font-bold">
                    {Math.round(stability * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={stability}
                  onChange={(e) => setStability(parseFloat(e.target.value))}
                  className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                />
                <div className="flex justify-between text-[10px] text-slate-500">
                  <span>Mais variável / expressivo (0%)</span>
                  <span>Mais estável e consistente (100%)</span>
                </div>
              </div>

              {/* Clarity + Similarity Enhancement Slider */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-200">
                    Claridade + Similaridade Idêntica (Clarity + Similarity):
                  </span>
                  <span className="font-mono text-emerald-400 font-bold">
                    {Math.round(similarityBoost * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={similarityBoost}
                  onChange={(e) => setSimilarityBoost(parseFloat(e.target.value))}
                  className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                />
                <div className="flex justify-between text-[10px] text-slate-500">
                  <span>Padrão (0%)</span>
                  <span>Similaridade 100% Idêntica ao Áudio Original (Recomendado)</span>
                </div>
              </div>

              {/* Style Exaggeration Slider */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-200">
                    Exagero de Estilo (Style Exaggeration):
                  </span>
                  <span className="font-mono text-amber-400 font-bold">
                    {Math.round(styleExaggeration * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={styleExaggeration}
                  onChange={(e) => setStyleExaggeration(parseFloat(e.target.value))}
                  className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
                />
                <div className="flex justify-between text-[10px] text-slate-500">
                  <span>Nenhum (0%)</span>
                  <span>Enfático (100%)</span>
                </div>
              </div>

              {/* Speaker Boost Toggle & Male Tone Guarantee */}
              <div className="pt-3 border-t border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={speakerBoost}
                    onChange={(e) => setSpeakerBoost(e.target.checked)}
                    className="w-4 h-4 rounded text-emerald-500 focus:ring-0 bg-slate-800 border-slate-700"
                  />
                  <div>
                    <span className="text-xs font-bold text-slate-200">
                      Speaker Boost (Realce dos Graves & Timbres Originais)
                    </span>
                    <p className="text-[10px] text-slate-400">
                      Amplifica a ressonância natural da caixa torácica e mantém todos os graves idênticos
                    </p>
                  </div>
                </label>

                {activeVoice?.labels?.gender !== "Feminino" && (
                  <div className="flex items-center gap-2 self-start sm:self-auto bg-slate-900 p-1 rounded-xl border border-slate-800">
                    <button
                      type="button"
                      onClick={() => setMaleTone("natural")}
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${
                        maleTone === "natural"
                          ? "bg-emerald-500 text-slate-950 shadow-sm"
                          : "text-slate-400 hover:text-white"
                      }`}
                    >
                      Graves Naturais (Fenrir)
                    </button>
                    <button
                      type="button"
                      onClick={() => setMaleTone("deep")}
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${
                        maleTone === "deep"
                          ? "bg-amber-500 text-slate-950 shadow-sm"
                          : "text-slate-400 hover:text-white"
                      }`}
                    >
                      Graves Potentes (Charon)
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Script / Text Editor Section */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-5 sm:p-6 space-y-4 shadow-2xl">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <FileText className="w-4 h-4 text-emerald-400" />
              Texto para Falar com a Voz de:{" "}
              <span className="text-emerald-400 underline decoration-emerald-500/40">
                {activeVoice?.name || "Voz Selecionada"}
              </span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Escreva o que a sua voz deve falar. Cada palavra será sintetizada com fidelidade total.
            </p>
          </div>
          <span className="text-xs font-mono text-slate-400 bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800">
            {text.length} / 5000 caracteres
          </span>
        </div>

        {/* Text Area */}
        <div className="relative bg-slate-950/70 border border-slate-800 rounded-2xl p-4 focus-within:border-indigo-500/80 transition-all">
          <textarea
            rows={4}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Digite ou cole aqui o texto que a sua voz deve falar..."
            className="w-full bg-transparent text-slate-100 placeholder-slate-500 text-base leading-relaxed focus:outline-none resize-none font-sans"
          />

          {/* Quick Preset Buttons */}
          <div className="pt-3 border-t border-slate-800/80 flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-semibold text-slate-400">
              Sugestões rápidas:
            </span>
            {sampleTexts.map((sample, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setText(sample.content)}
                className="text-xs px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 transition-colors"
              >
                {sample.title}
              </button>
            ))}
          </div>
        </div>

        {/* Player Format Toggle: WhatsApp Voice Note vs Studio Player */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
          <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-2xl border border-slate-800 self-start">
            <button
              type="button"
              onClick={() => setPlayerMode("whatsapp")}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                playerMode === "whatsapp"
                  ? "bg-[#005c4b] text-white shadow-md shadow-[#005c4b]/30"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5 text-[#25d366]" />
              <span>Modo WhatsApp (2 Riscos Azuis ✓✓)</span>
            </button>

            <button
              type="button"
              onClick={() => setPlayerMode("studio")}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                playerMode === "studio"
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Player Estúdio ElevenLabs</span>
            </button>
          </div>

          <span className="text-[11px] text-slate-400">
            {playerMode === "whatsapp"
              ? "Balão de áudio oficial do WhatsApp com tiques que ficam azuis ao ouvir"
              : "Forma de onda interativa com controle de velocidade e download WAV"}
          </span>
        </div>

        {/* Error message */}
        {error && (
          <div className="p-4 rounded-2xl bg-rose-950/40 border border-rose-800 text-sm text-rose-300 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Erro ao gerar fala</p>
              <p className="text-xs text-rose-300/90 leading-relaxed">{error}</p>
            </div>
          </div>
        )}

        {/* Action Button: Generate Speech */}
        <div className="pt-2">
          <button
            type="button"
            onClick={handleGenerate}
            disabled={isGenerating || !text.trim()}
            className="w-full py-4 sm:py-5 px-6 rounded-2xl bg-gradient-to-r from-indigo-500 via-indigo-600 to-indigo-700 hover:from-indigo-400 hover:to-indigo-600 disabled:opacity-40 text-white font-extrabold text-base shadow-2xl shadow-indigo-600/25 flex items-center justify-center gap-3 transition-all active:scale-[0.99] cursor-pointer"
          >
            {isGenerating ? (
              <>
                <RefreshCw className="w-5 h-5 animate-spin" />
                <span>Sintetizando fala na voz idêntica com todos os graves...</span>
              </>
            ) : (
              <>
                <Volume2 className="w-5 h-5" />
                <span>Gerar Fala (Generate Speech) 🎙️</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Result Section */}
      {latestAudio && (
        <section className="space-y-4 pt-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-7 h-7 rounded-xl bg-emerald-500 text-slate-950 flex items-center justify-center text-xs font-bold shadow-md">
                ✓
              </span>
              <h3 className="text-lg font-bold text-white">
                Resultado: Fala Gerada na Voz Idêntica
              </h3>
            </div>

            <span className="text-xs text-emerald-400 font-semibold bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-full">
              Graves e Timbre Preservados
            </span>
          </div>

          {playerMode === "whatsapp" ? (
            <WhatsAppAudioBubble
              audioBase64={latestAudio.audioBase64}
              mimeType={latestAudio.mimeType}
              text={latestAudio.text}
              senderName={latestAudio.voiceName}
            />
          ) : (
            <AudioVisualizerPlayer
              result={{
                id: latestAudio.id,
                audioBase64: latestAudio.audioBase64,
                mimeType: latestAudio.mimeType,
                text: latestAudio.text,
                usedBaseVoice: latestAudio.voiceName,
                generatedAt: latestAudio.generatedAt,
              }}
            />
          )}
        </section>
      )}

      {/* History */}
      {history.length > 1 && (
        <div className="pt-6 border-t border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Histórico de Falas Geradas ({history.length})
            </h4>
            <button
              onClick={() => setHistory(latestAudio ? [latestAudio] : [])}
              className="text-xs text-slate-500 hover:text-slate-400"
            >
              Limpar Anteriores
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {history.slice(1).map((item) => (
              <div
                key={item.id}
                onClick={() => setLatestAudio(item)}
                className="p-3.5 rounded-2xl bg-slate-900/50 hover:bg-slate-900 border border-slate-800 hover:border-slate-700 cursor-pointer transition-all space-y-1.5"
              >
                <div className="flex items-center justify-between text-[11px] text-slate-400">
                  <span className="font-semibold text-indigo-400">{item.voiceName}</span>
                  <span>{new Date(item.generatedAt).toLocaleTimeString()}</span>
                </div>
                <p className="text-xs text-slate-300 line-clamp-2">"{item.text}"</p>
                <span className="text-[10px] text-emerald-400 font-semibold block pt-1">
                  Clique para reproduzir
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
