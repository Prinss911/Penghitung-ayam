import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

// v2.2 — theme light/dark + no-flash script

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Ayam Counter Pro — Sistem Deteksi & Penghitungan Ayam Real-Time",
  description:
    "Dashboard penghitungan ayam real-time berbasis YOLOv8, Flask, dan Next.js. Deteksi shackle, penghitungan otomatis, dan ekspor Excel.",
  keywords: [
    "ayam counter",
    "chicken counter",
    "YOLOv8",
    "computer vision",
    "Flask",
    "Next.js",
    "real-time detection",
  ],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id" suppressHydrationWarning>
      <head>
        {/* No-flash theme: terapkan tema tersimpan sebelum hydrate.
            FIX: default harus `dark` — sebelumnya html tanpa class saat
            pertama kali / tema gelap, sehingga token shadcn (:root) jatuh ke
            nilai LIGHT → judul kartu near-black di atas kartu gelap, body
            putih, tooltip/popover putih. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(localStorage.getItem('ayam-theme')==='light'){document.documentElement.classList.add('light')}else{document.documentElement.classList.add('dark')}}catch(e){document.documentElement.classList.add('dark')}`,
          }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
