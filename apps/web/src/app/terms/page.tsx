import type { Metadata } from "next";
import { TermsContent } from "./TermsContent";

export const metadata: Metadata = {
  title: "Terms & Conditions",
  description:
    "How Lynx may be used, what happens to the API keys you provide, and the limits of the results it produces.",
};

export default function TermsPage() {
  return <TermsContent />;
}
