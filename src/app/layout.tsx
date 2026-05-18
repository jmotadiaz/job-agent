import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import '@/app/style/globals.css';
import { NuqsAdapter } from 'nuqs/adapters/next/app';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: 'Job Scout — Your AI-powered job hunting assistant',
  description: 'Discover, review and apply to jobs that match your profile using AI-powered job scouting and CV generation.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} h-full`}>
      <body className="min-h-full flex flex-col antialiased">
        <NuqsAdapter>{children}</NuqsAdapter>
      </body>
    </html>
  );
}
