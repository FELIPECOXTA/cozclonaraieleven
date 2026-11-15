import React, { useState } from "react";
import { Key, ShieldCheck, Check, AlertCircle, X, ExternalLink, RefreshCw, Zap } from "lucide-react";

interface ApiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentKey: string;
  onSaveKey: (key: string) => void;
}

export const ApiKeyModal: React.FC<ApiKeyModalProps> = ({
  isOpen,
  onClose,
  currentKey,
  onSaveKey,
}) => {
  const [keyInput, setKeyInput] = useState(currentKey);
  const [isValidating, setIsValidating] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  if (!isOpen) return null;

  const handleTestAndSave = async () => {
    if (!keyInput.trim()) {
      onSaveKey("");
      setStatusMsg({ type: "success", text: "Chave removida. Usando modo padrão Gemini." });
      setTimeout(onClose, 800);
      return;
    }

    setIsValidating(true);
    setStatusMsg(null);

    try {
      const response = await fetch("/api/elevenlabs/verify-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: keyInput.trim() }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Chave da ElevenLabs inválida.");
      }

      onSaveKey(keyInput.trim());
      setStatusMsg({
        type: "success",
        text: `Conectado com sucesso! Plano: ${data.tier.toUpperCase()} • ${data.characterCount.toLocaleString()} / ${data.characterLimit.toLocaleString()} caracteres.`,
      });
      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err: any) {
      setStatusMsg({
        type: "error",
        text: err.message || "Não foi possível validar a chave da ElevenLabs.",
      });
    } finally {
      setIsValidating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full p-6 sm:p-8 space-y-6 shadow-2xl relative">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-xl text-slate-400 hover:text-white bg-slate-950/60 hover:bg-slate-800 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center shadow-md">
            <Key className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-xl font-extrabold text-white tracking-tight">
              Chave de API ElevenLabs
            </h3>
            <p className="text-xs text-slate-400">
              Ativação da Clonagem Neural 100% Idêntica
            </p>
          </div>
        </div>

        {/* Explanation of Why Gemini sounds robotic vs ElevenLabs */}
        <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4 space-y-2 text-xs text-slate-300">
          <div className="flex items-center gap-1.5 font-bold text-amber-400">
            <Zap className="w-4 h-4" />
            Por que a voz da ElevenLabs fica idêntica?
          </div>
          <p className="leading-relaxed text-slate-300/90">
            O Google Gemini possui apenas 5 vozes sintéticas pré-gravadas. Para que a IA copie <strong>exatamente a sua voz original</strong> (com seus graves, respirações e sotaque real), conecte sua chave da ElevenLabs.
          </p>
          <a
            href="https://elevenlabs.io/app/speech-synthesis"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-[11px] text-indigo-400 hover:text-indigo-300 font-semibold underline decoration-indigo-500/40 pt-1"
          >
            Obter chave gratuita no site da ElevenLabs <ExternalLink className="w-3 h-3" />
          </a>
        </div>

        {/* Input */}
        <div className="space-y-2">
          <label className="text-xs font-bold uppercase tracking-wider text-slate-300">
            Cole sua API Key (xi-api-key)
          </label>
          <input
            type="password"
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            placeholder="Ex: sk_xxxxxxxxxxxxxxxxxxxxxxxx"
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 font-mono transition-colors"
          />
        </div>

        {/* Status message */}
        {statusMsg && (
          <div
            className={`p-3.5 rounded-xl border text-xs flex items-center gap-2 ${
              statusMsg.type === "success"
                ? "bg-emerald-950/40 border-emerald-800 text-emerald-300"
                : "bg-rose-950/40 border-rose-800 text-rose-300"
            }`}
          >
            {statusMsg.type === "success" ? (
              <Check className="w-4 h-4 shrink-0 text-emerald-400" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            )}
            <span>{statusMsg.text}</span>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-white transition-colors"
          >
            Cancelar
          </button>

          <button
            type="button"
            onClick={handleTestAndSave}
            disabled={isValidating}
            className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-lg shadow-indigo-600/25 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {isValidating ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Testando conexão...</span>
              </>
            ) : (
              <>
                <ShieldCheck className="w-4 h-4" />
                <span>Salvar & Ativar ElevenLabs</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
