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
  title: 'PageScope — The page is the context.',
  description:
    'Page-local debugging tools for browser agents. Reproduce a bug, inspect its live evidence through WebMCP, and verify the fix.',
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    url: '/',
    siteName: 'PageScope',
    title: 'PageScope — The page is the context.',
    description:
      'Five native WebMCP tools. Three real browser bugs. A Next.js debugging experiment by Dhairya Thakkar.',
    images: [
      {
        url: '/images/lena-delta.jpg',
        alt: 'Lena River Delta, a NASA/USGS satellite observation in the PageScope demo.',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'PageScope — The page is the context.',
    description:
      'Five native WebMCP tools. Three real browser bugs. Built by Dhairya Thakkar.',
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
