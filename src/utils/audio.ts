/**
 * Audio processing utilities with Pitch Detection, Equalization, and Calibrated WAV export
 */

/**
 * Converts a File or Blob into base64 data URL and raw base64 string
 */
export async function blobToBase64(blob: Blob): Promise<{ dataUrl: string; base64: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.includes("base64,") ? dataUrl.split("base64,")[1] : dataUrl;
      resolve({ dataUrl, base64 });
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Formats seconds into mm:ss
 */
export function formatDuration(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

/**
 * Formats byte size into human readable string
 */
export function formatBytes(bytes?: number): string {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/**
 * Converts and merges 1, 2, or 3 audio samples into a single pristine 24kHz 16-bit mono WAV
 * required for Gemini Voice Replication (replicatedVoiceConfig).
 */
export async function convertAndMergeAudiosTo24kHzWav(
  samples: { data: string; mimeType?: string }[]
): Promise<{ base64: string; blobUrl: string }> {
  const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  const decodedBuffers: AudioBuffer[] = [];

  for (const sample of samples) {
    if (!sample.data) continue;
    try {
      const cleanData = sample.data.includes("base64,") ? sample.data.split("base64,")[1] : sample.data;
      const binary = atob(cleanData);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const buffer = await audioCtx.decodeAudioData(bytes.buffer.slice(0));
      decodedBuffers.push(buffer);
    } catch (e) {
      console.warn("Aviso ao decodificar amostra:", e);
    }
  }

  if (decodedBuffers.length === 0) {
    audioCtx.close();
    throw new Error("Não foi possível processar o áudio original enviado.");
  }

  // 24kHz mono PCM WAV required by Gemini replicatedVoiceConfig
  const targetSampleRate = 24000;
  let totalLength = 0;
  for (const buf of decodedBuffers) {
    totalLength += Math.floor(buf.duration * targetSampleRate);
  }

  // Cap at 25 seconds of clean voice reference
  totalLength = Math.min(totalLength, targetSampleRate * 25);

  const offlineCtx = new OfflineAudioContext(1, totalLength, targetSampleRate);
  let currentOffsetSec = 0;

  for (const buf of decodedBuffers) {
    if (currentOffsetSec >= 24) break;
    const source = offlineCtx.createBufferSource();
    source.buffer = buf;
    source.connect(offlineCtx.destination);
    source.start(currentOffsetSec);
    currentOffsetSec += buf.duration;
  }

  const rendered24kBuffer = await offlineCtx.startRendering();
  audioCtx.close();

  const wavBlob = audioBufferToWavBlob(rendered24kBuffer);
  const { base64, dataUrl } = await blobToBase64(wavBlob);

  return { base64, blobUrl: dataUrl };
}

/**
 * Converts AudioBuffer to a standard 16-bit PCM WAV Blob
 */
export function audioBufferToWavBlob(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;

  const dataLength = buffer.length * blockAlign;
  const bufferLength = 44 + dataLength;

  const arrayBuffer = new ArrayBuffer(bufferLength);
  const view = new DataView(arrayBuffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  /* RIFF identifier */
  writeString(0, "RIFF");
  /* file length */
  view.setUint32(4, 36 + dataLength, true);
  /* RIFF type */
  writeString(8, "WAVE");
  /* format chunk identifier */
  writeString(12, "fmt ");
  /* format chunk length */
  view.setUint32(16, 16, true);
  /* sample format (raw) */
  view.setUint16(20, format, true);
  /* channel count */
  view.setUint16(22, numChannels, true);
  /* sample rate */
  view.setUint32(24, sampleRate, true);
  /* byte rate (sample rate * block align) */
  view.setUint32(28, sampleRate * blockAlign, true);
  /* block align */
  view.setUint16(32, blockAlign, true);
  /* bits per sample */
  view.setUint16(34, bitDepth, true);
  /* data chunk identifier */
  writeString(36, "data");
  /* data chunk length */
  view.setUint32(40, dataLength, true);

  // Interleave channel data and clamp to 16-bit
  let offset = 44;
  for (let i = 0; i < buffer.length; i++) {
    for (let channel = 0; channel < numChannels; channel++) {
      let sample = buffer.getChannelData(channel)[i];
      // Clamp between -1 and 1
      sample = Math.max(-1, Math.min(1, sample));
      // Scale to 16-bit signed integer
      const intSample = sample < 0 ? sample * 32768 : sample * 32767;
      view.setInt16(offset, intSample, true);
      offset += 2;
    }
  }

  return new Blob([arrayBuffer], { type: "audio/wav" });
}

/**
 * Measures estimated fundamental frequency (F0 in Hz) using autocorrelation
 */
export async function detectAudioPitch(base64Audio: string): Promise<{
  estimatedHz: number;
  pitchClassification: string;
  recommendedBaseVoice: "Puck" | "Zephyr" | "Kore" | "Fenrir" | "Charon";
}> {
  try {
    const binary = atob(base64Audio);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const audioBuffer = await audioCtx.decodeAudioData(bytes.buffer.slice(0));

    const channelData = audioBuffer.getChannelData(0);
    const sampleRate = audioBuffer.sampleRate;

    // Autocorrelation over multiple windows
    const windowSize = 2048;
    const numWindows = Math.min(10, Math.floor(channelData.length / windowSize));
    const detectedPitches: number[] = [];

    for (let w = 0; w < numWindows; w++) {
      const offset = Math.floor(w * (channelData.length / numWindows));
      const slice = channelData.slice(offset, offset + windowSize);

      // Simple RMS check to avoid silent parts
      let sumSquares = 0;
      for (let j = 0; j < slice.length; j++) sumSquares += slice[j] * slice[j];
      const rms = Math.sqrt(sumSquares / slice.length);
      if (rms < 0.02) continue; // skip silence

      // Autocorrelation
      let maxCorr = -1;
      let bestLag = -1;
      const minLag = Math.floor(sampleRate / 450); // ~450 Hz max
      const maxLag = Math.floor(sampleRate / 80); // ~80 Hz min

      for (let lag = minLag; lag <= maxLag; lag++) {
        let corr = 0;
        for (let i = 0; i < slice.length - lag; i++) {
          corr += slice[i] * slice[i + lag];
        }
        if (corr > maxCorr) {
          maxCorr = corr;
          bestLag = lag;
        }
      }

      if (bestLag > 0) {
        const freq = sampleRate / bestLag;
        if (freq >= 80 && freq <= 400) {
          detectedPitches.push(freq);
        }
      }
    }

    audioCtx.close();

    if (detectedPitches.length === 0) {
      return {
        estimatedHz: 165,
        pitchClassification: "Voz Média Natural (Tenor/Neutro)",
        recommendedBaseVoice: "Puck",
      };
    }

    // Median frequency
    detectedPitches.sort((a, b) => a - b);
    const medianHz = Math.round(detectedPitches[Math.floor(detectedPitches.length / 2)]);

    let classification = "";
    let recommended: "Puck" | "Zephyr" | "Kore" | "Fenrir" | "Charon" = "Puck";

    if (medianHz < 120) {
      classification = "Grave / Barítono (Muito Baixo)";
      recommended = "Fenrir"; // use Fenrir instead of Charon to avoid artificial boominess
    } else if (medianHz < 165) {
      classification = "Médio-Grave Natural (Barítono-Tenor)";
      recommended = "Puck";
    } else if (medianHz < 220) {
      classification = "Médio-Agudo / Tenor / Jovem";
      recommended = "Puck";
    } else if (medianHz < 270) {
      classification = "Feminino Caloroso / Mezzo-soprano";
      recommended = "Kore";
    } else {
      classification = "Feminino Claro / Soprano Brilhante";
      recommended = "Zephyr";
    }

    return {
      estimatedHz: medianHz,
      pitchClassification: `${medianHz} Hz • ${classification}`,
      recommendedBaseVoice: recommended,
    };
  } catch (err) {
    console.warn("Pitch detection fallback:", err);
    return {
      estimatedHz: 165,
      pitchClassification: "Voz Natural (Tenor Médio)",
      recommendedBaseVoice: "Puck",
    };
  }
}

/**
 * Calibrates audio using Web Audio filters to eliminate boomy low frequencies (anti-grossa)
 * and adjusts pitch/formants into a rendered WAV file.
 */
export async function processAudioTuning(
  base64Audio: string,
  options: {
    pitchSemitones: number; // e.g. +2, +3, 0
    antiGrossaCut: boolean; // cuts frequencies < 180Hz to remove artificial boominess
    clarityBoost: boolean; // boosts vocal presence 2.5kHz - 4.5kHz
    speedModifier?: number; // 0.8 to 1.3
  }
): Promise<{ calibratedBase64: string; blobUrl: string }> {
  const binary = atob(base64Audio);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

  const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  const originalBuffer = await audioCtx.decodeAudioData(bytes.buffer.slice(0));

  // Pitch factor
  const pitchRatio = Math.pow(2, options.pitchSemitones / 12);
  const speed = (options.speedModifier || 1.0) * pitchRatio;

  // Render using OfflineAudioContext
  const targetLength = Math.max(1, Math.floor(originalBuffer.length / speed));
  const offlineCtx = new OfflineAudioContext(
    originalBuffer.numberOfChannels,
    targetLength,
    originalBuffer.sampleRate
  );

  const source = offlineCtx.createBufferSource();
  source.buffer = originalBuffer;
  source.playbackRate.value = speed;

  let lastNode: AudioNode = source;

  // 1. High-pass filter (cuts muddy artificial bass < 160Hz)
  if (options.antiGrossaCut) {
    const highPass = offlineCtx.createBiquadFilter();
    highPass.type = "highpass";
    highPass.frequency.value = 170; // cuts synthetic rumble
    highPass.Q.value = 0.7;
    lastNode.connect(highPass);
    lastNode = highPass;

    // Subtle low-shelf reduction
    const lowShelf = offlineCtx.createBiquadFilter();
    lowShelf.type = "lowshelf";
    lowShelf.frequency.value = 250;
    lowShelf.gain.value = -3.5; // -3.5 dB to stop thick muddiness
    lastNode.connect(lowShelf);
    lastNode = lowShelf;
  }

  // 2. Clarity & Presence Peaking Filter (articulates consonants & vocal cords)
  if (options.clarityBoost) {
    const presence = offlineCtx.createBiquadFilter();
    presence.type = "peaking";
    presence.frequency.value = 3200;
    presence.Q.value = 1.2;
    presence.gain.value = 3.5; // +3.5 dB brightness
    lastNode.connect(presence);
    lastNode = presence;
  }

  lastNode.connect(offlineCtx.destination);
  source.start(0);

  const renderedBuffer = await offlineCtx.startRendering();
  audioCtx.close();

  const wavBlob = audioBufferToWavBlob(renderedBuffer);
  const { base64, dataUrl } = await blobToBase64(wavBlob);

  return { calibratedBase64: base64, blobUrl: dataUrl };
}

/**
 * Creates a simple synthetic WAV chime / vocal tone sample for presets
 */
export function createSyntheticAudioSample(
  voiceType: "male" | "female" | "deep",
  durationSec = 2.5
): { base64: string; blobUrl: string; mimeType: string } {
  const sampleRate = 24000;
  const numSamples = Math.floor(sampleRate * durationSec);
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + numSamples * 2, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, numSamples * 2, true);

  // Higher base frequency so it doesn't sound "grossa"
  const baseFreq = voiceType === "deep" ? 135 : voiceType === "male" ? 180 : 260;

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const envelope =
      Math.sin(Math.min(Math.PI, (t / durationSec) * Math.PI)) *
      (0.7 + 0.3 * Math.sin(t * 8 * Math.PI));

    const f1 = baseFreq;
    const f2 = baseFreq * 2.1;
    const f3 = baseFreq * 3.4;

    const sampleVal =
      (Math.sin(2 * Math.PI * f1 * t) * 0.6 +
        Math.sin(2 * Math.PI * f2 * t) * 0.3 +
        Math.sin(2 * Math.PI * f3 * t) * 0.15) *
      envelope;

    const int16 = Math.max(-32768, Math.min(32767, Math.floor(sampleVal * 16000)));
    view.setInt16(44 + i * 2, int16, true);
  }

  const blob = new Blob([buffer], { type: "audio/wav" });
  const blobUrl = URL.createObjectURL(blob);

  let binary = "";
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);

  return { base64, blobUrl, mimeType: "audio/wav" };
}

/**
 * Triggers browser download of base64 audio
 */
export function downloadAudioBase64(base64: string, filename = "voz-clonada.wav", mimeType = "audio/wav") {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const blob = new Blob([bytes], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
