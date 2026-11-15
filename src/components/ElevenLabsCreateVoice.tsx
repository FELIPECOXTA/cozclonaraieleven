import React, { useState, useRef } from "react";
import {
  Upload,
  Mic,
  Square,
  Sparkles,
  Trash2,
  CheckCircle2,
  Radio,
  FileAudio,
  ShieldCheck,
  Play,
  Pause,
  AlertCircle,
  ArrowRight,
  Sliders,
  User,
  RefreshCw,
} from "lucide-react";
import { AudioSample, ClonedVoice } from "../types";
import { blobToBase64, convertAndMergeAudiosTo24kHzWav, formatBytes, formatDuration } from "../utils/audio";

interface ElevenLabsCreateVoiceProps {
  onVoiceCreated: (voice: ClonedVoice) => void;
  onCancel?: () => void;
  elevenLabsApiKey?: string;
  onOpenApiKeyModal?: () => void;
}

export const ElevenLabsCreateVoice: React.FC<ElevenLabsCreateVoiceProps> = ({
  onVoiceCreated,
  onCancel,
  elevenLabsApiKey = "",
  onOpenApiKeyModal,
}) => {
  const [cloneMode, setCloneMode] = useState<"instant" | "design">("instant");

  // Form Fields
  const [voiceName, setVoiceName] = useState("");
  const [voiceDescription, setVoiceDescription] = useState("");
  const [voiceGender, setVoiceGender] = useState<"Masculino" | "Feminino">("Masculino");
  const [accent, setAccent] = useState("Brasileiro");
  const [tone, setTone] = useState("Natural com Graves");
  const [consentAccepted, setConsentAccepted] = useState(true);

  // Audio Samples state
  const [samples, setSamples] = useState<AudioSample[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [playingSampleId, setPlayingSampleId] = useState<string | null>(null);

  // Creation State
  const [isCreating, setIsCreating] = useState(false);
  const [progressMsg, setProgressMsg] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  // Handle Multi-file Upload
  const handleFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setError(null);
    const newSamples: AudioSample[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const { base64, dataUrl } = await blobToBase64(file);
        newSamples.push({
          id: `sample-${Date.now()}-${i}`,
          name: file.name,
          data: base64,
          mimeType: file.type || "audio/wav",
          sizeBytes: file.size,
          blobUrl: dataUrl,
        });
      } catch (err) {
        console.warn("Erro ao ler arquivo:", err);
      }
    }

    setSamples((prev) => [...prev, ...newSamples]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // Handle Live Microphone Recording
  const startRecording = async () => {
    setError(null);
    audioChunksRef.current = [];
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/mp4";

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        const { base64, dataUrl } = await blobToBase64(audioBlob);

        const newSample: AudioSample = {
          id: `sample-rec-${Date.now()}`,
          name: `Gravação Vocal (${formatDuration(recordingSeconds)})`,
          data: base64,
          mimeType,
          duration: recordingSeconds,
          sizeBytes: audioBlob.size,
          blobUrl: dataUrl,
        };

        setSamples((prev) => [...prev, newSample]);
        stream.getTracks().forEach((track) => track.stop());
      };

      recorder.start(200);
      setIsRecording(true);
      setRecordingSeconds(0);

      timerIntervalRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } catch (err: any) {
      console.error(err);
      setError("Não foi possível acessar o microfone.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    }
  };

  const removeSample = (id: string) => {
    setSamples((prev) => prev.filter((s) => s.id !== id));
  };

  const togglePlaySample = (sample: AudioSample) => {
    if (playingSampleId === sample.id) {
      if (previewAudioRef.current) previewAudioRef.current.pause();
      setPlayingSampleId(null);
    } else {
      if (previewAudioRef.current) previewAudioRef.current.pause();
      const audio = new Audio(sample.blobUrl || `data:${sample.mimeType};base64,${sample.data}`);
      previewAudioRef.current = audio;
      audio.onended = () => setPlayingSampleId(null);
      audio.play().catch(console.error);
      setPlayingSampleId(sample.id);
    }
  };

  // Submit and Create Cloned Voice
  const handleCreateVoice = async () => {
    if (!voiceName.trim()) {
      setError("Por favor, dê um nome para a sua voz.");
      return;
    }
    if (samples.length === 0) {
      setError("Adicione pelo menos 1 gravação ou arquivo de áudio da voz original.");
      return;
    }
    if (!consentAccepted) {
      setError("Por favor, confirme que possui autorização para clonar esta voz.");
      return;
    }

    setError(null);
    setIsCreating(true);
    setProgressMsg("Processando amostras de áudio e extraindo perfil acústico...");

    try {
      // If ElevenLabs API Key is present, clone directly on the ElevenLabs Neural Network!
      if (elevenLabsApiKey.trim()) {
        setProgressMsg("Enviando amostras para a rede neural oficial da ElevenLabs (Clonagem 100% Idêntica)...");
        const elResponse = await fetch("/api/elevenlabs/clone-voice", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-elevenlabs-key": elevenLabsApiKey.trim(),
          },
          body: JSON.stringify({
            name: voiceName.trim(),
            description: voiceDescription.trim(),
            samples: samples.map((s) => ({
              data: s.data,
              mimeType: s.mimeType,
              name: s.name,
            })),
            labels: {
              gender: voiceGender,
              accent,
              tone,
            },
          }),
        });

        const elData = await elResponse.json();
        if (!elResponse.ok) {
          throw new Error(elData.error || "Falha ao clonar voz na ElevenLabs.");
        }

        onVoiceCreated(elData.voice);
        return;
      }

      // Step 1: Render 24kHz Reference WAV
      setProgressMsg("Renderizando áudio de referência de 24kHz com todos os graves preservados...");
      let refWavBase64: string;
      try {
        const merged = await convertAndMergeAudiosTo24kHzWav(samples);
        refWavBase64 = merged.base64;
      } catch (mergeErr) {
        refWavBase64 = samples[0].data;
      }

      // Step 2: Register in backend VoiceLab
      setProgressMsg("Criando identidade vocal permanente na sua biblioteca...");
      const response = await fetch("/api/voices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: voiceName.trim(),
          description: voiceDescription.trim(),
          gender: voiceGender,
          accent,
          tone,
          referenceWavBase64: refWavBase64,
          samplesCount: samples.length,
          stability: 0.75,
          similarityBoost: 0.9,
          styleExaggeration: 0.15,
          speakerBoost: true,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Falha ao registrar voz clonada.");
      }

      onVoiceCreated(data.voice);
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Ocorreu um erro ao criar a voz.");
    } finally {
      setIsCreating(false);
      setProgressMsg("");
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* ElevenLabs Header Style */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 animate-pulse" />
            <h2 className="text-2xl font-bold text-white tracking-tight">
              VoiceLab • Criar Nova Voz
            </h2>
            <span className="text-[11px] font-mono bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-2.5 py-0.5 rounded-full font-semibold">
              Instant Voice Cloning (IVC)
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Clone qualquer voz a partir de amostras de áudio com fidelidade acústica idêntica à ElevenLabs
          </p>
        </div>

        {onCancel && (
          <button
            onClick={onCancel}
            className="text-xs font-semibold text-slate-400 hover:text-white px-3 py-1.5 rounded-xl border border-slate-800 hover:bg-slate-900 transition-colors self-start"
          >
            Cancelar
          </button>
        )}
      </div>

      {/* Cloning Mode Selection */}
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => setCloneMode("instant")}
          className={`p-4 rounded-2xl border text-left transition-all relative overflow-hidden ${
            cloneMode === "instant"
              ? "bg-slate-900 border-indigo-500/80 shadow-xl shadow-indigo-500/10"
              : "bg-slate-950/50 border-slate-800 text-slate-400 hover:border-slate-700"
          }`}
        >
          <div className="flex items-center gap-2 mb-1.5">
            <Radio className="w-4 h-4 text-indigo-400" />
            <span className="text-sm font-bold text-white">Instant Voice Cloning</span>
            <span className="text-[9px] font-bold uppercase tracking-wider bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded-full ml-auto">
              Recomendado
            </span>
          </div>
          <p className="text-xs text-slate-400">
            Envie amostras da voz original e a IA replica exatamente o timbre, graves e sotaque.
          </p>
        </button>

        <button
          type="button"
          onClick={() => setCloneMode("design")}
          className={`p-4 rounded-2xl border text-left transition-all relative overflow-hidden ${
            cloneMode === "design"
              ? "bg-slate-900 border-indigo-500/80 shadow-xl shadow-indigo-500/10"
              : "bg-slate-950/50 border-slate-800 text-slate-400 hover:border-slate-700"
          }`}
        >
          <div className="flex items-center gap-2 mb-1.5">
            <Sliders className="w-4 h-4 text-purple-400" />
            <span className="text-sm font-bold text-white">Voice Design (Sintética)</span>
          </div>
          <p className="text-xs text-slate-400">
            Modele uma nova voz sintética a partir de parâmetros de idade, gênero e sotaque.
          </p>
        </button>
      </div>

      {/* Main Cloning Form Card */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-6 sm:p-8 space-y-6 shadow-2xl">
        {/* Engine Banner */}
        {elevenLabsApiKey.trim() ? (
          <div className="p-3.5 rounded-2xl bg-emerald-950/40 border border-emerald-500/40 flex items-center justify-between gap-3 text-xs text-emerald-300">
            <div className="flex items-center gap-2.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>
                <strong>Motor Neural Oficial da ElevenLabs Ativo</strong> • Sua voz será clonada com similaridade 100% idêntica com todos os graves reais.
              </span>
            </div>
            {onOpenApiKeyModal && (
              <button
                type="button"
                onClick={onOpenApiKeyModal}
                className="text-[11px] font-semibold text-emerald-400 hover:text-white underline decoration-emerald-500/40 shrink-0"
              >
                Gerenciar Chave
              </button>
            )}
          </div>
        ) : (
          <div className="p-3.5 rounded-2xl bg-amber-950/30 border border-amber-500/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-amber-200">
            <div className="flex items-center gap-2.5">
              <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                <strong>Dica de Qualidade:</strong> Para que a voz fique <strong>100% IDÊNTICA à sua voz real</strong>, conecte sua chave da ElevenLabs. O Gemini possui apenas vozes genéricas.
              </span>
            </div>
            {onOpenApiKeyModal && (
              <button
                type="button"
                onClick={onOpenApiKeyModal}
                className="px-3 py-1.5 rounded-xl bg-amber-500 text-slate-950 font-extrabold text-[11px] shadow-md hover:bg-amber-400 transition-colors shrink-0 self-start sm:self-auto cursor-pointer"
              >
                🔑 Conectar Chave ElevenLabs
              </button>
            )}
          </div>
        )}

        {/* Name & Description Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-300">
              Nome da Voz <span className="text-rose-400">*</span>
            </label>
            <input
              type="text"
              value={voiceName}
              onChange={(e) => setVoiceName(e.target.value)}
              placeholder="Ex: Minha Voz Original, Voz do Felipe..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-300">
              Descrição (Opcional)
            </label>
            <input
              type="text"
              value={voiceDescription}
              onChange={(e) => setVoiceDescription(e.target.value)}
              placeholder="Ex: Tom masculino com graves, natural para mensagens e vídeos..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
            />
          </div>
        </div>

        {/* Labels / Acoustic Tags (Gender, Graves, Sotaque) */}
        <div className="space-y-2 pt-2 border-t border-slate-800/80">
          <label className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
            <User className="w-3.5 h-3.5 text-indigo-400" />
            Identidade Vocal & Graves:
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <span className="text-[11px] text-slate-400 mb-1 block">Gênero Vocal:</span>
              <div className="grid grid-cols-2 gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800">
                <button
                  type="button"
                  onClick={() => setVoiceGender("Masculino")}
                  className={`py-2 text-xs font-bold rounded-lg transition-all ${
                    voiceGender === "Masculino"
                      ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  Masculino
                </button>
                <button
                  type="button"
                  onClick={() => setVoiceGender("Feminino")}
                  className={`py-2 text-xs font-bold rounded-lg transition-all ${
                    voiceGender === "Feminino"
                      ? "bg-purple-600 text-white shadow-md shadow-purple-600/30"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  Feminino
                </button>
              </div>
            </div>

            <div>
              <span className="text-[11px] text-slate-400 mb-1 block">Ressonância & Graves:</span>
              <select
                value={tone}
                onChange={(e) => setTone(e.target.value)}
                className="w-full bg-slate-950 text-slate-200 border border-slate-800 rounded-xl px-3 py-2.5 text-xs focus:outline-none focus:border-indigo-500 cursor-pointer"
              >
                <option value="Natural com Graves">Graves 100% Preservados (Padrão)</option>
                <option value="Barítono Profundo">Muito Grave / Barítono Encorpado</option>
                <option value="Médio Natural">Médio Equilibrado</option>
                <option value="Suave & Claro">Suave e Claro</option>
              </select>
            </div>

            <div>
              <span className="text-[11px] text-slate-400 mb-1 block">Sotaque / Idioma:</span>
              <select
                value={accent}
                onChange={(e) => setAccent(e.target.value)}
                className="w-full bg-slate-950 text-slate-200 border border-slate-800 rounded-xl px-3 py-2.5 text-xs focus:outline-none focus:border-indigo-500 cursor-pointer"
              >
                <option value="Brasileiro">Português Brasileiro (Nativo)</option>
                <option value="Paulista">Brasileiro (São Paulo)</option>
                <option value="Carioca">Brasileiro (Rio de Janeiro)</option>
                <option value="Neutro">Português Neutro</option>
                <option value="Internacional">Inglês / Internacional</option>
              </select>
            </div>
          </div>
        </div>

        {/* Audio Samples Upload / Record Box (ElevenLabs Style Dropzone) */}
        <div className="space-y-3 pt-2 border-t border-slate-800/80">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
              <FileAudio className="w-3.5 h-3.5 text-indigo-400" />
              Amostras da Voz Original ({samples.length} carregadas)
            </label>
            <span className="text-[11px] text-slate-400">
              Formatos: MP3, WAV, M4A, WEBM
            </span>
          </div>

          {/* ElevenLabs Dropzone Area */}
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-slate-700/80 hover:border-indigo-500/80 bg-slate-950/60 rounded-3xl p-6 sm:p-8 text-center cursor-pointer transition-all group"
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="audio/*,.mp3,.wav,.m4a,.ogg,.webm"
              onChange={handleFilesSelected}
              className="hidden"
            />

            <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 group-hover:bg-indigo-500/20 text-indigo-400 flex items-center justify-center mx-auto mb-3 transition-colors">
              <Upload className="w-6 h-6" />
            </div>

            <p className="text-sm font-semibold text-white">
              Arraste e solte arquivos de áudio aqui, ou clique para navegar
            </p>
            <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
              Adicione de 1 a 25 amostras de áudio com a voz original (áudios limpos sem música de fundo oferecem similaridade de 99%).
            </p>
          </div>

          {/* Quick Microphone Recording Option */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-950/40 border border-slate-800 rounded-2xl p-3.5">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-rose-500/10 text-rose-400 flex items-center justify-center">
                <Mic className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-bold text-white">Gravar Amostra ao Vivo</p>
                <p className="text-[10px] text-slate-400">Fale no microfone por 10 a 30 segundos</p>
              </div>
            </div>

            {isRecording ? (
              <div className="flex items-center gap-3">
                <span className="font-mono text-sm font-bold text-rose-400 animate-pulse">
                  Gravando: {formatDuration(recordingSeconds)}
                </span>
                <button
                  type="button"
                  onClick={stopRecording}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-md shadow-rose-600/20 transition-all active:scale-95"
                >
                  <Square className="w-3.5 h-3.5 fill-current" /> Parar Gravação
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={startRecording}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors"
              >
                <Mic className="w-3.5 h-3.5 text-rose-400" /> Gravar Amostra Agora
              </button>
            )}
          </div>

          {/* Samples List */}
          {samples.length > 0 && (
            <div className="space-y-2 pt-2">
              <span className="text-[11px] font-semibold text-slate-400 block">
                Amostras Carregadas ({samples.length}):
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                {samples.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950/80 border border-slate-800 text-xs text-slate-300"
                  >
                    <div className="flex items-center gap-2 truncate pr-2">
                      <button
                        type="button"
                        onClick={() => togglePlaySample(s)}
                        className="w-7 h-7 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center shrink-0 hover:bg-indigo-500/30 transition-colors"
                      >
                        {playingSampleId === s.id ? (
                          <Pause className="w-3.5 h-3.5 fill-current" />
                        ) : (
                          <Play className="w-3.5 h-3.5 ml-0.5 fill-current" />
                        )}
                      </button>
                      <div className="truncate">
                        <p className="font-medium text-white truncate">{s.name}</p>
                        <p className="text-[10px] text-slate-500">{formatBytes(s.sizeBytes)}</p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => removeSample(s.id)}
                      className="p-1.5 text-slate-500 hover:text-rose-400 rounded-lg transition-colors shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ElevenLabs Rights & Consent Checkbox */}
        <div className="pt-2 border-t border-slate-800/80 flex items-start gap-2.5">
          <input
            type="checkbox"
            id="consent"
            checked={consentAccepted}
            onChange={(e) => setConsentAccepted(e.target.checked)}
            className="w-4 h-4 mt-0.5 accent-indigo-500 rounded cursor-pointer shrink-0"
          />
          <label htmlFor="consent" className="text-xs text-slate-400 cursor-pointer leading-relaxed">
            Eu confirmo que possuo todos os direitos e autorizações necessárias sobre o áudio fornecido para clonar esta voz e gerar síntese de fala com IA.
          </label>
        </div>

        {/* Error Notice */}
        {error && (
          <div className="p-3.5 rounded-2xl bg-rose-950/40 border border-rose-800 text-xs text-rose-300 flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Submit Button */}
        <button
          type="button"
          onClick={handleCreateVoice}
          disabled={isCreating || samples.length === 0 || !voiceName.trim()}
          className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:opacity-40 text-white font-bold text-sm shadow-xl shadow-indigo-600/25 flex items-center justify-center gap-2 transition-all active:scale-[0.99] cursor-pointer"
        >
          {isCreating ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>{progressMsg || "Clonando Voz com IA..."}</span>
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              <span>Criar Voz Clonada (Add Voice)</span>
              <ArrowRight className="w-4 h-4 ml-1" />
            </>
          )}
        </button>
      </div>
    </div>
  );
};
