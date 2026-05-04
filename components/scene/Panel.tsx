"use client";

import Image from "next/image";

type Tone = "dark" | "light";

export function Panel({
  image,
  alt = "",
  tone = "dark",
  priority = false,
  children,
  id,
}: {
  image: string;
  alt?: string;
  tone?: Tone;
  priority?: boolean;
  children: React.ReactNode;
  id?: string;
}) {
  return (
    <section id={id} className="relative h-screen">
      <div className="sticky top-0 h-screen overflow-hidden bg-black">
        <Image
          src={image}
          alt={alt}
          fill
          priority={priority}
          quality={88}
          sizes="100vw"
          className="object-cover"
        />
        <div
          aria-hidden
          className={
            tone === "light"
              ? "panel-vignette panel-vignette-light"
              : "panel-vignette"
          }
        />
        <div className="relative z-10 flex h-full items-center justify-center px-6 sm:px-10">
          {children}
        </div>
      </div>
    </section>
  );
}
