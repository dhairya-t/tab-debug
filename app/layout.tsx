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
  metadataBase: new URL('https://tab-debug-dhairya.vercel.app'),
  title: 'tab-debug — Browser debugging tools',
  description:
    'Let your coding agent read requests, errors, and selected state from your running app through WebMCP. Next.js integration and working examples.',
  alternates: { canonical: '/' },
  icons: { icon: { url: '/favicon.svg', type: 'image/svg+xml', sizes: 'any' } },
  openGraph: {
    type: 'website',
    url: '/',
    siteName: 'tab-debug',
    title: 'tab-debug — Browser debugging tools',
    description:
      'Page-specific debugging tools for browser agents. Built by Dhairya Thakkar.',
    images: [
      {
        url: '/images/tab-debug-preview.png',
        alt: 'tab-debug showing a reproduced stale file response from Transform.',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'tab-debug — Browser debugging tools',
    description:
      'Page-specific debugging tools for browser agents. Built by Dhairya Thakkar.',
    images: ['/images/tab-debug-preview.png'],
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
