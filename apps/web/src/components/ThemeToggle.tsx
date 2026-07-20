"use client";
import { Monitor, Sun, Moon, type Icon } from "@phosphor-icons/react";
import { ThemeMode, useTheme } from "@/stores/theme";

const OPTIONS: { mode: ThemeMode; icon: Icon; label: string }[] = [
  { mode: "system", icon: Monitor, label: "System theme" },
  { mode: "light", icon: Sun, label: "Light theme" },
  { mode: "dark", icon: Moon, label: "Dark theme" },
];

export function ThemeToggle() {
  const { mode, setMode } = useTheme();
  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className="flex items-center gap-0.5 rounded-full border border-[var(--border)] bg-[var(--panel)] p-0.5"
    >
      {OPTIONS.map(({ mode: m, icon: Icon, label }) => {
        const on = mode === m;
        return (
          <button
            key={m}
            role="radio"
            aria-checked={on}
            aria-label={label}
            title={label}
            onClick={() => setMode(m)}
            className={`press flex h-7 w-7 items-center justify-center rounded-full ${
              on
                ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                : "text-[var(--faint)] hover:text-[var(--text)]"
            }`}
          >
            <Icon weight={on ? "fill" : "regular"} className="h-[15px] w-[15px]" />
          </button>
        );
      })}
    </div>
  );
}
