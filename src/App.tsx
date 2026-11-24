/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import {
  Mic,
  Sparkles,
  MessageSquare,
  Image as ImageIcon,
  Volume2,
  Info,
  Radio,
  Sliders,
  ShieldCheck,
  CheckCircle,
  Plus,
  Layers,
  Bookmark,
  Key,
} from "lucide-react";
import type { ClonedVoice } from "./types";
const ElevenLabsSpeechSynthesis = React.lazy(() => import("./components/ElevenLabsSpeechSynthesis").then(m => ({ default: m.ElevenLabsSpeechSynthesis })));
const ElevenLabsCreateVoice = React.lazy(() => import("./components/ElevenLabsCreateVoice").then(m => ({ default: m.ElevenLabsCreateVoice })));
const ElevenLabsVoiceLibrary = React.lazy(() => import("./components/ElevenLabsVoiceLibrary").then(m => ({ default: m.ElevenLabsVoiceLibrary })));
const ElevenLabsVoiceChanger = React.lazy(() => import("./components/ElevenLabsVoiceChanger").then(m => ({ default: m.ElevenLabsVoiceChanger })));
const ElevenLabsSoundEffects = React.lazy(() => import("./components/ElevenLabsSoundEffects").then(m => ({ default: m.ElevenLabsSoundEffects })));
const VoiceClonerStudio = React.lazy(() => import("./components/VoiceClonerStudio").then(m => ({ default: m.VoiceClonerStudio })));
const ChatAssistant = React.lazy(() => import("./components/ChatAssistant").then(m => ({ default: m.ChatAssistant })));
const ImageStudio = React.lazy(() => import("./components/ImageStudio").then(m => ({ default: m.ImageStudio })));
const ApiKeyModal = React.lazy(() => import("./components/ApiKeyModal").then(m => ({ default: m.ApiKeyModal })));
import QuickTranscription from "./components/QuickTranscription";

type TabKey = "transcription" | "synthesis" | "create-voice" | "sts" | "sfx" | "library" | "slots3" | "chat" | "images" | "guide";

export default function App() {
  const [activeTab, setActiveTab] = useState<TabKey>("transcription");
  const [transferredText, setTransferredText] = useState<string>("");
  const [showLegacyTools,setShowLegacyTools] = useState(false);

  // ElevenLabs API Key state
  // Nunca persistir chaves de provedores no localStorage.
  const [elevenLabsApiKey, setElevenLabsApiKey] = useState("");
  const legacyEnabled = import.meta.env.VITE_ENABLE_LEGACY_TOOLS === "true";
  const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState(false);

  const handleSaveApiKey = (newKey: string) => setElevenLabsApiKey(newKey);

  // Voices loaded from server
  const [voices, setVoices] = useState<ClonedVoice[]>([]);
  const [selectedVoiceId, setSelectedVoiceId] = useState<string>("default-male-bass");
  const [isLoadingVoices, setIsLoadingVoices] = useState(true);

  // Fetch voices on mount
  const fetchVoices = async () => {
    try {
      const res = await fetch("/api/voices");
      const data = await res.json();
      if (data.voices && Array.isArray(data.voices)) {
        setVoices(data.voices);
        if (data.voices.length > 0 && !selectedVoiceId) {
          setSelectedVoiceId(data.voices[0].id);
        }
      }
    } catch (err) {
      console.warn("Erro ao buscar vozes:", err);
    } finally {
      setIsLoadingVoices(false);
    }
  };

  useEffect(() => {
    fetchVoices();
  }, []);

  // When a voice is created in VoiceLab (/app/create-voice)
  const handleVoiceCreated = (newVoice: ClonedVoice) => {
    setVoices((prev) => [newVoice, ...prev]);
    setSelectedVoiceId(newVoice.id);
    setActiveTab("synthesis"); // Redirect to Speech Synthesis with the new voice active!
  };

  // Delete voice from library
  const handleDeleteVoice = async (id: string) => {
    try {
      const res = await fetch(`/api/voices/${id}`, { method: "DELETE" });
      if (res.ok) {
        setVoices((prev) => prev.filter((v) => v.id !== id));
        if (selectedVoiceId === id) {
          setSelectedVoiceId(voices.find((v) => v.id !== id)?.id || "");
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSelectVoiceForSpeech = (voiceId: string) => {
    setSelectedVoiceId(voiceId);
    setActiveTab("synthesis");
  };

  const handleInsertTextIntoStudio = (text: string) => {
    setTransferredText(text);
    setActiveTab("synthesis");
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-indigo-500 selection:text-white">
      {/* Top ElevenLabs Navigation Bar */}
      <header className="sticky top-0 z-50 bg-slate-950/90 backdrop-blur-md border-b border-slate-800/80 px-4 sm:px-6 py-3">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
          {/* Logo & Brand */}
          <div
            onClick={() => setActiveTab("transcription")}
            className="flex items-center gap-3 cursor-pointer select-none group"
          >
            <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-indigo-500 via-purple-500 to-indigo-600 text-white flex items-center justify-center shadow-lg shadow-indigo-500/25 group-hover:scale-105 transition-transform">
              <Radio className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-black tracking-tight text-white group-hover:text-indigo-400 transition-colors">Transcreva AI</h1>
                <span className="hidden sm:inline-flex items-center text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-300 border border-indigo-500/30 font-bold">
                  VoiceLab Studio
                </span>
              </div>
              <p className="text-[10px] sm:text-[11px] text-slate-400 leading-none">
                Grave e transcreva em até 3 minutos
              </p>
            </div>
          </div>

          {/* ElevenLabs API Key Connection Pill */}
          {legacyEnabled && showLegacyTools && <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsApiKeyModalOpen(true)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border cursor-pointer ${
                elevenLabsApiKey.trim()
                  ? "bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border-emerald-500/30 shadow-sm"
                  : "bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border-amber-500/40 shadow-sm animate-pulse"
              }`}
            >
              <Key className="w-3.5 h-3.5" />
              <span>
                {elevenLabsApiKey.trim()
                  ? "🟢 ElevenLabs Conectada (100% Idêntica)"
                  : "⚡ Conectar Chave ElevenLabs (Voz 100% Real)"}
              </span>
            </button>
          </div>}

          {/* Navigation Tabs */}
          <nav className="flex items-center gap-1 bg-slate-900/90 p-1 rounded-2xl border border-slate-800 overflow-x-auto max-w-full">
            <button type="button" onClick={() => setActiveTab("transcription")}
              aria-current={activeTab==="transcription"?"page":undefined}
              className={"flex items-center gap-2 px-4 py-2 rounded-xl min-h-11 text-sm font-bold whitespace-nowrap "+(activeTab==="transcription"?"bg-emerald-600 text-white":"bg-slate-800 text-white")}>
              <Mic size={18}/> Transcrever áudio
            </button>
            {legacyEnabled && <button type="button" onClick={() => setShowLegacyTools(v => !v)}
              className="min-h-11 px-3 py-2 rounded-xl text-xs text-slate-300 whitespace-nowrap"
              aria-expanded={showLegacyTools}>Outras ferramentas</button>}
            {legacyEnabled && showLegacyTools && <>
            <button
              onClick={() => setActiveTab("synthesis")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                activeTab === "synthesis"
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                  : "text-slate-400 hover:text-white hover:bg-slate-800/60"
              }`}
            >
              <Volume2 className="w-3.5 h-3.5" />
              <span>Texto para Fala</span>
            </button>

            <button
              onClick={() => setActiveTab("create-voice")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                activeTab === "create-voice"
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                  : "text-slate-400 hover:text-white hover:bg-slate-800/60"
              }`}
            >
              <Plus className="w-3.5 h-3.5 text-indigo-400" />
              <span>VoiceLab (Criar Voz)</span>
            </button>

            <button
              onClick={() => setActiveTab("sts")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                activeTab === "sts"
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                  : "text-slate-400 hover:text-white hover:bg-slate-800/60"
              }`}
            >
              <Mic className="w-3.5 h-3.5" />
              <span>Voice Changer (Fala para Fala)</span>
            </button>

            <button
              onClick={() => setActiveTab("sfx")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                activeTab === "sfx"
                  ? "bg-purple-600 text-white shadow-md shadow-purple-600/30"
                  : "text-slate-400 hover:text-white hover:bg-slate-800/60"
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-purple-400" />
              <span>Efeitos Sonoros (SFX)</span>
            </button>

            <button
              onClick={() => setActiveTab("library")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                activeTab === "library"
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                  : "text-slate-400 hover:text-white hover:bg-slate-800/60"
              }`}
            >
              <Bookmark className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Minhas Vozes</span>
              <span className="sm:hidden">Vozes</span>
            </button>

            <button
              onClick={() => setActiveTab("slots3")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                activeTab === "slots3"
                  ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/30"
                  : "text-slate-400 hover:text-white hover:bg-slate-800/60"
              }`}
            >
              <Mic className="w-3.5 h-3.5 text-emerald-400" />
              <span className="hidden md:inline">Clonador 3 Áudios</span>
              <span className="md:hidden">3 Áudios</span>
            </button>

            <button
              onClick={() => setActiveTab("chat")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                activeTab === "chat"
                  ? "bg-indigo-600 text-white shadow-md"
                  : "text-slate-400 hover:text-white hover:bg-slate-800/60"
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Assistente Vocal</span>
              <span className="sm:hidden">Chat</span>
            </button>

            <button
              onClick={() => setActiveTab("images")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                activeTab === "images"
                  ? "bg-purple-600 text-white shadow-md shadow-purple-600/20"
                  : "text-slate-400 hover:text-white hover:bg-slate-800/60"
              }`}
            >
              <ImageIcon className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Avatares 4K</span>
            </button>
            </>}
          </nav>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
      <React.Suspense fallback={<p role="status">Carregando ferramenta...</p>}>
        {activeTab === "transcription" && <QuickTranscription/>}
        {/* Tab 1: ElevenLabs Speech Synthesis (Texto para Fala) */}
        {activeTab === "synthesis" && (
          <ElevenLabsSpeechSynthesis
            voices={voices}
            selectedVoiceId={selectedVoiceId}
            onSelectVoiceId={setSelectedVoiceId}
            onRequestCreateVoice={() => setActiveTab("create-voice")}
            onDeleteVoice={handleDeleteVoice}
            initialText={transferredText}
            elevenLabsApiKey={elevenLabsApiKey}
            onOpenApiKeyModal={() => setIsApiKeyModalOpen(true)}
          />
        )}

        {/* Tab 2: VoiceLab Create Voice (https://elevenlabs.io/app/create-voice) */}
        {activeTab === "create-voice" && (
          <ElevenLabsCreateVoice
            onVoiceCreated={handleVoiceCreated}
            onCancel={() => setActiveTab("synthesis")}
            elevenLabsApiKey={elevenLabsApiKey}
            onOpenApiKeyModal={() => setIsApiKeyModalOpen(true)}
          />
        )}

        {/* Tab: ElevenLabs Speech-to-Speech (Voice Changer) */}
        {activeTab === "sts" && (
          <ElevenLabsVoiceChanger
            voices={voices}
            selectedVoiceId={selectedVoiceId}
            onSelectVoiceId={setSelectedVoiceId}
            elevenLabsApiKey={elevenLabsApiKey}
            onOpenApiKeyModal={() => setIsApiKeyModalOpen(true)}
          />
        )}

        {/* Tab: ElevenLabs Sound Effects (SFX) */}
        {activeTab === "sfx" && (
          <ElevenLabsSoundEffects
            elevenLabsApiKey={elevenLabsApiKey}
            onOpenApiKeyModal={() => setIsApiKeyModalOpen(true)}
          />
        )}

        {/* Tab 3: My Voices Library */}
        {activeTab === "library" && (
          <ElevenLabsVoiceLibrary
            voices={voices}
            onSelectVoiceForSpeech={handleSelectVoiceForSpeech}
            onRequestCreateVoice={() => setActiveTab("create-voice")}
            onDeleteVoice={handleDeleteVoice}
          />
        )}

        {/* Tab 4: Direct 3 Audio Slots Cloner */}
        {activeTab === "slots3" && (
          <VoiceClonerStudio key={transferredText} initialText={transferredText} />
        )}

        {/* Tab 5: Chat Assistant */}
        {activeTab === "chat" && (
          <div className="max-w-4xl mx-auto space-y-4">
            <div className="text-center space-y-1">
              <h2 className="text-2xl font-bold text-white flex items-center justify-center gap-2">
                <Sparkles className="w-5 h-5 text-indigo-400" />
                Assistente & Diretor de Dublagem
              </h2>
              <p className="text-xs text-slate-400">
                Aprimore seus roteiros, pontuação e cadência para obter entonação natural idêntica.
              </p>
            </div>
            <ChatAssistant onInsertTextIntoStudio={handleInsertTextIntoStudio} />
          </div>
        )}

        {/* Tab 6: 4K Avatars Studio */}
        {activeTab === "images" && (
          <div className="max-w-4xl mx-auto space-y-4">
            <ImageStudio />
          </div>
        )}
      </React.Suspense>
      </main>

      {/* Modal for connecting ElevenLabs API Key */}
      {legacyEnabled && <ApiKeyModal
        isOpen={isApiKeyModalOpen}
        onClose={() => setIsApiKeyModalOpen(false)}
        currentKey={elevenLabsApiKey}
        onSaveKey={handleSaveApiKey}
      />}

      {/* Footer */}
      <footer className="border-t border-slate-800/80 bg-slate-950/60 px-4 py-4 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>
              Transcreva AI · Gravação rápida e limite de três minutos
            </span>
          </div>
          <div className="flex items-center gap-4 text-slate-400">
            <span>Gravação local · Transcrição sob demanda · Cota protegida por conta</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
