import type { Metadata } from "next";
import { Fraunces, Work_Sans } from "next/font/google";
import { de } from "@/ui/strings";
import "./globals.css";

// docs/09-Design-System.md: Fraunces (serif display, headings) + Work Sans (humanist sans, body).
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
});

const workSans = Work_Sans({
  variable: "--font-work-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  // proposal.md Assumption 5: the product name, not copy — stays as-is.
  title: "Flatmate.io",
  description: de.document.description,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="de"
      className={`${fraunces.variable} ${workSans.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">{children}</body>
    </html>
  );
}
