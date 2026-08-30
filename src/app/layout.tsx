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
    icon: "/logo.svg",
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
            putih, tooltip/popover putih.
            Ronde 9: class bersifat EKSKLUSIF (dark ATAU light) — bersihkan
            class lawan agar tak pernah "dark light" sekaligus.
            Ronde 10: init juga atribut lang dari localStorage ("ayam-lang")
            agar pengguna EN tidak mendapat lang="id" sebelum hydrate. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var l=localStorage.getItem('ayam-theme')==='light';var c=document.documentElement.classList;if(l){c.add('light');c.remove('dark')}else{c.add('dark');c.remove('light')}var g=localStorage.getItem('ayam-lang');document.documentElement.lang=g==='en'?'en':'id'}catch(e){document.documentElement.classList.add('dark');document.documentElement.lang='id'}`,
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
