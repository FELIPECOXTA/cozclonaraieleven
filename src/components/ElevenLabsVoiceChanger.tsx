import React, { useState, useRef } from "react";
import {
  Mic,
  Upload,
  Play,
  Pause,
  RefreshCw,
  Sliders,
  Sparkles,
  Volume2,
  CheckCircle2,
  AlertCircle,
  Download,
  Key,
  StopCircle,
} from "lucide-react";
import { ClonedVoice } from "../types";
import { WhatsAppAudioBubble } from "./WhatsAppAudioBubble";
import { AudioVisualizerPlayer } from "./AudioVisualizerPlayer";

interface ElevenLabsVoiceChangerProps {
  voices: ClonedVoice[];
  selectedVoiceId: string;
  onSelectVoiceId: (id: string) => void;
  elevenLabsApiKey: string;
  onOpenApiKeyModal: () => void;
}

export const ElevenLabsVoiceChanger: React.FC<ElevenLabsVoiceChangerProps> = ({
  voices,
  selectedVoiceId,
  onSelectVoiceId,
  elevenLabsApiKey,
  onOpenApiKeyModal,
}) => {
  const activeVoice = voices.find((v) => v.id === selectedVoiceId) || voices[0];

  const [inputMode, setInputMode] = useState<"upload" | "record">("upload");
  const [inputAudioBase64, setInputAudioBase64] = useState<string | null>(null);
  const [inputAudioMime, setInputAudioMime] = useState<string>("audio/wav");
  const [inputAudioName, setInputAudioName] = useState<string>("");
  const [inputDuration, setInputDuration] = useState<number>(0);

  // Recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  // Sliders
  const [stability, setStability] = useState(0.5);
  const [similarityBoost, setSimilarityBoost] = useState(0.85);
  const [style, setStyle] = useState(0.0);

  // Status
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Output
  const [outputAudioBase64, setOutputAudioBase64] = useState<string | null>(null);
  const [outputMimeType, setOutputMimeType] = useState<string>("audio/mpeg");
  const [outputEngine, setOutputEngine] = useState<string>("");
  const [playerMode, setPlayerMode] = useState<"whatsapp" | "studio">("whatsapp");

  // Handle file upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("audio/") && !file.name.match(/\.(mp3|wav|m4a|ogg|aac|webm)$/i)) {
      setError("Por favor, envie um arquivo de áudio válido (mp3, wav, m4a, ogg, webm).");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setInputAudioBase64(result);
      setInputAudioMime(file.type || "audio/wav");
      setInputAudioName(file.name);
      setError(null);

      // Get audio duration
      const audio = new Audio(result);
      audio.onloadedmetadata = () => {
        setInputDuration(Math.round(audio.duration));
      };
    };
    reader.readAsDataURL(file);
  };

  // Start Mic Recording
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordedChunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) {
          recordedChunksRef.current.push(ev.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: "audio/webm" });
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          setInputAudioBase64(result);
          setInputAudioMime("audio/webm");
          setInputAudioName(`Gravação-${new Date().toLocaleTimeString("pt-BR")}.webm`);
        };
        reader.readAsDataURL(blob);
        stream.getTracks().forEach((track) => track.stop());
      };

      recorder.start();
      setIsRecording(true);
      setRecordingSeconds(0);
      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } catch (err: any) {
      setError("Erro ao acessar microfone. Permita o microfone no navegador.");
    }
  };

  // Stop Mic Recording
  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
    }
  };

  // Run Speech to Speech Transformation
  const handleTransform = async () => {
    if (!inputAudioBase64) {
      setError("Por favor, envie ou grave um áudio primeiro.");
      return;
    }

    if (!elevenLabsApiKey.trim()) {
      setError("A tecnologia oficial Speech-to-Speech requer a chave da ElevenLabs conectada.");
      onOpenApiKeyModal();
      return;
    }

    setError(null);
    setIsProcessing(true);

    try {
      const response = await fetch("/api/elevenlabs/speech-to-speech", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-elevenlabs-key": elevenLabsApiKey.trim(),
        },
        body: JSON.stringify({
          voiceId: activeVoice?.id,
          audioBase64: inputAudioBase64,
          mimeType: inputAudioMime,
          stability,
          similarityBoost,
          style,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Erro no processamento Speech-to-Speech.");
      }

      setOutputAudioBase64(data.audioBase64);
      setOutputMimeType(data.mimeType || "audio/mpeg");
      setOutputEngine(data.engine || "ElevenLabs Speech-to-Speech STS");
    } catch (err: any) {
      setError(err?.message || "Ocorreu uma falha no Speech-to-Speech.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-indigo-500/10 blur-3xl pointer-events-none rounded-full" />
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 relative z-10">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-xs font-bold">
              <Sparkles className="w-3.5 h-3.5" />
              ElevenLabs Voice Changer
            </div>
            <h2 className="text-2xl font-black text-white tracking-tight">
              Speech-to-Speech (Fala para Fala)
            </h2>
            <p className="text-xs sm:text-sm text-slate-400 max-w-2xl">
              Fale no microfone ou envie um áudio gravado e transforme instantaneamente na voz clonada,
              mantendo exatamente todas as pausas, entonações, graves e emoções originais!
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

      {/* Main Grid: Input Audio + Voice Settings */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Input Selection */}
        <div className="lg:col-span-7 space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
                <Volume2 className="w-4 h-4 text-indigo-400" />
                1. Áudio de Entrada (Sua Fala)
              </h3>
              <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setInputMode("upload")}
                  className={`px-3 py-1 rounded-lg transition-all ${
                    inputMode === "upload"
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  Enviar Arquivo
                </button>
                <button
                  type="button"
                  onClick={() => setInputMode("record")}
                  className={`px-3 py-1 rounded-lg transition-all ${
                    inputMode === "record"
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  Gravar Microfone
                </button>
              </div>
            </div>

            {inputMode === "upload" ? (
              <label className="border-2 border-dashed border-slate-800 hover:border-indigo-500/50 rounded-2xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-all bg-slate-950/40 hover:bg-slate-950/70 group">
                <input
                  type="file"
                  accept="audio/*"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center group-hover:scale-110 transition-transform mb-3">
                  <Upload className="w-6 h-6" />
                </div>
                <span className="text-sm font-bold text-slate-200">
                  {inputAudioName ? "Trocar áudio selecionado" : "Clique ou arraste um arquivo de áudio"}
                </span>
                <span className="text-xs text-slate-500 mt-1">
                  Suporta MP3, WAV, M4A, OGG, WEBM até 25MB
                </span>
              </label>
            ) : (
              <div className="border border-slate-800 rounded-2xl p-8 flex flex-col items-center justify-center text-center bg-slate-950/40 space-y-4">
                <div className="relative">
                  <button
                    type="button"
                    onClick={isRecording ? stopRecording : startRecording}
                    className={`w-16 h-16 rounded-full flex items-center justify-center transition-all ${
                      isRecording
                        ? "bg-red-500 text-white shadow-lg shadow-red-500/50 animate-pulse scale-105"
                        : "bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/30"
                    }`}
                  >
                    {isRecording ? <StopCircle className="w-8 h-8" /> : <Mic className="w-8 h-8" />}
                  </button>
                  {isRecording && (
                    <span className="absolute -top-1 -right-1 flex h-4 w-4">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-4 w-4 bg-red-500"></span>
                    </span>
                  )}
                </div>
                <div>
                  <div className="text-sm font-bold text-white">
                    {isRecording ? "Gravando sua voz..." : "Clique para iniciar a gravação"}
                  </div>
                  <div className="text-xs text-slate-400 font-mono mt-1">
                    {isRecording
                      ? `Tempo: ${recordingSeconds}s • Fale naturalmente no microfone`
                      : "Grave uma frase para transformar no tom clonado"}
                  </div>
                </div>
              </div>
            )}

            {/* Input Audio Preview */}
            {inputAudioBase64 && (
              <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 overflow-hidden">
                  <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                  <div className="truncate">
                    <div className="text-xs font-bold text-slate-200 truncate">
                      {inputAudioName || "Áudio Carregado"}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      Pronto para converter com a IA
                    </div>
                  </div>
                </div>
                <audio
                  controls
                  src={inputAudioBase64}
                  className="h-8 max-w-[200px]"
                />
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Voice Selection & Settings */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-5">
            <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
              <Sliders className="w-4 h-4 text-indigo-400" />
              2. Voz Alvo & Ajustes STS
            </h3>

            {/* Voice Select */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-400">
                Transformar para a voz:
              </label>
              <select
                value={selectedVoiceId}
                onChange={(e) => onSelectVoiceId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl px-3 py-2.5 text-xs font-semibold focus:outline-none focus:border-indigo-500"
              >
                {voices.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} ({v.labels.gender} • {v.labels.graves})
                  </option>
                ))}
              </select>
            </div>

            {/* Sliders */}
            <div className="space-y-4 pt-2 border-t border-slate-800/80">
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="font-semibold text-slate-300">Estabilidade Vocal:</span>
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
                  className="w-full accent-indigo-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="font-semibold text-slate-300">Semelhança (Similarity Boost):</span>
                  <span className="font-mono text-indigo-400 font-bold">
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
                  className="w-full accent-indigo-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="font-semibold text-slate-300">Exagero de Estilo:</span>
                  <span className="font-mono text-indigo-400 font-bold">
                    {Math.round(style * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={style}
                  onChange={(e) => setStyle(parseFloat(e.target.value))}
                  className="w-full accent-indigo-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                />
              </div>
            </div>

            {/* Transform Button */}
            <button
              type="button"
              onClick={handleTransform}
              disabled={isProcessing || !inputAudioBase64}
              className={`w-full py-3.5 px-6 rounded-2xl font-extrabold text-sm flex items-center justify-center gap-2 shadow-xl transition-all ${
                isProcessing || !inputAudioBase64
                  ? "bg-slate-800 text-slate-500 cursor-not-allowed"
                  : "bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white shadow-indigo-600/30 hover:scale-[1.01]"
              }`}
            >
              {isProcessing ? (
                <>
                  <RefreshCw className="w-5 h-5 animate-spin" />
                  <span>Transformando com ElevenLabs STS...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5 text-indigo-200" />
                  <span>Transformar Voz (Speech to Speech)</span>
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
        </div>
      </div>

      {/* Output Audio Result */}
      {outputAudioBase64 && (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-4 animate-in fade-in slide-in-from-bottom-4">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
              <h3 className="text-base font-extrabold text-white">
                Resultado: Voz Transformada
              </h3>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-300 border border-indigo-500/30">
                {outputEngine}
              </span>
            </div>

            {/* Toggle player mode */}
            <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
              <button
                type="button"
                onClick={() => setPlayerMode("whatsapp")}
                className={`px-3 py-1 rounded-lg transition-all ${
                  playerMode === "whatsapp"
                    ? "bg-emerald-600 text-white font-bold"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                Modo WhatsApp (Dois Pontos Azuis ✓✓)
              </button>
              <button
                type="button"
                onClick={() => setPlayerMode("studio")}
                className={`px-3 py-1 rounded-lg transition-all ${
                  playerMode === "studio"
                    ? "bg-indigo-600 text-white font-bold"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                Modo Estúdio
              </button>
            </div>
          </div>

          {playerMode === "whatsapp" ? (
            <div className="p-4 bg-slate-950/60 rounded-2xl border border-slate-800/80 flex justify-center">
              <WhatsAppAudioBubble
                audioBase64={outputAudioBase64}
                mimeType={outputMimeType}
                senderName={activeVoice?.name || "Voz Clonada"}
                text="Áudio convertido via Speech-to-Speech"
              />
            </div>
          ) : (
            <div className="p-4 bg-slate-950/60 rounded-2xl border border-slate-800/80">
              <AudioVisualizerPlayer
                result={{
                  id: `sts-${Date.now()}`,
                  audioBase64: outputAudioBase64,
                  mimeType: outputMimeType,
                  text: "Áudio convertido via Speech-to-Speech",
                  usedBaseVoice: activeVoice?.name || "ElevenLabs STS",
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
