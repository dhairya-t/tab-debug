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
    'Expose page state, requests, and errors to browser agents through WebMCP. Next.js integration and working examples.',
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    url: '/',
    siteName: 'tab-debug',
    title: 'tab-debug — Browser debugging tools',
    description:
      'Page-specific debugging tools for browser agents. Built by Dhairya Thakkar.',
    images: [
      {
        url: '/images/lena-delta.jpg',
        alt: 'Lena River Delta, a NASA/USGS satellite observation in the tab-debug demo.',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'tab-debug — Browser debugging tools',
    description:
      'Page-specific debugging tools for browser agents. Built by Dhairya Thakkar.',
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
