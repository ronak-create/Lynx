"use client";
/* "On this page" rail. Reads the rendered <h2 id> elements instead of taking a prop, so a page
   can never fall out of sync with its own contents, and highlights the heading currently in view. */
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

type Heading = { id: string; text: string };

export function OnThisPage() {
  const pathname = usePathname();
  const [headings, setHeadings] = useState<Heading[]>([]);
  const [active, setActive] = useState<string>("");

  useEffect(() => {
    let observer: IntersectionObserver | undefined;
    // read after paint, so the headings of the page we just navigated to are actually mounted
    const frame = requestAnimationFrame(() => {
      const nodes = Array.from(document.querySelectorAll<HTMLHeadingElement>("article h2[id]"));
      setHeadings(nodes.map((n) => ({ id: n.id, text: n.textContent ?? "" })));
      setActive(nodes[0]?.id ?? "");
      if (!nodes.length) return;

      observer = new IntersectionObserver(
        (entries) => {
          const visible = entries
            .filter((e) => e.isIntersecting)
            .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
          if (visible) setActive(visible.target.id);
        },
        // trigger band near the top of the viewport so the rail tracks reading position
        { rootMargin: "-80px 0px -70% 0px", threshold: 0 },
      );
      nodes.forEach((n) => observer!.observe(n));
    });

    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
    };
  }, [pathname]);

  if (headings.length < 2) return null;

  return (
    <nav aria-label="On this page" className="sticky top-24 hidden xl:block">
      <h2 className="mb-2.5 text-[11px] font-semibold tracking-[0.14em] text-[var(--faint)] uppercase">
        On this page
      </h2>
      <ul className="flex flex-col border-l border-[var(--border)]">
        {headings.map((h) => (
          <li key={h.id}>
            <a
              href={`#${h.id}`}
              className={`-ml-px block border-l py-1.5 pl-3.5 text-[12.5px] leading-snug ${
                active === h.id
                  ? "border-[var(--accent)] text-[var(--text-strong)]"
                  : "border-transparent text-[var(--faint)] hover:text-[var(--text)]"
              }`}
            >
              {h.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
