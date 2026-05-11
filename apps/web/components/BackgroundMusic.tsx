"use client";

import { useEffect, useRef } from "react";

const BACKGROUND_MUSIC_URL = "/audios/Onycs%20-%20Eden.mp3";

type BackgroundMusicProps = {
  playing: boolean;
  muted: boolean;
  onPlayingChange: (playing: boolean) => void;
};

export function BackgroundMusic({ playing, muted, onPlayingChange }: BackgroundMusicProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.muted = muted;

    if (!playing) {
      audio.pause();
      return;
    }

    audio.volume = 0.42;
    void audio.play().catch(() => onPlayingChange(false));
  }, [muted, onPlayingChange, playing]);

  useEffect(() => {
    if (!("mediaSession" in navigator)) return;

    if ("MediaMetadata" in window) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: "Eden",
        artist: "Onycs",
        album: "Entangled Body",
      });
    }

    navigator.mediaSession.playbackState = playing ? "playing" : "paused";
    navigator.mediaSession.setActionHandler("play", () => onPlayingChange(true));
    navigator.mediaSession.setActionHandler("pause", () => onPlayingChange(false));

    return () => {
      navigator.mediaSession.setActionHandler("play", null);
      navigator.mediaSession.setActionHandler("pause", null);
    };
  }, [onPlayingChange, playing]);

  return (
    <audio
      ref={audioRef}
      className="background-music"
      src={BACKGROUND_MUSIC_URL}
      loop
      preload="auto"
      onPlay={() => onPlayingChange(true)}
      onPause={() => onPlayingChange(false)}
      aria-hidden="true"
    />
  );
}
