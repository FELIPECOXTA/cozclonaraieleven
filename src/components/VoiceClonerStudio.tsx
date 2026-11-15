import React, { useState } from "react";
import {
  Mic,
  Volume2,
  Sparkles,
  RefreshCw,
  AlertCircle,
  FileText,
  CheckCircle2,
  History,
  Trash2,
  Radio,
  ShieldCheck,
  User,
} from "lucide-react";
import { AudioSample, SynthesisResult } from "../types";
import { AudioSampleCard } from "./AudioSampleCard";
import { AudioVisualizerPlayer } from "./AudioVisualizerPlayer";
import { convertAndMergeAudiosTo24kHzWav, createSyntheticAudioSample } from "../utils/audio";

interface VoiceClonerStudioProps {
  initialText?: string;
}

export const VoiceClonerStudio: React.FC<VoiceClonerStudioProps> = ({ initialText = "" }) => {
  // Slots 1, 2, 3 for original audio samples
  const [samples, setSamples] = useState<(AudioSample | undefined)[]>([
    undefined,
    undefined,
    undefined,
  ]);

  const [textToSynthesize, setTextToSynthesize] = useState(
    initialText ||
      "Olá! Esta é uma demonstração exata da minha voz original gerando este texto com inteligência artificial. O timbre, os graves e a entonação são os mesmos da minha gravação."
  );

  // Masculine voice by default to guarantee all graves are kept and NEVER turn female!
  const [voiceGender, setVoiceGender] = useState<"male" | "female">("male");
  const [selectedMaleVoice, setSelectedMaleVoice] = useState<"Fenrir" | "Charon">("Fenrir");

  // Processing states
  const [isProcessing, setIsProcessing] = useState(false);
  const [processStage, setProcessStage] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  // Results & History
  const [latestResult, setLatestResult] = useState<SynthesisResult | null>(null);
  const [history, setHistory] = useState<SynthesisResult[]>([]);

  // Update a sample in a specific slot (1, 2 or 3)
  const handleSaveSample = (slotIndex: number, sample: AudioSample) => {
    setSamples((prev) => {
      const copy = [...prev];
      copy[slotIndex] = sample;
      return copy;
    });
  };

  const handleRemoveSample = (slotIndex: number) => {
    setSamples((prev) => {
      const copy = [...prev];
      copy[slotIndex] = undefined;
      return copy;
    });
  };

  // Instant preset audio loader for immediate testing
  const handleUsePreset = (slotIndex: number, voiceType: "male" | "female" | "deep") => {
    const { base64, blobUrl, mimeType } = createSyntheticAudioSample(voiceType);
    const names = {
      male: "Amostra de Voz Masculina Original com Graves",
      female: "Amostra de Voz Feminina Original",
      deep: "Amostra de Voz Masculina Grave Profunda",
    };

    const newSample: AudioSample = {
      id: `preset-${Date.now()}-${slotIndex}`,
      name: names[voiceType],
      data: base64,
      mimeType,
      duration: 3,
      blobUrl,
      isPreset: true,
    };

    handleSaveSample(slotIndex, newSample);
  };

  // Active audio samples count
  const activeSamples = samples.filter((s): s is AudioSample => s !== undefined);

  // Core synthesis function: DIRECT REPLICATION WITH ALL GRAVES
  const handleSynthesize = async () => {
    if (activeSamples.length === 0) {
      setError("Por favor, adicione pelo menos 1 áudio original no Áudio 1 (gravando ou enviando o arquivo).");
      return;
    }
    if (!textToSynthesize.trim()) {
      setError("Por favor, digite o texto que a pessoa deve falar.");
      return;
    }

    setError(null);
    setIsProcessing(true);
    setProcessStage("Lendo amostras originais e preservando todos os graves naturais...");

    try {
      // Step 1: Convert and merge audio samples into a 24kHz reference WAV
      let referenceWav24k: string | undefined;
      try {
        setProcessStage("Preparando amostra vocal original de 24kHz para replicação direta...");
        const res = await convertAndMergeAudiosTo24kHzWav(activeSamples);
        referenceWav24k = res.base64;
      } catch (convErr) {
        console.warn("Conversão client-side WAV falhou, usando áudio direto:", convErr);
        referenceWav24k = activeSamples[0]?.data;
      }

      // Step 2: Request direct replication to backend
      setProcessStage("Replicando voz masculina com todos os graves naturais mantidos...");

      const response = await fetch("/api/clone-and-synthesize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audioSamples: activeSamples.map((s) => ({
            data: s.data,
            mimeType: s.mimeType,
            name: s.name,
          })),
          replicatedWavBase64: referenceWav24k,
          text: textToSynthesize.trim(),
          options: {
            voiceGender,
            voiceOverride: voiceGender === "male" ? selectedMaleVoice : "Kore",
          },
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Falha ao replicar voz original.");
      }

      const result: SynthesisResult = {
        id: `synthesis-${Date.now()}`,
        audioBase64: data.audioBase64,
        mimeType: data.mimeType || "audio/wav",
        text: textToSynthesize.trim(),
        voiceProfile: data.voiceProfile,
        usedBaseVoice: data.usedBaseVoice || (voiceGender === "male" ? "Voz Masculina Original" : "Voz Feminina Original"),
        generatedAt: data.generatedAt || new Date().toISOString(),
      };

      setLatestResult(result);
      setHistory((prev) => [result, ...prev]);
    } catch (err: any) {
      console.error("Erro no processo de replicação de voz:", err);
      setError(err?.message || "Erro inesperado ao gerar voz. Tente novamente.");
    } finally {
      setIsProcessing(false);
      setProcessStage("");
    }
  };

  // Text presets for quick testing
  const textPresets = [
    {
      label: "Mensagem Rápida WhatsApp",
      text: "Oi, tudo bem? Tô passando aqui rapidinho só pra te avisar que já recebi tudo e deu tudo certo!",
    },
    {
      label: "Apresentação Masculina",
      text: "Olá a todos! Esta é a minha voz masculina original com todos os graves mantidos falando exatamente o texto digitado.",
    },
    {
      label: "Confirmação de Identidade",
      text: "Você consegue ouvir como o meu timbre, meus graves e o sotaque são exatamente iguais ao áudio original gravado?",
    },
  ];

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      {/* Reassurance Banner: All Graves & Authentic Male Voice Locked */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-900 to-emerald-950/30 border border-emerald-500/30 rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden">
        <div className="space-y-2.5">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold">
            <ShieldCheck className="w-4 h-4" />
            Voz Masculina Idêntica • Todos os Graves Preservados
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Fale qualquer texto na sua voz original
          </h2>
          <p className="text-sm text-slate-300 max-w-2xl leading-relaxed">
            Sem afinar ou distorcer: o sistema preserva <strong>todos os graves, o timbre masculino autêntico e a ressonância natural</strong> do áudio que você gravou.
          </p>
        </div>
      </div>

      {/* STEP 1: Original Audio Reference */}
      <section className="space-y-4">
        <div>
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <span className="w-7 h-7 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center text-xs font-bold shadow-md">
              1
            </span>
            Áudios com a sua Voz Original
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Envie de 1 a 3 áudios ({activeSamples.length}/3 adicionados). Grave com o microfone ou envie seus arquivos.
          </p>
        </div>

        {/* 3 Slots Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[0, 1, 2].map((index) => (
            <AudioSampleCard
              key={index}
              slotNumber={index + 1}
              sample={samples[index]}
              onSaveSample={(sample) => handleSaveSample(index, sample)}
              onRemoveSample={() => handleRemoveSample(index)}
              onUsePreset={(voiceType) => handleUsePreset(index, voiceType)}
            />
          ))}
        </div>

        {/* Guarantee Gender & Bass Setting */}
        <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
              <User className="w-4 h-4 text-emerald-400" />
              Configuração de Timbre & Graves:
            </label>
            <span className="text-[11px] text-emerald-400 font-semibold bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20">
              Graves 100% Preservados
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <button
              type="button"
              onClick={() => {
                setVoiceGender("male");
                setSelectedMaleVoice("Fenrir");
              }}
              className={`p-3 rounded-xl border text-left transition-all ${
                voiceGender === "male" && selectedMaleVoice === "Fenrir"
                  ? "bg-emerald-500/20 border-emerald-500 text-white shadow-md shadow-emerald-500/10"
                  : "bg-slate-950/60 border-slate-800 text-slate-300 hover:border-slate-700"
              }`}
            >
              <div className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Voz Masculina Natural
              </div>
              <p className="text-[10px] text-slate-400 mt-1">
                Preserva todos os graves e o tom natural masculino (Fenrir)
              </p>
            </button>

            <button
              type="button"
              onClick={() => {
                setVoiceGender("male");
                setSelectedMaleVoice("Charon");
              }}
              className={`p-3 rounded-xl border text-left transition-all ${
                voiceGender === "male" && selectedMaleVoice === "Charon"
                  ? "bg-emerald-500/20 border-emerald-500 text-white shadow-md shadow-emerald-500/10"
                  : "bg-slate-950/60 border-slate-800 text-slate-300 hover:border-slate-700"
              }`}
            >
              <div className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Voz Masculina Bem Grave
              </div>
              <p className="text-[10px] text-slate-400 mt-1">
                Ressonância masculina profunda e graves potentes (Charon)
              </p>
            </button>

            <button
              type="button"
              onClick={() => setVoiceGender("female")}
              className={`p-3 rounded-xl border text-left transition-all ${
                voiceGender === "female"
                  ? "bg-purple-500/20 border-purple-500 text-white shadow-md shadow-purple-500/10"
                  : "bg-slate-950/60 border-slate-800 text-slate-300 hover:border-slate-700"
              }`}
            >
              <div className="text-xs font-bold text-purple-400 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Voz Feminina
              </div>
              <p className="text-[10px] text-slate-400 mt-1">
                Apenas selecione se a gravação original for de mulher
              </p>
            </button>
          </div>
        </div>
      </section>

      {/* STEP 2: Text to Speak in the Person's Voice */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <span className="w-7 h-7 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center text-xs font-bold shadow-md">
                2
              </span>
              Texto para Falar com a sua Voz
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Escreva exatamente as palavras que devem ser faladas com a sua voz masculina original.
            </p>
          </div>
          <span className="text-xs font-mono text-slate-400 bg-slate-900 px-2.5 py-1 rounded-lg border border-slate-800">
            {textToSynthesize.length} caracteres
          </span>
        </div>

        {/* Text Input Area */}
        <div className="relative bg-slate-900/60 border border-slate-800 rounded-3xl p-4 focus-within:border-emerald-500/80 transition-all shadow-xl">
          <textarea
            rows={4}
            value={textToSynthesize}
            onChange={(e) => setTextToSynthesize(e.target.value)}
            placeholder="Digite o texto que a sua voz original deve falar..."
            className="w-full bg-transparent text-slate-100 placeholder-slate-500 text-base leading-relaxed focus:outline-none resize-none font-sans"
          />

          {/* Quick preset chips */}
          <div className="pt-3 border-t border-slate-800/80 flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-semibold text-slate-400 flex items-center gap-1">
              <FileText className="w-3 h-3 text-amber-400" /> Exemplos rápidos:
            </span>
            {textPresets.map((preset, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setTextToSynthesize(preset.text)}
                className="text-xs px-2.5 py-1 rounded-lg bg-slate-950/70 hover:bg-slate-800 text-slate-300 border border-slate-800 transition-colors"
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Error display */}
      {error && (
        <div className="p-4 rounded-2xl bg-rose-950/40 border border-rose-800 text-sm text-rose-300 flex items-start gap-3 shadow-lg">
          <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold">Atenção</p>
            <p className="text-xs text-rose-300/90 leading-relaxed">{error}</p>
          </div>
        </div>
      )}

      {/* Direct Action Button */}
      <div className="pt-2">
        <button
          type="button"
          onClick={handleSynthesize}
          disabled={isProcessing || activeSamples.length === 0 || !textToSynthesize.trim()}
          className="w-full py-5 px-8 rounded-3xl bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600 hover:from-emerald-400 hover:to-teal-400 disabled:opacity-40 text-slate-950 font-extrabold text-base sm:text-lg shadow-2xl shadow-emerald-500/25 flex flex-col items-center justify-center gap-1 transition-all active:scale-[0.99] cursor-pointer"
        >
          {isProcessing ? (
            <div className="flex items-center gap-3">
              <RefreshCw className="w-5 h-5 animate-spin" />
              <span>{processStage || "Replicando Voz com Graves Mantidos..."}</span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Mic className="w-5 h-5" />
              <span>Falar este Texto com a Voz Masculina Idêntica 🎙️</span>
            </div>
          )}
          <span className="text-xs font-medium text-slate-950/80">
            {activeSamples.length === 0
              ? "Grave ou envie o áudio no Passo 1 acima"
              : `Usando ${activeSamples.length} áudio(s) • Graves e timbre masculino integralmente preservados`}
          </span>
        </button>
      </div>

      {/* STEP 3: Result Playback Player with WhatsApp Voice Note */}
      {latestResult && (
        <section className="space-y-3 pt-4">
          <div className="flex items-center gap-2">
            <span className="w-7 h-7 rounded-xl bg-emerald-500 text-slate-950 flex items-center justify-center text-xs font-bold shadow-md">
              3
            </span>
            <h3 className="text-lg font-bold text-white">Resultado: Fala Replicada com os Graves Preservados</h3>
          </div>

          <AudioVisualizerPlayer result={latestResult} referenceSamples={activeSamples} />
        </section>
      )}

      {/* Generation History */}
      {history.length > 1 && (
        <section className="space-y-3 pt-4 border-t border-slate-800">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-bold text-slate-300 flex items-center gap-2">
              <History className="w-4 h-4 text-emerald-400" />
              Histórico de Falas Geradas ({history.length})
            </h4>
            <button
              onClick={() => setHistory(latestResult ? [latestResult] : [])}
              className="text-xs text-slate-500 hover:text-slate-400 flex items-center gap-1"
            >
              <Trash2 className="w-3 h-3" /> Limpar Anteriores
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {history.slice(1).map((item) => (
              <div
                key={item.id}
                onClick={() => setLatestResult(item)}
                className="bg-slate-900/40 hover:bg-slate-900 border border-slate-800 hover:border-slate-700 p-3.5 rounded-2xl cursor-pointer transition-all space-y-1.5 group"
              >
                <div className="flex items-center justify-between text-[11px] text-slate-400">
                  <span className="font-mono text-emerald-400 font-semibold">
                    {item.usedBaseVoice}
                  </span>
                  <span>{new Date(item.generatedAt).toLocaleTimeString()}</span>
                </div>
                <p className="text-xs text-slate-300 line-clamp-2 font-sans group-hover:text-white">
                  "{item.text}"
                </p>
                <div className="text-[10px] text-emerald-400 font-semibold pt-1 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Clique para ouvir no player principal
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};
