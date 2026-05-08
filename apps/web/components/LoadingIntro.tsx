"use client";

import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";

const INTRO_LINES = [
  "Everything is in a quantum state.",
  "Before form, there is only possibility.",
  "Nothing is fixed until it is observed.",
  "A signal moves through the invisible field.",
  "The body is not loading; it is becoming.",
  "Entangled Body\nmeasure our project.",
];
const INTRO_FADE_OUT_MS = 1800;

type LoadingIntroProps = {
  modelReady: boolean;
  onComplete: () => void;
  onExitStart?: () => void;
  visible: boolean;
};

export function LoadingIntro({ modelReady, onComplete, onExitStart, visible }: LoadingIntroProps) {
  const audioContextRef = useRef<AudioContext | null>(null);
  const [exiting, setExiting] = useState(false);
  const [lineIndex, setLineIndex] = useState(0);
  const [typedLength, setTypedLength] = useState(0);
  const currentLine = INTRO_LINES[lineIndex];
  const stars = useMemo(
    () =>
      Array.from({ length: 90 }, (_, index) => ({
        id: index,
        left: `${(index * 37) % 100}%`,
        top: `${(index * 61) % 100}%`,
        delay: `${((index * 13) % 30) / 10}s`,
        duration: `${2.2 + ((index * 7) % 18) / 10}s`,
        size: `${1 + (index % 3)}px`,
        opacity: 0.34 + ((index * 11) % 50) / 100,
      })),
    [],
  );

  useEffect(() => {
    if (!visible) return;
    setExiting(false);
    setLineIndex(0);
    setTypedLength(0);
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    if (typedLength >= currentLine.length) return;

    const timeout = window.setTimeout(() => {
      setTypedLength((length) => Math.min(currentLine.length, length + 1));
      playTypingTick(audioContextRef);
    }, 34);

    return () => window.clearTimeout(timeout);
  }, [currentLine, typedLength, visible]);

  useEffect(() => {
    if (!visible) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Enter") return;
      event.preventDefault();
      void resumeTypingAudio(audioContextRef);

      if (typedLength < currentLine.length) {
        setTypedLength(currentLine.length);
        return;
      }

      if (lineIndex >= INTRO_LINES.length - 1) {
        if (modelReady && !exiting) {
          onExitStart?.();
          setExiting(true);
          window.setTimeout(onComplete, INTRO_FADE_OUT_MS);
        }
        return;
      }

      setLineIndex((index) => index + 1);
      setTypedLength(0);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentLine.length, exiting, lineIndex, modelReady, onComplete, onExitStart, typedLength, visible]);

  if (!visible) return null;
  const isTitleLine = lineIndex === INTRO_LINES.length - 1;
  const visibleTitle = currentLine.slice(0, typedLength);
  const hasSubtitleStarted = visibleTitle.includes("\n");
  const [title, subtitle = ""] = visibleTitle.split("\n");

  return (
    <section className={exiting ? "loading-intro loading-intro--exiting" : "loading-intro"} aria-live="polite" aria-label="3D model loading introduction">
      <div className="loading-intro__stars" aria-hidden="true">
        {stars.map((star) => (
          <i
            key={star.id}
            style={{
              left: star.left,
              top: star.top,
              width: star.size,
              height: star.size,
              opacity: star.opacity,
              animationDelay: star.delay,
              animationDuration: star.duration,
            }}
          />
        ))}
      </div>
      <div className={isTitleLine ? "loading-intro__copy loading-intro__copy--title" : "loading-intro__copy"}>
        {isTitleLine ? (
          <p>
            <span className="loading-intro__title-line">
              {title}
              {!hasSubtitleStarted ? <span aria-hidden="true" className="loading-intro__cursor" /> : null}
            </span>
            {hasSubtitleStarted ? (
              <span className="loading-intro__subtitle-line">
                {subtitle}
                <span aria-hidden="true" className="loading-intro__cursor" />
              </span>
            ) : null}
          </p>
        ) : (
          <p>
            {currentLine.slice(0, typedLength)}
            <span aria-hidden="true" className="loading-intro__cursor" />
          </p>
        )}
        <span className="loading-intro__hint">{lineIndex >= INTRO_LINES.length - 1 && !modelReady ? "Rendering" : "Enter"}</span>
      </div>
    </section>
  );
}

type WindowWithWebkitAudio = Window &
  typeof globalThis & {
    webkitAudioContext?: typeof AudioContext;
  };

function getTypingAudioContext(audioContextRef: MutableRefObject<AudioContext | null>) {
  if (audioContextRef.current) return audioContextRef.current;

  const audioWindow = window as WindowWithWebkitAudio;
  const AudioContextConstructor = audioWindow.AudioContext || audioWindow.webkitAudioContext;
  if (!AudioContextConstructor) return null;

  const audioContext = new AudioContextConstructor();
  audioContextRef.current = audioContext;
  return audioContext;
}

async function resumeTypingAudio(audioContextRef: MutableRefObject<AudioContext | null>) {
  const audioContext = getTypingAudioContext(audioContextRef);
  if (!audioContext || audioContext.state !== "suspended") return;
  await audioContext.resume();
}

function playTypingTick(audioContextRef: MutableRefObject<AudioContext | null>) {
  const audioContext = getTypingAudioContext(audioContextRef);
  if (!audioContext || audioContext.state !== "running") return;

  const now = audioContext.currentTime;
  const duration = 0.045;
  const sampleCount = Math.floor(audioContext.sampleRate * duration);
  const buffer = audioContext.createBuffer(1, sampleCount, audioContext.sampleRate);
  const samples = buffer.getChannelData(0);

  for (let index = 0; index < sampleCount; index += 1) {
    const progress = index / sampleCount;
    const envelope = Math.pow(1 - progress, 5);
    samples[index] = (Math.random() * 2 - 1) * envelope;
  }

  const source = audioContext.createBufferSource();
  const filter = audioContext.createBiquadFilter();
  const gain = audioContext.createGain();

  source.buffer = buffer;
  filter.type = "bandpass";
  filter.frequency.setValueAtTime(1650 + Math.random() * 260, now);
  filter.Q.setValueAtTime(5.5, now);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.09, now + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  source.connect(filter);
  filter.connect(gain);
  gain.connect(audioContext.destination);
  source.start(now);
  source.stop(now + duration);
}
