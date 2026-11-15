import React, { useState, useRef, useEffect } from "react";
import {
  Play,
  Pause,
  RotateCcw,
  Download,
  Volume2,
  VolumeX,
  Sliders,
  Check,
  Copy,
  Sparkles,
  Layers,
  MessageSquare,
  Activity,
} from "lucide-react";
import { AudioSample, SynthesisResult } from "../types";
import { downloadAudioBase64, formatDuration } from "../utils/audio";
import { WhatsAppAudioBubble } from "./WhatsAppAudioBubble";

interface AudioVisualizerPlayerProps {
  result: SynthesisResult;
  referenceSamples?: AudioSample[];
}

export const AudioVisualizerPlayer: React.FC<AudioVisualizerPlayerProps> = ({
  result,
  referenceSamples = [],
}) => {
  // Mode: 'whatsapp' (WhatsApp Voice Note with blue double-check ticks) or 'studio' (wave visualizer with A/B compare)
  const [playerView, setPlayerView] = useState<"whatsapp" | "studio">("whatsapp");

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1.0);
  const [volume, setVolume] = useState(1.0);
  const [isMuted, setIsMuted] = useState(false);
  const [copied, setCopied] = useState(false);

  // A/B comparison state: 'cloned' or 'reference'
  const [abMode, setAbMode] = useState<"cloned" | "reference">("cloned");
  const [selectedRefIndex, setSelectedRefIndex] = useState(0);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const refAudioRef = useRef<HTMLAudioElement | null>(null);

  // Create or update audio element for cloned voice
  useEffect(() => {
    if (result.audioBase64) {
      const audio = new Audio(`data:${result.mimeType || "audio/wav"};base64,${result.audioBase64}`);
      audioRef.current = audio;

      audio.onloadedmetadata = () => {
        setDuration(audio.duration);
      };
      audio.ontimeupdate = () => {
        setCurrentTime(audio.currentTime);
      };
      audio.onended = () => {
        setIsPlaying(false);
        setCurrentTime(0);
      };

      return () => {
        audio.pause();
        audioRef.current = null;
      };
    }
  }, [result.audioBase64, result.mimeType]);

  // Handle reference audio element
  const currentRefSample = referenceSamples[selectedRefIndex] || referenceSamples[0];
  useEffect(() => {
    if (currentRefSample?.blobUrl || currentRefSample?.data) {
      const src =
        currentRefSample.blobUrl ||
        `data:${currentRefSample.mimeType || "audio/mp3"};base64,${currentRefSample.data}`;
      const audio = new Audio(src);
      refAudioRef.current = audio;

      return () => {
        audio.pause();
        refAudioRef.current = null;
      };
    }
  }, [currentRefSample]);

  // Play / Pause toggle
  const togglePlay = () => {
    const activeAudio = abMode === "cloned" ? audioRef.current : refAudioRef.current;
    if (!activeAudio) return;

    if (isPlaying) {
      activeAudio.pause();
      setIsPlaying(false);
    } else {
      activeAudio.playbackRate = playbackRate;
      activeAudio.volume = isMuted ? 0 : volume;
      activeAudio.play().catch(console.error);
      setIsPlaying(true);
    }
  };

  const handleRestart = () => {
    const activeAudio = abMode === "cloned" ? audioRef.current : refAudioRef.current;
    if (activeAudio) {
      activeAudio.currentTime = 0;
      setCurrentTime(0);
      if (!isPlaying) {
        activeAudio.play().catch(console.error);
        setIsPlaying(true);
      }
    }
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickRatio = Math.max(0, Math.min(1, clickX / rect.width));
    const targetAudio = abMode === "cloned" ? audioRef.current : refAudioRef.current;
    if (targetAudio && duration > 0) {
      const newTime = clickRatio * duration;
      targetAudio.currentTime = newTime;
      setCurrentTime(newTime);
    }
  };

  const handleSpeedChange = (speed: number) => {
    setPlaybackRate(speed);
    if (audioRef.current) audioRef.current.playbackRate = speed;
    if (refAudioRef.current) refAudioRef.current.playbackRate = speed;
  };

  const handleDownload = () => {
    const filename = `audio-voz-original-${Date.now()}.wav`;
    downloadAudioBase64(result.audioBase64, filename, result.mimeType);
  };

  const handleCopyText = () => {
    navigator.clipboard.writeText(result.text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const switchMode = (mode: "cloned" | "reference") => {
    if (isPlaying) {
      if (audioRef.current) audioRef.current.pause();
      if (refAudioRef.current) refAudioRef.current.pause();
      setIsPlaying(false);
    }
    setAbMode(mode);
    setCurrentTime(0);
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="bg-gradient-to-b from-slate-900 via-slate-900/95 to-slate-950 border border-emerald-500/30 rounded-3xl p-5 sm:p-6 shadow-2xl shadow-emerald-500/10 space-y-5">
      {/* View Switcher: WhatsApp Audio vs Studio View */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-2xl border border-slate-800">
          <button
            onClick={() => setPlayerView("whatsapp")}
            className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all ${
              playerView === "whatsapp"
                ? "bg-[#25d366] text-slate-950 shadow-md shadow-[#25d366]/20"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Áudio Estilo WhatsApp (2 Pontos Azuis ✓✓)</span>
          </button>

          <button
            onClick={() => setPlayerView("studio")}
            className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all ${
              playerView === "studio"
                ? "bg-slate-700 text-white shadow-md"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Visualizador Estúdio</span>
          </button>
        </div>

        {/* Global download button */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleCopyText}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? "Copiado!" : "Copiar Texto"}
          </button>

          <button
            onClick={handleDownload}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold shadow-md shadow-emerald-500/20 transition-transform active:scale-95"
          >
            <Download className="w-3.5 h-3.5" />
            Baixar Áudio (.wav)
          </button>
        </div>
      </div>

      {/* VIEW 1: WhatsApp Voice Note Player with Blue Ticks */}
      {playerView === "whatsapp" && (
        <div className="py-2 space-y-4">
          <WhatsAppAudioBubble
            audioBase64={result.audioBase64}
            mimeType={result.mimeType}
            text={result.text}
            senderName="Voz Original da Pessoa"
            isOutgoing={true}
          />
        </div>
      )}

      {/* VIEW 2: Studio Visualizer Player */}
      {playerView === "studio" && (
        <div className="space-y-4">
          {/* Interactive Waveform Display */}
          <div
            onClick={handleSeek}
            className="relative bg-slate-950/90 rounded-2xl p-5 border border-slate-800/80 cursor-pointer group select-none hover:border-slate-700 transition-colors"
          >
            <div className="h-16 flex items-center justify-between gap-1 overflow-hidden">
              {[...Array(48)].map((_, i) => {
                const barRatio = i / 48;
                const isBarActive = barRatio <= (duration > 0 ? currentTime / duration : 0);

                const baseHeight = 25 + Math.sin(i * 0.45) * 35 + Math.cos(i * 0.9) * 20;
                const animatedHeight = isPlaying
                  ? Math.max(15, Math.min(100, baseHeight + Math.sin(currentTime * 8 + i * 0.5) * 25))
                  : baseHeight;

                return (
                  <div
                    key={i}
                    className={`flex-1 rounded-full transition-all duration-75 ${
                      isBarActive
                        ? abMode === "cloned"
                          ? "bg-gradient-to-t from-emerald-500 to-teal-300 shadow-sm shadow-emerald-400/30"
                          : "bg-gradient-to-t from-amber-500 to-amber-300 shadow-sm shadow-amber-400/30"
                        : "bg-slate-800/80 group-hover:bg-slate-700/60"
                    }`}
                    style={{ height: `${Math.max(15, Math.min(100, animatedHeight))}%` }}
                  />
                );
              })}
            </div>

            {/* Progress indicator bar underneath */}
            <div className="w-full bg-slate-800 h-1.5 rounded-full mt-3 overflow-hidden">
              <div
                className={`h-full transition-all duration-100 ${
                  abMode === "cloned" ? "bg-emerald-400" : "bg-amber-400"
                }`}
                style={{ width: `${progressPercent}%` }}
              />
            </div>

            {/* Time label overlay */}
            <div className="flex justify-between items-center text-xs font-mono text-slate-400 mt-2">
              <span>{formatDuration(currentTime)}</span>
              <span className="text-[11px] font-sans font-semibold text-slate-400">
                {abMode === "cloned" ? "Voz Replicada do Áudio" : "Áudio Original de Gravação"}
              </span>
              <span>{formatDuration(duration)}</span>
            </div>
          </div>

          {/* Primary Controls Row */}
          <div className="flex flex-wrap items-center justify-between gap-4 pt-1">
            {/* Playback Controls */}
            <div className="flex items-center gap-3">
              <button
                onClick={togglePlay}
                className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-200 active:scale-95 shadow-xl ${
                  abMode === "cloned"
                    ? "bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-emerald-500/20"
                    : "bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-amber-500/20"
                }`}
              >
                {isPlaying ? (
                  <Pause className="w-6 h-6 fill-current" />
                ) : (
                  <Play className="w-6 h-6 ml-1 fill-current" />
                )}
              </button>

              <button
                onClick={handleRestart}
                title="Reiniciar áudio"
                className="w-10 h-10 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center transition-colors"
              >
                <RotateCcw className="w-4 h-4" />
              </button>

              {/* Volume control */}
              <div className="hidden sm:flex items-center gap-2 bg-slate-950/60 px-3 py-2 rounded-xl border border-slate-800">
                <button
                  onClick={() => setIsMuted(!isMuted)}
                  className="text-slate-400 hover:text-white transition-colors"
                >
                  {isMuted || volume === 0 ? (
                    <VolumeX className="w-4 h-4 text-rose-400" />
                  ) : (
                    <Volume2 className="w-4 h-4" />
                  )}
                </button>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={isMuted ? 0 : volume}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    setVolume(val);
                    setIsMuted(false);
                    if (audioRef.current) audioRef.current.volume = val;
                    if (refAudioRef.current) refAudioRef.current.volume = val;
                  }}
                  className="w-16 accent-emerald-500 cursor-pointer"
                />
              </div>
            </div>

            {/* Speed Controls */}
            <div className="flex items-center gap-1.5 bg-slate-950/60 p-1.5 rounded-xl border border-slate-800">
              <span className="text-[11px] font-medium text-slate-400 px-2 flex items-center gap-1">
                <Sliders className="w-3 h-3 text-slate-500" />
                Velocidade:
              </span>
              {[0.75, 1.0, 1.25, 1.5].map((speed) => (
                <button
                  key={speed}
                  onClick={() => handleSpeedChange(speed)}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors ${
                    playbackRate === speed
                      ? "bg-slate-700 text-emerald-400 shadow-sm"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  {speed}x
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* A/B Switcher (Compare with original speaker) */}
      {referenceSamples.length > 0 && (
        <div className="bg-slate-950/80 p-3 rounded-2xl border border-slate-800 flex flex-wrap items-center justify-between gap-2 shadow-inner">
          <div className="flex items-center gap-2 text-xs text-slate-300 pl-2">
            <Layers className="w-4 h-4 text-emerald-400" />
            <span className="font-semibold">Comparar Lado a Lado:</span>
          </div>

          <div className="flex items-center gap-1.5 bg-slate-900 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => switchMode("cloned")}
              className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all ${
                abMode === "cloned"
                  ? "bg-emerald-500 text-slate-950 shadow-md"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              ▶️ Voz Replicada (Texto Novo)
            </button>
            <button
              onClick={() => switchMode("reference")}
              className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all ${
                abMode === "reference"
                  ? "bg-amber-500 text-slate-950 shadow-md"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              ▶️ Áudio Original Enviado
            </button>
          </div>

          {abMode === "reference" && referenceSamples.length > 1 && (
            <div className="flex items-center gap-1">
              {referenceSamples.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setSelectedRefIndex(i)}
                  className={`px-2 py-0.5 text-[11px] rounded-md font-mono ${
                    selectedRefIndex === i
                      ? "bg-slate-700 text-white font-bold"
                      : "text-slate-500 hover:text-slate-300"
                  }`}
                >
                  Amostra {i + 1}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Synthesized Text Preview Box */}
      <div className="bg-slate-950/40 rounded-2xl p-4 border border-slate-800/80">
        <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1 flex items-center gap-1.5">
          <Sparkles className="w-3 h-3 text-emerald-400" /> Texto Pronunciado com a Voz Original:
        </div>
        <p className="text-sm text-slate-200 leading-relaxed font-sans">{result.text}</p>
      </div>
    </div>
  );
};
