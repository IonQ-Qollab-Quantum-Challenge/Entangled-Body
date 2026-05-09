"use client";

import { useEffect, useRef } from "react";

const BACKGROUND_MUSIC_URL = "/audios/Onycs%20-%20Eden.mp3";

type BackgroundMusicProps = {
  playing: boolean;
};

export function BackgroundMusic({ playing }: BackgroundMusicProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (!playing) {
      audio.pause();
      return;
    }

    audio.volume = 0.42;
    void audio.play();
  }, [playing]);

  return (
    <audio
      ref={audioRef}
      className="background-music"
      src={BACKGROUND_MUSIC_URL}
      loop
      preload="auto"
      aria-hidden="true"
    />
  );
}
