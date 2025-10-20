"use client";

import { useEffect, useRef } from "react";

import { useUiStore } from "@/lib/store";

export function BackgroundAudio() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const isEnabled = useUiStore((state) => state.isAudioEnabled);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    const attemptPlay = async () => {
      try {
        await audio.play();
      } catch (error) {
        console.warn("Background audio autoplay was blocked; waiting for user interaction.", error);
      }
    };

    if (isEnabled) {
      attemptPlay();
    }

    const handleUserInteraction = () => {
      if (isEnabled) {
        attemptPlay();
      }
      window.removeEventListener("pointerdown", handleUserInteraction);
      window.removeEventListener("keydown", handleUserInteraction);
    };

    window.addEventListener("pointerdown", handleUserInteraction, { once: true });
    window.addEventListener("keydown", handleUserInteraction, { once: true });

    return () => {
      window.removeEventListener("pointerdown", handleUserInteraction);
      window.removeEventListener("keydown", handleUserInteraction);
    };
  }, [isEnabled]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    if (!isEnabled) {
      audio.pause();
    } else {
      const play = async () => {
        try {
          await audio.play();
        } catch (error) {
          console.warn("Background audio autoplay was blocked after toggle; waiting for interaction.", error);
        }
      };
      play();
    }
  }, [isEnabled]);

  return <audio ref={audioRef} src="/music.mp3" loop preload="auto" />;
}

export default BackgroundAudio;

