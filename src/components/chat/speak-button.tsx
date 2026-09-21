"use client";

import { Square, Volume2 } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";

const noop = () => () => {};

/**
 * Deja el texto de Markdown listo para leerse en voz alta: sin bloques de
 * código, sin símbolos de formato y con los enlaces como texto.
 */
export function speakableText(markdown: string) {
  return markdown
    .replace(/```[\s\S]*?```/g, " (bloque de código) ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\$\$[\s\S]*?\$\$/g, " (fórmula) ")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*#{1,6}\s+/gm, "")
    .replace(/^\s*\|?[-:\s|]+\|?\s*$/gm, "")
    .replace(/[*_~>#|]/g, "")
    .replace(/([.!?:;])?\s*\n{2,}\s*/g, (_, mark: string | undefined) => (mark ? `${mark} ` : ". "))
    .replace(/\s+/g, " ")
    .trim();
}

function pickVoice(text: string) {
  const voices = window.speechSynthesis.getVoices();
  const spanish = /[áéíóúñ¿¡]|\b(el|la|que|de|los|para|con|una)\b/i.test(text);
  const wanted = spanish ? "es" : navigator.language.slice(0, 2);
  return voices.find((v) => v.lang.startsWith(wanted) && v.localService) ?? voices.find((v) => v.lang.startsWith(wanted)) ?? null;
}

/**
 * Botón para escuchar una respuesta con la síntesis de voz del navegador.
 */
export function SpeakButton({ text }: { text: string }) {
  const supported = useSyncExternalStore(noop, () => "speechSynthesis" in window, () => false);
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => () => {
    if (speaking) window.speechSynthesis.cancel();
  }, [speaking]);

  if (!supported || !text.trim()) return null;

  function toggle() {
    const synth = window.speechSynthesis;
    if (speaking) {
      synth.cancel();
      setSpeaking(false);
      return;
    }
    synth.cancel();
    const clean = speakableText(text);
    const utterance = new SpeechSynthesisUtterance(clean);
    const voice = pickVoice(clean);
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang;
    }
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    setSpeaking(true);
    synth.speak(utterance);
  }

  return (
    <button
      className="icon-btn"
      onClick={toggle}
      aria-pressed={speaking}
      aria-label={speaking ? "Detener lectura" : "Escuchar respuesta"}
      title={speaking ? "Detener" : "Escuchar"}
    >
      {speaking ? <Square /> : <Volume2 />}
    </button>
  );
}
