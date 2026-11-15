import React, { useState, useRef } from "react";
import {
  User,
  Play,
  Pause,
  Trash2,
  Plus,
  Sparkles,
  Volume2,
  CheckCircle2,
  Radio,
  Sliders,
  Calendar,
  Layers,
  ArrowRight,
} from "lucide-react";
import { ClonedVoice } from "../types";

interface ElevenLabsVoiceLibraryProps {
  voices: ClonedVoice[];
  onSelectVoiceForSpeech: (voiceId: string) => void;
  onRequestCreateVoice: () => void;
  onDeleteVoice: (voiceId: string) => void;
}

export const ElevenLabsVoiceLibrary: React.FC<ElevenLabsVoiceLibraryProps> = ({
  voices,
  onSelectVoiceForSpeech,
  onRequestCreateVoice,
  onDeleteVoice,
}) => {
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const togglePlayPreview = (v: ClonedVoice) => {
    if (playingId === v.id) {
      if (audioRef.current) audioRef.current.pause();
      setPlayingId(null);
    } else {
      if (audioRef.current) audioRef.current.pause();
      const audioSource =
        v.previewAudioBase64 ||
        v.referenceWavBase64;

      if (!audioSource) return;

      const src = audioSource.startsWith("data:")
        ? audioSource
        : `data:audio/wav;base64,${audioSource}`;

      const audio = new Audio(src);
      audioRef.current = audio;
      audio.onended = () => setPlayingId(null);
      audio.play().catch(console.error);
      setPlayingId(v.id);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-extrabold text-white tracking-tight">
              VoiceLab • Minha Biblioteca de Vozes
            </h2>
            <span className="text-[10px] font-mono uppercase bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-2.5 py-0.5 rounded-full font-bold">
              {voices.length} Vozes
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Gerencie suas vozes clonadas e vozes prontas para síntese de fala imediata
          </p>
        </div>

        <button
          onClick={onRequestCreateVoice}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-lg shadow-indigo-600/20 transition-all active:scale-95 self-start cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>+ Adicionar Nova Voz (Create Voice)</span>
        </button>
      </div>

      {/* Voices Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {voices.map((voice) => {
          const isMale = voice.labels?.gender !== "Feminino";
          const hasAudio = !!(voice.previewAudioBase64 || voice.referenceWavBase64);

          return (
            <div
              key={voice.id}
              className="bg-slate-900/80 border border-slate-800 hover:border-slate-700 rounded-3xl p-5 space-y-4 shadow-xl transition-all flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-12 h-12 rounded-2xl flex items-center justify-center font-extrabold text-lg shadow-md ${
                        isMale
                          ? "bg-gradient-to-tr from-emerald-600 to-teal-500 text-slate-950"
                          : "bg-gradient-to-tr from-purple-600 to-pink-500 text-white"
                      }`}
                    >
                      {voice.name.charAt(0).toUpperCase()}
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-bold text-white tracking-tight">
                          {voice.name}
                        </h3>
                        {voice.category === "cloned" ? (
                          <span className="text-[9px] font-mono uppercase bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-2 py-0.5 rounded-full font-bold">
                            Clonada
                          </span>
                        ) : (
                          <span className="text-[9px] font-mono uppercase bg-slate-800 text-slate-300 px-2 py-0.5 rounded-full">
                            Padrão
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {voice.labels?.accent || "Brasileiro"} • {voice.labels?.tone || "Natural"}
                      </p>
                    </div>
                  </div>

                  {/* Play preview button */}
                  {hasAudio && (
                    <button
                      onClick={() => togglePlayPreview(voice)}
                      className="w-9 h-9 rounded-full bg-slate-800 hover:bg-indigo-600 text-white flex items-center justify-center transition-colors shadow-md"
                      title="Ouvir amostra da voz"
                    >
                      {playingId === voice.id ? (
                        <Pause className="w-4 h-4" />
                      ) : (
                        <Play className="w-4 h-4 ml-0.5" />
                      )}
                    </button>
                  )}
                </div>

                {/* Description */}
                <p className="text-xs text-slate-300/90 leading-relaxed bg-slate-950/50 p-3 rounded-2xl border border-slate-800/80">
                  {voice.description || "Voz sem descrição detalhada."}
                </p>

                {/* Tags row */}
                <div className="flex flex-wrap items-center gap-1.5 pt-3">
                  <span
                    className={`text-[10px] font-semibold px-2.5 py-0.5 rounded-full border ${
                      isMale
                        ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                        : "bg-purple-500/10 text-purple-400 border-purple-500/20"
                    }`}
                  >
                    {voice.labels?.gender || "Masculino"}
                  </span>
                  <span className="text-[10px] font-semibold px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300">
                    {voice.labels?.graves || "Graves 100%"}
                  </span>
                  <span className="text-[10px] font-semibold px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300">
                    {voice.samplesCount} amostra(s)
                  </span>
                </div>
              </div>

              {/* Actions Footer */}
              <div className="pt-3 border-t border-slate-800 flex items-center justify-between gap-2">
                <button
                  onClick={() => onSelectVoiceForSpeech(voice.id)}
                  className="flex-1 py-2 px-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-md shadow-indigo-600/15"
                >
                  <span>Usar no Estúdio de Fala</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>

                {voice.category === "cloned" && (
                  <button
                    onClick={() => onDeleteVoice(voice.id)}
                    title="Excluir voz clonada"
                    className="p-2 rounded-xl bg-slate-950 hover:bg-rose-950/50 text-slate-400 hover:text-rose-400 border border-slate-800 hover:border-rose-800 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
