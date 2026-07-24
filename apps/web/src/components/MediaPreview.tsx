"use client";
/* A small, safe media embed used across the dashboard and documentary. Renders an image,
   a video, or a sandboxed iframe (YouTube/Vimeo get turned into embeds). Anything that fails
   to load is hidden rather than left as a broken box. External media is only shown for URLs
   that come from our own resolved data — never from user/observed text. */
import { useState } from "react";

type MediaKind = "image" | "video" | "iframe";

function kindFromUrl(url: string): MediaKind {
  if (/\.(mp4|webm|ogg|mov)(\?|#|$)/i.test(url)) return "video";
  if (/\.(png|jpe?g|gif|webp|svg|avif)(\?|#|$)/i.test(url)) return "image";
  return "iframe";
}

function embedUrl(url: string): string {
  const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]{6,})/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`;
  const vimeo = url.match(/vimeo\.com\/(\d+)/);
  if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}`;
  return url;
}

export function MediaPreview({
  src,
  alt = "",
  kind,
  className = "",
  ratio = "16 / 9",
}: {
  src: string;
  alt?: string;
  kind?: MediaKind;
  className?: string;
  ratio?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return null;
  const k = kind ?? kindFromUrl(src);

  if (k === "image") {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- arbitrary external hosts; next/image would need per-domain config
      <img
        src={src}
        alt={alt}
        loading="lazy"
        onError={() => setFailed(true)}
        className={`rounded-lg border border-[var(--border)] bg-[var(--panel-2)] ${className}`}
      />
    );
  }

  if (k === "video") {
    return (
      <video
        src={src}
        controls
        preload="metadata"
        onError={() => setFailed(true)}
        className={`w-full rounded-lg border border-[var(--border)] bg-black ${className}`}
      />
    );
  }

  return (
    <div
      className={`w-full overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--panel-2)] ${className}`}
      style={{ aspectRatio: ratio }}
    >
      <iframe
        src={embedUrl(src)}
        title={alt || "preview"}
        loading="lazy"
        sandbox="allow-scripts allow-same-origin allow-presentation"
        referrerPolicy="no-referrer"
        allow="encrypted-media; picture-in-picture; fullscreen"
        className="h-full w-full"
      />
    </div>
  );
}
