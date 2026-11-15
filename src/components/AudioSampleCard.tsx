import React, { useState, useRef, useEffect } from "react";
import { Mic, Square, Upload, Play, Pause, Trash2, Volume2, CheckCircle2, Sparkles } from "lucide-react";
import { AudioSample } from "../types";
import { blobToBase64, formatBytes, formatDuration, detectAudioPitch } from "../utils/audio";

interface AudioSampleCardProps {
  slotNumber: number;
  sample?: AudioSample;
  onSaveSample: (sample: AudioSample) => void;
  onRemoveSample: () => void;
  onUsePreset: (type: "male" | "female" | "deep") => void;
}

export const AudioSampleCard: React.FC<AudioSampleCardProps> = ({
  slotNumber,
  sample,
  onSaveSample,
  onRemoveSample,
  onUsePreset,
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioCurrentTime, setAudioCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [recordError, setRecordError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<any>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Clean up
  useEffect(() => {
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      if (audioElementRef.current) {
        audioElementRef.current.pause();
      }
    };
  }, []);

  // Update audio element when sample changes
  useEffect(() => {
    if (sample?.blobUrl || (sample?.data && sample?.mimeType)) {
      const src = sample.blobUrl || `data:${sample.mimeType};base64,${sample.data}`;
      const audio = new Audio(src);
      audioElementRef.current = audio;

      audio.onloadedmetadata = () => {
        setAudioDuration(audio.duration);
      };
      audio.ontimeupdate = () => {
        setAudioCurrentTime(audio.currentTime);
      };
      audio.onended = () => {
        setIsPlaying(false);
        setAudioCurrentTime(0);
      };
    } else {
      audioElementRef.current = null;
      setIsPlaying(false);
      setAudioCurrentTime(0);
    }
  }, [sample]);

  // Handle Recording
  const startRecording = async () => {
    setRecordError(null);
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

        // Detect pitch in real time
        const pitchInfo = await detectAudioPitch(base64);

        const newSample: AudioSample = {
          id: `sample-${Date.now()}`,
          name: `Gravação ${slotNumber} (${formatDuration(recordingSeconds)})`,
          data: base64,
          mimeType,
          duration: recordingSeconds,
          sizeBytes: audioBlob.size,
          blobUrl: dataUrl,
          detectedPitchHz: pitchInfo.estimatedHz,
          detectedPitchLabel: pitchInfo.pitchClassification,
        };

        onSaveSample(newSample);

        // Stop all tracks to turn off microphone indicator
        stream.getTracks().forEach((track) => track.stop());
      };

      recorder.start(200);
      setIsRecording(true);
      setRecordingSeconds(0);

      timerIntervalRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } catch (err: any) {
      console.error("Erro ao acessar microfone:", err);
      setRecordError("Não foi possível acessar o microfone. Verifique as permissões do navegador.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
    }
  };

  // Handle Play/Pause
  const togglePlay = () => {
    if (!audioElementRef.current) return;
    if (isPlaying) {
      audioElementRef.current.pause();
      setIsPlaying(false);
    } else {
      audioElementRef.current.play().catch(console.error);
      setIsPlaying(true);
    }
  };

  // Handle File Upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const { base64, dataUrl } = await blobToBase64(file);
      const pitchInfo = await detectAudioPitch(base64);

      const newSample: AudioSample = {
        id: `upload-${Date.now()}`,
        name: file.name,
        data: base64,
        mimeType: file.type || "audio/mp3",
        sizeBytes: file.size,
        blobUrl: dataUrl,
        detectedPitchHz: pitchInfo.estimatedHz,
        detectedPitchLabel: pitchInfo.pitchClassification,
      };
      onSaveSample(newSample);
    } catch (err) {
      console.error("Erro ao carregar arquivo de áudio:", err);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const isSlot1 = slotNumber === 1;

  return (
    <div
      className={`relative rounded-2xl border transition-all duration-200 overflow-hidden ${
        sample
          ? "border-emerald-500/40 bg-slate-900/80 shadow-lg shadow-emerald-500/5"
          : isRecording
          ? "border-rose-500/60 bg-rose-950/20 shadow-lg shadow-rose-500/10"
          : "border-slate-800 bg-slate-900/40 hover:border-slate-700"
      }`}
    >
      {/* Slot Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800/80 bg-slate-950/40">
        <div className="flex items-center gap-2">
          <span
            className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
              sample
                ? "bg-emerald-500 text-slate-950"
                : isSlot1
                ? "bg-amber-500 text-slate-950"
                : "bg-slate-800 text-slate-400"
            }`}
          >
            {slotNumber}
          </span>
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-300">
            {isSlot1 ? "Áudio 1 (Principal)" : `Áudio ${slotNumber} (Opcional)`}
          </span>
        </div>

        {sample && (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
            <CheckCircle2 className="w-3 h-3" />
            Voz Capturada
          </span>
        )}
      </div>

      {/* Card Content */}
      <div className="p-4">
        {sample ? (
          // Captured Audio State
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="truncate pr-2">
                <p className="text-sm font-medium text-slate-200 truncate">{sample.name}</p>
                <p className="text-[11px] text-slate-400">
                  {sample.sizeBytes ? formatBytes(sample.sizeBytes) : "Áudio de voz"} •{" "}
                  {formatDuration(audioDuration || sample.duration || 0)}
                </p>
                {sample.detectedPitchLabel && (
                  <div className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[10px] font-mono">
                    <span>🎵 Freq:</span>
                    <span>{sample.detectedPitchLabel}</span>
                  </div>
                )}
              </div>

              <button
                onClick={onRemoveSample}
                title="Remover áudio"
                className="p-2 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>

            {/* Playback bar */}
            <div className="bg-slate-950/60 rounded-xl p-3 border border-slate-800 flex items-center gap-3">
              <button
                onClick={togglePlay}
                className="w-10 h-10 rounded-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 flex items-center justify-center transition-transform active:scale-95 shadow-md shadow-emerald-500/20"
              >
                {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 ml-0.5 fill-current" />}
              </button>

              <div className="flex-1 space-y-1">
                {/* Fake waveform animation when playing */}
                <div className="h-6 flex items-center gap-0.5 px-1 overflow-hidden">
                  {[...Array(24)].map((_, i) => {
                    const progress = audioDuration ? (audioCurrentTime / audioDuration) : 0;
                    const isActive = (i / 24) <= progress;
                    const heightPercent = isPlaying
                      ? 20 + Math.sin(i * 0.8 + audioCurrentTime * 6) * 35 + 25
                      : 25 + (i % 5) * 12;
                    return (
                      <div
                        key={i}
                        className={`flex-1 rounded-full transition-all duration-100 ${
                          isActive ? "bg-emerald-400" : "bg-slate-700"
                        }`}
                        style={{ height: `${Math.max(15, Math.min(100, heightPercent))}%` }}
                      />
                    );
                  })}
                </div>
                <div className="flex justify-between text-[10px] text-slate-400 font-mono px-1">
                  <span>{formatDuration(audioCurrentTime)}</span>
                  <span>{formatDuration(audioDuration || sample.duration || 0)}</span>
                </div>
              </div>
            </div>
          </div>
        ) : isRecording ? (
          // Active Recording State
          <div className="py-4 text-center space-y-3">
            <div className="relative inline-flex items-center justify-center">
              <span className="animate-ping absolute inline-flex h-12 w-12 rounded-full bg-rose-400 opacity-40"></span>
              <div className="w-12 h-12 rounded-full bg-rose-600 flex items-center justify-center text-white shadow-lg shadow-rose-600/30">
                <Mic className="w-6 h-6 animate-pulse" />
              </div>
            </div>

            <div>
              <p className="text-sm font-semibold text-rose-300">Gravando Amostra Vocal...</p>
              <p className="text-2xl font-mono font-bold text-white tracking-widest mt-0.5">
                {formatDuration(recordingSeconds)}
              </p>
              <p className="text-[11px] text-slate-400 mt-1">Fale normalmente por 5 a 15 segundos</p>
            </div>

            <button
              onClick={stopRecording}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shadow-md shadow-rose-600/20 transition-all active:scale-95"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              Concluir Gravação
            </button>
          </div>
        ) : (
          // Empty State: Choice to record, upload, or choose preset
          <div className="space-y-3">
            {recordError && (
              <p className="text-xs text-rose-400 bg-rose-950/40 p-2 rounded-lg border border-rose-800/40">
                {recordError}
              </p>
            )}

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={startRecording}
                className="flex flex-col items-center justify-center gap-1.5 p-3.5 rounded-xl border border-slate-700/80 bg-slate-800/40 hover:bg-slate-800 hover:border-amber-500/40 text-slate-200 transition-all group"
              >
                <div className="w-9 h-9 rounded-full bg-amber-500/10 group-hover:bg-amber-500/20 text-amber-400 flex items-center justify-center transition-colors">
                  <Mic className="w-4 h-4" />
                </div>
                <span className="text-xs font-semibold">Gravar Agora</span>
                <span className="text-[10px] text-slate-400">Via microfone</span>
              </button>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex flex-col items-center justify-center gap-1.5 p-3.5 rounded-xl border border-slate-700/80 bg-slate-800/40 hover:bg-slate-800 hover:border-emerald-500/40 text-slate-200 transition-all group"
              >
                <div className="w-9 h-9 rounded-full bg-emerald-500/10 group-hover:bg-emerald-500/20 text-emerald-400 flex items-center justify-center transition-colors">
                  <Upload className="w-4 h-4" />
                </div>
                <span className="text-xs font-semibold">Fazer Upload</span>
                <span className="text-[10px] text-slate-400">MP3, WAV, M4A</span>
              </button>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*,.mp3,.wav,.m4a,.ogg,.webm"
              onChange={handleFileUpload}
              className="hidden"
            />

            {/* Quick preset selector for instant testing */}
            <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between">
              <span className="text-[11px] text-slate-400 flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-amber-400" /> Teste Rápido:
              </span>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => onUsePreset("male")}
                  className="px-2 py-0.5 text-[10px] font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-md transition-colors"
                >
                  Voz Masc.
                </button>
                <button
                  type="button"
                  onClick={() => onUsePreset("female")}
                  className="px-2 py-0.5 text-[10px] font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-md transition-colors"
                >
                  Voz Fem.
                </button>
                <button
                  type="button"
                  onClick={() => onUsePreset("deep")}
                  className="px-2 py-0.5 text-[10px] font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-md transition-colors"
                >
                  Voz Grave
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
