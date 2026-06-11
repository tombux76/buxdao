"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { hero, heroGifs } from "@/content/site";

export function HeroCarousel() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchStartX = useRef<number | null>(null);

  const goTo = useCallback((i: number) => {
    setIndex((i + heroGifs.length) % heroGifs.length);
  }, []);

  const next = useCallback(() => goTo(index + 1), [goTo, index]);
  const prev = useCallback(() => goTo(index - 1), [goTo, index]);

  useEffect(() => {
    if (paused) return;
    const timer = setInterval(() => {
      setIndex((i) => (i + 1) % heroGifs.length);
    }, hero.carouselIntervalMs);
    return () => clearInterval(timer);
  }, [paused]);

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const delta = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(delta) > 40) {
      if (delta < 0) next();
      else prev();
    }
    touchStartX.current = null;
  };

  return (
    <div className="mx-auto w-full max-w-[min(100%,420px)] lg:mx-0 lg:max-w-none">
      <div
        className="tile-border relative aspect-square w-full overflow-hidden rounded-2xl bg-bg-deep shadow-[0_0_60px_rgba(232,185,35,0.1)]"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {heroGifs.map((gif, i) => (
          <div
            key={gif.id}
            className={`absolute inset-0 transition-opacity duration-700 ${
              i === index ? "opacity-100" : "pointer-events-none opacity-0"
            }`}
          >
            <Image
              src={gif.src}
              alt={gif.alt}
              fill
              unoptimized
              priority={i === 0}
              loading="eager"
              fetchPriority={i === 0 ? "high" : "auto"}
              className="object-cover object-center"
              sizes="(max-width: 1024px) 90vw, 420px"
            />
          </div>
        ))}

        <button
          type="button"
          onClick={prev}
          className="absolute left-3 top-1/2 z-10 -translate-y-1/2 rounded-full border border-border bg-bg-elevated/80 p-2 text-foreground backdrop-blur-sm transition hover:border-border-strong"
          aria-label="Previous collection"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={next}
          className="absolute right-3 top-1/2 z-10 -translate-y-1/2 rounded-full border border-border bg-bg-elevated/80 p-2 text-foreground backdrop-blur-sm transition hover:border-border-strong"
          aria-label="Next collection"
        >
          <ChevronRight className="h-5 w-5" />
        </button>

        <div className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 gap-2">
          {heroGifs.map((gif, i) => (
            <button
              key={gif.id}
              type="button"
              onClick={() => goTo(i)}
              className={`h-2 rounded-full transition-all ${
                i === index ? "w-6 bg-accent-cyan" : "w-2 bg-white/30 hover:bg-white/50"
              }`}
              aria-label={`Show ${gif.alt}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
