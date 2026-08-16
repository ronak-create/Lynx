import type { Metadata } from "next";
import { AboutContent } from "./AboutContent";

export const metadata: Metadata = {
  title: "About · Lynx",
  description:
    "Why Lynx exists, how a research run works, where every fact comes from, and what the tool deliberately does not do.",
};

export default function AboutPage() {
  return <AboutContent />;
}
