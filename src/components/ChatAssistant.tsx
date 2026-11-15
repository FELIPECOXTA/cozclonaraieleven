import React, { useState, useRef, useEffect } from "react";
import {
  Send,
  Bot,
  User,
  Sparkles,
  Zap,
  Cpu,
  Brain,
  CornerDownLeft,
  RefreshCw,
  Copy,
  Check,
  ArrowRight,
} from "lucide-react";
import { ChatMessage, ChatModel } from "../types";

interface ChatAssistantProps {
  onInsertTextIntoStudio?: (text: string) => void;
}

const ROLES = [
  {
    id: "director",
    name: "Diretor Vocal & Roteirista",
    description: "Ajuda a pontuar e formatar roteiros para soar como fala natural",
    icon: Sparkles,
    systemInstruction:
      "Você é o Diretor Vocal e Roteirista da VozClonar AI. " +
      "Seu objetivo é escrever, aprimorar e pontuar textos para que, ao serem sintetizados " +
      "por modelos de fala (TTS), soem com entonação humana natural, pausas perfeitas (vírgulas, reticências, travessões) " +
      "e cadência cativante. Sempre sugira exemplos práticos de textos prontos para serem falados.",
  },
  {
    id: "acoustics",
    name: "Engenheiro Acústico",
    description: "Orientações sobre captura de áudio limpo, timbre e frequência",
    icon: Cpu,
    systemInstruction:
      "Você é o Engenheiro Acústico Chefe da VozClonar AI. " +
      "Você dá orientações técnicas práticas para o usuário gravar as melhores amostras de áudio de referência: " +
      "distância do microfone, tratamento do ambiente, redução de eco, postura vocal, respiração e consistência tímbrica.",
  },
  {
    id: "storyteller",
    name: "Narrador & Dublador",
    description: "Criação de histórias imersivas, podcasts e diálogos dramáticos",
    icon: Brain,
    systemInstruction:
      "Você é um Narrador e Especialista em Dublagem. " +
      "Você cria textos cinematográficos, comerciais de impacto, aberturas de podcast e diálogos envolventes " +
      "prontos para serem convertidos em voz pela inteligência artificial.",
  },
];

export const ChatAssistant: React.FC<ChatAssistantProps> = ({ onInsertTextIntoStudio }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome-1",
      role: "model",
      text: "Olá! Sou seu Assistente e Diretor Vocal da VozClonar AI. Posso criar ou aprimorar seu roteiro para que a voz clonada soe natural, cheia de emoção e com pontuação impecável. Como posso te ajudar hoje?",
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      modelUsed: "gemini-3.8-flash",
    },
  ]);

  const [input, setInput] = useState("");
  const [selectedModel, setSelectedModel] = useState<ChatModel>("gemini-3.8-flash");
  const [selectedRole, setSelectedRole] = useState(ROLES[0].id);
  const [isLoading, setIsLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  // Auto scroll to bottom
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const activeRoleObj = ROLES.find((r) => r.id === selectedRole) || ROLES[0];

  const handleSendMessage = async (textToSend?: string) => {
    const query = (textToSend || input).trim();
    if (!query || isLoading) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      text: query,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages.map((m) => ({ role: m.role, text: m.text })),
          model: selectedModel,
          systemInstruction: activeRoleObj.systemInstruction,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Erro na resposta do chat.");
      }

      const modelMsg: ChatMessage = {
        id: `model-${Date.now()}`,
        role: "model",
        text: data.reply,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        modelUsed: data.model || selectedModel,
      };

      setMessages((prev) => [...prev, modelMsg]);
    } catch (err: any) {
      console.error("Erro no chat:", err);
      const errorMsg: ChatMessage = {
        id: `error-${Date.now()}`,
        role: "model",
        text: `Desculpe, ocorreu uma instabilidade: ${err.message || "Tente novamente em instantes."}`,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const quickPrompts = [
    "Escreva um texto promocional de 30 segundos sobre tecnologia",
    "Como usar pontuação para a voz fazer pausas naturais?",
    "Crie uma narração relaxante para meditação guiada",
    "Melhore meu texto para soar mais simpático e acolhedor",
  ];

  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col h-[700px]">
      {/* Top Controls Bar */}
      <div className="p-4 bg-slate-950/80 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
        {/* Role Selector */}
        <div className="flex items-center gap-1.5 overflow-x-auto py-0.5">
          {ROLES.map((role) => {
            const Icon = role.icon;
            const isSelected = selectedRole === role.id;
            return (
              <button
                key={role.id}
                onClick={() => setSelectedRole(role.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                  isSelected
                    ? "bg-amber-500 text-slate-950 shadow-sm"
                    : "bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {role.name}
              </button>
            );
          })}
        </div>

        {/* Model Selector per requirement */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-slate-400 font-medium">Modelo:</span>
          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value as ChatModel)}
            className="bg-slate-900 text-slate-200 border border-slate-700 rounded-xl px-2.5 py-1 text-xs font-mono focus:outline-none focus:border-amber-500 cursor-pointer"
          >
            <option value="gemini-3.8-flash">gemini-3.8-flash (Tarefas Gerais)</option>
            <option value="gemini-3.1-flash-lite">gemini-3.1-flash-lite (Ultra Rápido)</option>
            <option value="gemini-4-argon">gemini-4-argon (Tarefas Complexas)</option>
          </select>
        </div>
      </div>

      {/* Scrollable Message Thread */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 scroll-smooth"
      >
        {messages.map((msg) => {
          const isUser = msg.role === "user";
          return (
            <div
              key={msg.id}
              className={`flex gap-3 ${isUser ? "justify-end" : "justify-start"}`}
            >
              {!isUser && (
                <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-amber-500 to-amber-300 text-slate-950 flex items-center justify-center shrink-0 shadow-md">
                  <Bot className="w-4 h-4" />
                </div>
              )}

              <div
                className={`max-w-[85%] sm:max-w-[75%] rounded-2xl p-4 space-y-2 ${
                  isUser
                    ? "bg-amber-500 text-slate-950 font-medium rounded-br-none shadow-md shadow-amber-500/10"
                    : "bg-slate-950/80 text-slate-200 border border-slate-800/80 rounded-bl-none shadow-md"
                }`}
              >
                <div className="flex items-center justify-between gap-4 text-[10px] opacity-70">
                  <span className="font-semibold uppercase tracking-wider">
                    {isUser ? "Você" : `Assistente (${msg.modelUsed || selectedModel})`}
                  </span>
                  <span>{msg.timestamp}</span>
                </div>

                <div className="text-sm leading-relaxed whitespace-pre-wrap font-sans">
                  {msg.text}
                </div>

                {/* Assistant message action buttons */}
                {!isUser && (
                  <div className="flex items-center gap-2 pt-2 border-t border-slate-800/80">
                    <button
                      onClick={() => handleCopy(msg.id, msg.text)}
                      className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-white transition-colors"
                    >
                      {copiedId === msg.id ? (
                        <Check className="w-3 h-3 text-emerald-400" />
                      ) : (
                        <Copy className="w-3 h-3" />
                      )}
                      {copiedId === msg.id ? "Copiado!" : "Copiar"}
                    </button>

                    {onInsertTextIntoStudio && (
                      <button
                        onClick={() => onInsertTextIntoStudio(msg.text)}
                        className="inline-flex items-center gap-1 text-[11px] text-amber-400 hover:text-amber-300 transition-colors ml-auto font-medium"
                      >
                        Usar no Estúdio de Voz
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                )}
              </div>

              {isUser && (
                <div className="w-8 h-8 rounded-xl bg-slate-800 text-slate-300 flex items-center justify-center shrink-0">
                  <User className="w-4 h-4" />
                </div>
              )}
            </div>
          );
        })}

        {isLoading && (
          <div className="flex gap-3 justify-start items-center">
            <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center animate-spin">
              <RefreshCw className="w-4 h-4" />
            </div>
            <div className="bg-slate-950/80 border border-slate-800 rounded-2xl px-4 py-2.5 text-xs text-slate-400 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping"></span>
              Consultando {selectedModel}...
            </div>
          </div>
        )}
      </div>

      {/* Suggested Quick Prompts */}
      <div className="px-4 py-2 bg-slate-950/40 border-t border-slate-800/60 overflow-x-auto flex gap-2 no-scrollbar">
        {quickPrompts.map((prompt, i) => (
          <button
            key={i}
            onClick={() => handleSendMessage(prompt)}
            className="text-[11px] bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 px-3 py-1.5 rounded-lg whitespace-nowrap transition-colors flex items-center gap-1.5"
          >
            <Sparkles className="w-3 h-3 text-amber-400" />
            {prompt}
          </button>
        ))}
      </div>

      {/* Input Box */}
      <div className="p-4 bg-slate-950 border-t border-slate-800">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage();
          }}
          className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-2xl p-2 focus-within:border-amber-500 transition-colors"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={`Converse com o ${activeRoleObj.name}...`}
            className="flex-1 bg-transparent px-3 py-1.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none"
          />

          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="w-10 h-10 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-40 disabled:hover:bg-amber-500 text-slate-950 flex items-center justify-center transition-all"
          >
            <Send className="w-4 h-4 ml-0.5" />
          </button>
        </form>
      </div>
    </div>
  );
};
