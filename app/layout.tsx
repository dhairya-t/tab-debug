import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  metadataBase: new URL('https://pagescope-omega.vercel.app'),
  title: 'PageScope — Catch the bug. Keep the proof.',
  description:
    'Turn an intermittent browser race into a repeatable failing test. Capture selected API responses, inspect state transitions, and export a Playwright regression.',
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    url: '/',
    siteName: 'PageScope',
    title: 'PageScope — Catch the bug. Keep the proof.',
    description:
      'Capture a race. Replay every completion order. Export a test that fails before the fix and passes after it. Built by Dhairya Thakkar.',
    images: [
      {
        url: '/images/lena-delta.jpg',
        alt: 'Lena River Delta, a NASA/USGS satellite observation in the PageScope demo.',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'PageScope — Catch the bug. Keep the proof.',
    description:
      'An intermittent browser bug, turned into a portable incident and a failing regression test. Built by Dhairya Thakkar.',
    images: ['/images/lena-delta.jpg'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
