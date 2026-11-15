import React, { useState } from "react";
import {
  Image as ImageIcon,
  Sparkles,
  Download,
  RefreshCw,
  Sliders,
  Check,
  Maximize2,
  AlertCircle,
} from "lucide-react";

export const ImageStudio: React.FC = () => {
  const [prompt, setPrompt] = useState(
    "Retrato hiper-realista e cinematográfico do locutor em estúdio acústico profissional, fones de ouvido de estúdio, microfone vintage, iluminação âmbar suave e fundo desfocado"
  );
  const [imageSize, setImageSize] = useState<"1K" | "2K" | "4K">("2K");
  const [aspectRatio, setAspectRatio] = useState<"1:1" | "16:9" | "9:16" | "4:3">("1:1");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [usedModel, setUsedModel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const presets = [
    {
      title: "Avatar Locutor Profissional",
      prompt:
        "Retrato elegante de locutor de podcast em estúdio de gravação de som, iluminação dramática neon e âmbar, microfone Shure SM7B, 8k resolução",
    },
    {
      title: "Capa de Podcast Futurista",
      prompt:
        "Capa conceitual 3D com ondas sonoras douradas flutuando no espaço escuro com partículas de áudio luminosas, estilo minimalista moderno",
    },
    {
      title: "Foto de Perfil de Narradora",
      prompt:
        "Retrato caloroso e empático de narradora de audiolivros sorrindo em estúdio acústico com livros e iluminação suave ao entardecer",
    },
    {
      title: "Microfone Vintage & Estúdio",
      prompt:
        "Close-up cinematográfico de microfone condensador vintage com filtro anti-pop em estúdio de dublagem profissional, atmosfera nostálgica",
    },
  ];

  const handleGenerate = async () => {
    if (!prompt.trim() || isGenerating) return;
    setError(null);
    setIsGenerating(true);

    try {
      const response = await fetch("/api/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: prompt.trim(),
          imageSize,
          aspectRatio,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Falha na geração de imagem.");
      }

      setGeneratedImage(data.imageUrl);
      setUsedModel(data.model || "gemini-3-pro-image-preview");
    } catch (err: any) {
      console.error("Erro ao gerar imagem:", err);
      setError(err?.message || "Ocorreu um erro ao gerar a imagem. Tente novamente.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownloadImage = () => {
    if (!generatedImage) return;
    const a = document.createElement("a");
    a.href = generatedImage;
    a.download = `avatar-gemini-${imageSize.toLowerCase()}-${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400 flex items-center justify-center">
              <ImageIcon className="w-4 h-4" />
            </div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              Gerador de Avatares & Capas em Alta Resolução
              <span className="text-[11px] font-mono bg-purple-500/20 text-purple-300 border border-purple-500/30 px-2 py-0.5 rounded-full">
                gemini-3-pro-image-preview
              </span>
            </h3>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Gere a identidade visual do locutor da voz clonada ou capas em resoluções de até 4K.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left column: Configuration and prompt */}
        <div className="lg:col-span-7 space-y-5">
          {/* Prompt input */}
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" /> Descrição da Imagem (Prompt):
            </label>
            <textarea
              rows={4}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Descreva a foto de perfil, avatar ou capa do áudio..."
              className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-colors resize-none leading-relaxed"
            />
          </div>

          {/* Quick Preset Buttons */}
          <div className="space-y-1.5">
            <span className="text-[11px] font-semibold text-slate-400">Sugestões de temas:</span>
            <div className="grid grid-cols-2 gap-2">
              {presets.map((preset, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setPrompt(preset.prompt)}
                  className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800 hover:border-purple-500/40 text-left transition-colors group"
                >
                  <p className="text-xs font-semibold text-slate-300 group-hover:text-purple-400">
                    {preset.title}
                  </p>
                  <p className="text-[10px] text-slate-500 truncate mt-0.5">{preset.prompt}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Resolution Affordance (1K, 2K, 4K) Required */}
          <div className="space-y-2 pt-2 border-t border-slate-800">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-purple-400" /> Resolução da Imagem (Image Size):
              </label>
              <span className="text-[11px] text-purple-400 font-mono font-medium">
                {imageSize === "1K" ? "1024 × 1024 px" : imageSize === "2K" ? "2048 × 2048 px" : "4096 × 4096 px (Ultra-HD)"}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-3">
              {(["1K", "2K", "4K"] as const).map((size) => (
                <button
                  key={size}
                  type="button"
                  onClick={() => setImageSize(size)}
                  className={`py-3 px-4 rounded-xl border text-center transition-all ${
                    imageSize === size
                      ? "bg-purple-600 text-white border-purple-400 shadow-lg shadow-purple-600/30"
                      : "bg-slate-950/60 border-slate-800 text-slate-300 hover:border-slate-700"
                  }`}
                >
                  <div className="text-sm font-bold font-mono">{size}</div>
                  <div className="text-[10px] opacity-80 mt-0.5">
                    {size === "1K" ? "Padrão Rápido" : size === "2K" ? "Alta Fidelidade" : "Máxima Resolução"}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Aspect Ratio */}
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-300">
              Proporção (Aspect Ratio):
            </label>
            <div className="grid grid-cols-4 gap-2">
              {[
                { ratio: "1:1", label: "Quadrado (Avatar)" },
                { ratio: "16:9", label: "Widescreen (Vídeo)" },
                { ratio: "9:16", label: "Vertical (Reels)" },
                { ratio: "4:3", label: "Clássico" },
              ].map(({ ratio, label }) => (
                <button
                  key={ratio}
                  type="button"
                  onClick={() => setAspectRatio(ratio as any)}
                  className={`py-2 px-2 rounded-xl border text-center transition-all ${
                    aspectRatio === ratio
                      ? "bg-slate-800 text-purple-300 border-purple-500 font-semibold"
                      : "bg-slate-950/40 border-slate-800/80 text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <div className="text-xs font-mono font-bold">{ratio}</div>
                  <div className="text-[9px] truncate opacity-70">{label}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Error notice */}
          {error && (
            <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-800/50 text-xs text-rose-300 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Generate Button */}
          <button
            type="button"
            onClick={handleGenerate}
            disabled={isGenerating || !prompt.trim()}
            className="w-full py-3.5 px-6 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:opacity-40 text-white font-bold text-sm shadow-xl shadow-purple-600/20 flex items-center justify-center gap-2 transition-all active:scale-[0.99]"
          >
            {isGenerating ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Renderizando em {imageSize} com Gemini 3 Pro Image...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                Gerar Imagem em {imageSize} ✨
              </>
            )}
          </button>
        </div>

        {/* Right column: Image preview */}
        <div className="lg:col-span-5 flex flex-col items-center justify-center">
          <div className="w-full aspect-square bg-slate-950 rounded-2xl border border-slate-800/80 overflow-hidden relative flex items-center justify-center shadow-inner group">
            {generatedImage ? (
              <>
                <img
                  src={generatedImage}
                  alt="Avatar ou Capa Gerada"
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-slate-950/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                  <button
                    onClick={handleDownloadImage}
                    className="p-3 rounded-xl bg-purple-600 hover:bg-purple-500 text-white shadow-lg transition-transform active:scale-95"
                    title="Baixar imagem"
                  >
                    <Download className="w-5 h-5" />
                  </button>
                </div>
              </>
            ) : (
              <div className="text-center p-6 space-y-3">
                <div className="w-14 h-14 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-500 mx-auto">
                  <ImageIcon className="w-7 h-7" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-400">Nenhuma imagem gerada ainda</p>
                  <p className="text-xs text-slate-600 mt-1 max-w-xs mx-auto">
                    Escolha o prompt e a resolução desejada (1K, 2K ou 4K) e clique em Gerar Imagem.
                  </p>
                </div>
              </div>
            )}
          </div>

          {generatedImage && (
            <div className="w-full mt-3 flex items-center justify-between text-xs text-slate-400 px-1">
              <span className="font-mono text-[11px] text-purple-400">
                Modelo: {usedModel} • Resolução: {imageSize}
              </span>
              <button
                onClick={handleDownloadImage}
                className="text-xs font-semibold text-purple-400 hover:text-purple-300 flex items-center gap-1"
              >
                <Download className="w-3.5 h-3.5" /> Baixar PNG
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
