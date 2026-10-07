import type { Metadata } from "next";
import { Fraunces, Work_Sans } from "next/font/google";
import { StringsProvider } from "@/ui/strings/provider";
import { getRequestLocale, getStrings } from "@/ui/strings/request";
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

// language-switch D9: the description follows the request's language, which a static `metadata`
// export could not. The title stays the product name.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getStrings();
  return {
    // proposal.md Assumption 5: the product name, not copy — stays as-is.
    title: "Flatmate.io",
    description: t.document.description,
  };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const locale = await getRequestLocale();
  return (
    <html
      lang={locale}
      className={`${fraunces.variable} ${workSans.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <StringsProvider locale={locale}>{children}</StringsProvider>
      </body>
    </html>
  );
}
