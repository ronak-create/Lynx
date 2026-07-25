"use client";
/* The repo link — a black pill with the GitHub mark + label. Shared by the landing and app headers. */
import { GithubLogo } from "@phosphor-icons/react";

const REPO = "https://github.com/ronak-create/Lynx";

export function GithubButton({ className = "" }: { className?: string }) {
  return (
    <a
      href={REPO}
      target="_blank"
      rel="noreferrer"
      className={`press flex items-center gap-1.5 rounded-xl border border-white/15 bg-black px-3 py-2 text-[13px] font-medium text-white hover:border-white/35 ${className}`}
    >
      <GithubLogo weight="fill" className="h-4 w-4" />
      GitHub
    </a>
  );
}
