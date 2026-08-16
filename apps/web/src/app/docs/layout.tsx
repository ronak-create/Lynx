import type { Metadata } from "next";
import { DocsPager } from "@/components/docs/DocsPager";
import { DocsSidebar } from "@/components/docs/DocsSidebar";
import { OnThisPage } from "@/components/docs/OnThisPage";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";

export const metadata: Metadata = {
  title: { default: "Docs · Lynx", template: "%s · Lynx docs" },
  description:
    "How Lynx works and how to run it: quickstart, architecture, agents, data sources, models, HTTP API and self-hosting.",
};

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      <div className="mx-auto w-full max-w-5xl px-6 pt-10 pb-4">
        <div className="flex gap-10">
          <aside className="hidden w-[190px] shrink-0 lg:block">
            <div className="sticky top-24">
              <DocsSidebar />
            </div>
          </aside>

          <div className="min-w-0 flex-1">
            <div className="lg:hidden">
              <DocsSidebar />
            </div>
            <article className="min-w-0">{children}</article>
            <DocsPager />
          </div>

          <aside className="hidden w-[170px] shrink-0 xl:block">
            <OnThisPage />
          </aside>
        </div>
      </div>
      <SiteFooter />
    </>
  );
}
