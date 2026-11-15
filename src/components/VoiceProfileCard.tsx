import React from "react";
import { Sparkles, Activity, User, Volume2, Globe, Music, Gauge, FileText } from "lucide-react";
import { VoiceProfile } from "../types";

interface VoiceProfileCardProps {
  profile: VoiceProfile;
  usedBaseVoice?: string;
}

export const VoiceProfileCard: React.FC<VoiceProfileCardProps> = ({ profile, usedBaseVoice }) => {
  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
            <Activity className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-white flex items-center gap-2">
              DNA Vocal & Perfil da Voz
              <span className="text-[10px] font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                {profile.confidenceScore ? `${profile.confidenceScore}% Fidelidade` : "Clonagem Ativa"}
              </span>
            </h4>
            <p className="text-xs text-slate-400">
              Mapeamento de timbre, prosódia e dinâmica extraído das amostras de áudio
            </p>
          </div>
        </div>
      </div>

      {profile.voiceProfileSummary && (
        <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800 text-xs text-slate-300 italic flex items-start gap-2.5">
          <Sparkles className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <span>"{profile.voiceProfileSummary}"</span>
        </div>
      )}

      {/* Acoustic Parameters Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className="bg-slate-950/40 p-2.5 rounded-xl border border-slate-800/80">
          <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mb-1">
            <User className="w-3.5 h-3.5 text-blue-400" />
            Gênero Vocal
          </div>
          <p className="text-xs font-semibold text-white capitalize">
            {profile.speakerGender === "male"
              ? "Masculino"
              : profile.speakerGender === "female"
              ? "Feminino"
              : "Neutro / Misto"}
          </p>
        </div>

        <div className="bg-slate-950/40 p-2.5 rounded-xl border border-slate-800/80">
          <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mb-1">
            <Music className="w-3.5 h-3.5 text-purple-400" />
            Faixa de Pitch
          </div>
          <p className="text-xs font-semibold text-white capitalize">
            {profile.pitchLevel || "Médio equilibrado"}
          </p>
        </div>

        <div className="bg-slate-950/40 p-2.5 rounded-xl border border-slate-800/80">
          <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mb-1">
            <Globe className="w-3.5 h-3.5 text-emerald-400" />
            Sotaque & Cadência
          </div>
          <p className="text-xs font-semibold text-white truncate" title={profile.accentAndCadence}>
            {profile.accentAndCadence || "Português Natural"}
          </p>
        </div>

        <div className="bg-slate-950/40 p-2.5 rounded-xl border border-slate-800/80">
          <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mb-1">
            <Gauge className="w-3.5 h-3.5 text-amber-400" />
            Voz Base Gemini
          </div>
          <p className="text-xs font-semibold text-amber-400">
            {usedBaseVoice || profile.bestBaseVoice || "Puck"}
          </p>
        </div>
      </div>

      {/* Transcriptions from reference audio */}
      {profile.transcriptions && profile.transcriptions.length > 0 && (
        <div className="space-y-1.5 pt-1">
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-400">
            <FileText className="w-3.5 h-3.5 text-slate-400" />
            Transcrição do que foi dito no(s) áudio(s) de referência:
          </div>
          <div className="space-y-1">
            {profile.transcriptions.map((t, idx) => (
              <div
                key={idx}
                className="text-xs text-slate-300 bg-slate-950/50 px-3 py-2 rounded-lg border border-slate-800/60 font-mono"
              >
                <span className="text-amber-500 font-semibold mr-2">[Áudio {idx + 1}]:</span>
                "{t}"
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
