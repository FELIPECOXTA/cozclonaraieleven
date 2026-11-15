import React, { useState, useRef, useEffect } from "react";
import { Play, Pause, Download, Share2, Check, Copy } from "lucide-react";
import { downloadAudioBase64, formatDuration } from "../utils/audio";

interface WhatsAppAudioBubbleProps {
  audioBase64: string;
  mimeType?: string;
  text?: string;
  senderName?: string;
  senderAvatar?: string;
  isOutgoing?: boolean; // Outgoing (green) or incoming (dark gray)
}

// 36 bars representing voice note waveform
const WAVEFORM_HEIGHTS = [
  35, 60, 45, 80, 55, 90, 70, 40, 65, 85, 50, 95, 75, 45, 60, 80, 55, 70, 90, 60,
  45, 75, 85, 50, 65, 90, 40, 80, 60, 95, 70, 50, 65, 80, 45, 30,
];

export const WhatsAppAudioBubble: React.FC<WhatsAppAudioBubbleProps> = ({
  audioBase64,
  mimeType = "audio/wav",
  text,
  senderName = "Você",
  senderAvatar,
  isOutgoing = true,
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState<1 | 1.5 | 2>(1);
  const [hasBeenListened, setHasBeenListened] = useState(false);
  const [messageTime, setMessageTime] = useState("");
  const [copied, setCopied] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const now = new Date();
    setMessageTime(
      now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    );
  }, []);

  // Initialize Audio
  useEffect(() => {
    if (audioBase64) {
      const src = `data:${mimeType};base64,${audioBase64}`;
      const audio = new Audio(src);
      audioRef.current = audio;

      audio.onloadedmetadata = () => {
        setDuration(audio.duration);
      };

      audio.ontimeupdate = () => {
        setCurrentTime(audio.currentTime);
        if (audio.currentTime > 0.3) {
          // As soon as user plays ~0.3s, ticks and mic turn blue (WhatsApp behavior)
          setHasBeenListened(true);
        }
      };

      audio.onended = () => {
        setIsPlaying(false);
        setCurrentTime(0);
        setHasBeenListened(true);
      };

      return () => {
        audio.pause();
        audioRef.current = null;
      };
    }
  }, [audioBase64, mimeType]);

  const togglePlay = () => {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.playbackRate = playbackSpeed;
      audioRef.current.play().catch(console.error);
      setIsPlaying(true);
      setHasBeenListened(true); // Blue ticks trigger!
    }
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, clickX / rect.width));
    if (audioRef.current && duration > 0) {
      const targetTime = ratio * duration;
      audioRef.current.currentTime = targetTime;
      setCurrentTime(targetTime);
      setHasBeenListened(true);
    }
  };

  const cycleSpeed = () => {
    const speeds: (1 | 1.5 | 2)[] = [1, 1.5, 2];
    const nextIdx = (speeds.indexOf(playbackSpeed) + 1) % speeds.length;
    const nextSpeed = speeds[nextIdx];
    setPlaybackSpeed(nextSpeed);
    if (audioRef.current) {
      audioRef.current.playbackRate = nextSpeed;
    }
  };

  const handleDownload = () => {
    downloadAudioBase64(audioBase64, `audio-whatsapp-${Date.now()}.wav`, mimeType);
  };

  const handleCopyText = () => {
    if (text) {
      navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const progress = duration > 0 ? currentTime / duration : 0;
  const currentBarIndex = Math.floor(progress * WAVEFORM_HEIGHTS.length);

  return (
    <div className="w-full max-w-md mx-auto">
      {/* WhatsApp Chat Simulation Container */}
      <div className="relative rounded-3xl p-4 sm:p-6 bg-[#0b141a] border border-[#222e35] shadow-2xl overflow-hidden select-none">
        {/* Subtle WhatsApp doodle background overlay */}
        <div
          className="absolute inset-0 opacity-[0.06] pointer-events-none"
          style={{
            backgroundImage: `radial-gradient(#8696a0 1px, transparent 1px)`,
            backgroundSize: "16px 16px",
          }}
        />

        {/* Header bar simulating WhatsApp chat header */}
        <div className="relative z-10 flex items-center justify-between pb-3.5 mb-3 border-b border-[#202c33]/80 text-[#8696a0]">
          <div className="flex items-center gap-2.5">
            <div className="relative w-8 h-8 rounded-full bg-[#6a7175] flex items-center justify-center text-white font-bold text-xs">
              {senderAvatar ? (
                <img
                  src={senderAvatar}
                  alt={senderName}
                  className="w-full h-full rounded-full object-cover"
                />
              ) : (
                senderName.charAt(0).toUpperCase()
              )}
              {/* Online dot indicator */}
              <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-[#25d366] border-2 border-[#0b141a]" />
            </div>

            <div>
              <p className="text-xs font-semibold text-[#e9edef] leading-tight">
                {senderName}
              </p>
              <p className="text-[10px] text-[#25d366] font-medium leading-tight">
                {isPlaying ? "reproduzindo áudio..." : "online"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleDownload}
              title="Baixar áudio do WhatsApp"
              className="p-1.5 rounded-lg bg-[#202c33] hover:bg-[#2a3942] text-[#e9edef] text-xs transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* WhatsApp Voice Note Bubble */}
        <div
          className={`relative z-10 rounded-2xl p-3 sm:p-3.5 transition-all ${
            isOutgoing
              ? "bg-[#005c4b] text-[#e9edef] ml-auto rounded-tr-none shadow-md"
              : "bg-[#202c33] text-[#e9edef] mr-auto rounded-tl-none shadow-md"
          }`}
          style={{ maxWidth: "340px" }}
        >
          {/* Main Voice Row */}
          <div className="flex items-center gap-3">
            {/* Avatar with Mic Badge */}
            <div className="relative shrink-0">
              <div className="w-11 h-11 rounded-full bg-[#374248] flex items-center justify-center text-white text-sm font-semibold overflow-hidden border border-black/10">
                {senderAvatar ? (
                  <img
                    src={senderAvatar}
                    alt="Locutor"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-slate-300">🎙️</span>
                )}
              </div>

              {/* Mic Icon Badge at bottom right: TURNS BLUE (#53bdeb) when listened! */}
              <div
                className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center shadow-md transition-colors duration-300 ${
                  hasBeenListened
                    ? "bg-[#53bdeb] text-white"
                    : "bg-[#8696a0] text-[#111b21]"
                }`}
              >
                <svg
                  viewBox="0 0 24 24"
                  width="11"
                  height="11"
                  fill="currentColor"
                >
                  <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
                  <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
                </svg>
              </div>
            </div>

            {/* Play/Pause Button */}
            <button
              onClick={togglePlay}
              className="w-8 h-8 shrink-0 rounded-full flex items-center justify-center text-[#e9edef] hover:text-white transition-transform active:scale-90 cursor-pointer"
            >
              {isPlaying ? (
                <Pause className="w-6 h-6 fill-current" />
              ) : (
                <Play className="w-6 h-6 ml-0.5 fill-current" />
              )}
            </button>

            {/* Interactive Waveform Track */}
            <div
              onClick={handleSeek}
              className="flex-1 cursor-pointer py-2 group select-none"
            >
              <div className="h-7 flex items-center gap-[2.5px] overflow-hidden">
                {WAVEFORM_HEIGHTS.map((heightPercent, i) => {
                  const isPassed = i <= currentBarIndex;
                  // WhatsApp Waveform Color: Turns BLUE (#53bdeb) as it plays!
                  const barColor = isPassed
                    ? "#53bdeb" // WhatsApp signature blue!
                    : isOutgoing
                    ? "rgba(255,255,255,0.45)"
                    : "rgba(134,150,160,0.55)";

                  return (
                    <div
                      key={i}
                      className="flex-1 rounded-full transition-colors duration-75 relative"
                      style={{
                        height: `${heightPercent}%`,
                        backgroundColor: barColor,
                      }}
                    >
                      {/* Scrubber thumb circle at current play position */}
                      {i === currentBarIndex && isPlaying && (
                        <div className="absolute -top-1 -left-[3px] w-2.5 h-2.5 rounded-full bg-[#53bdeb] shadow-sm pointer-events-none" />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Bottom Info: Timer, Speed Button, Time & THE 2 BLUE TICKS */}
          <div className="flex items-center justify-between text-[11px] pt-1 text-[#8696a0] font-sans">
            {/* Audio Timer */}
            <span className="font-mono text-[#d1d7db] text-[11px] pl-14">
              {formatDuration(isPlaying ? currentTime : duration || 0)}
            </span>

            {/* Speed Pill (1x, 1.5x, 2x) */}
            <button
              onClick={cycleSpeed}
              className="px-1.5 py-0.5 rounded-md bg-black/20 hover:bg-black/30 text-[#d1d7db] text-[10px] font-bold transition-all ml-1"
            >
              {playbackSpeed}x
            </button>

            {/* Right side: Timestamp + THE 2 BLUE CHECKMARKS (DOIS PONTOS AZUIS) */}
            <div className="flex items-center gap-1 ml-auto">
              <span className="text-[10px] text-[#8696a0]">{messageTime}</span>

              {/* WHATSAPP DOUBLE BLUE TICKS (OS DOIS PONTOS/TIQUES QUE FICAM AZUIS) */}
              <div
                title={
                  hasBeenListened
                    ? "Áudio ouvido (2 pontos azuis)"
                    : "Áudio enviado (aguardando reprodução)"
                }
                className="flex items-center"
              >
                <svg
                  viewBox="0 0 16 15"
                  width="16"
                  height="15"
                  className={`transition-colors duration-300 ${
                    hasBeenListened ? "text-[#53bdeb]" : "text-[#8696a0]"
                  }`}
                >
                  <path
                    fill="currentColor"
                    d="M15.01 3.316l-.478-.372a.365.365 0 0 0-.51.063L8.666 9.879a.32.32 0 0 1-.484.033l-.358-.325a.319.319 0 0 0-.484.032l-.378.483a.418.418 0 0 0 .036.541l1.32 1.266c.143.14.361.125.484-.033l6.272-8.048a.365.365 0 0 0-.064-.512zm-4.1 0l-.478-.372a.365.365 0 0 0-.51.063L4.566 9.879a.32.32 0 0 1-.484.033L1.891 7.769a.366.366 0 0 0-.515.006l-.423.433a.364.364 0 0 0 .006.514l3.258 3.185c.143.14.361.125.484-.033l6.272-8.048a.365.365 0 0 0-.063-.51z"
                  />
                </svg>
              </div>
            </div>
          </div>
        </div>

        {/* Text preview & quick actions under bubble */}
        {text && (
          <div className="relative z-10 mt-3 pt-3 border-t border-[#202c33]/80 flex items-center justify-between text-xs text-[#8696a0]">
            <span className="truncate pr-2 max-w-[240px] italic">
              "{text}"
            </span>
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={handleCopyText}
                className="px-2 py-1 rounded bg-[#202c33] hover:bg-[#2a3942] text-[#e9edef] text-[11px] font-medium flex items-center gap-1 transition-colors"
              >
                {copied ? <Check className="w-3 h-3 text-[#25d366]" /> : <Copy className="w-3 h-3" />}
                {copied ? "Copiado" : "Copiar"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Blue Tick Badge Explanation */}
      <div className="mt-2 text-center">
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#111b21] border border-[#222e35] text-[11px] text-[#8696a0]">
          <span
            className={`w-2 h-2 rounded-full ${
              hasBeenListened ? "bg-[#53bdeb] animate-ping" : "bg-[#8696a0]"
            }`}
          />
          Status do WhatsApp:{" "}
          <strong
            className={hasBeenListened ? "text-[#53bdeb]" : "text-[#8696a0]"}
          >
            {hasBeenListened ? "2 Pontos Azuis (Ouvido)" : "Aguardando Reprodução"}
          </strong>
        </span>
      </div>
    </div>
  );
};
