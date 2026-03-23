import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AI Memory Chain',
  description: 'On-chain AI memory storage with IPFS',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <header className="sticky top-0 z-50 border-b border-gray-800 bg-gray-950/80 backdrop-blur-md">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
            <h1 className="text-xl font-bold tracking-tight text-white">
              <span className="text-chain-500">AI</span> Memory Chain
            </h1>
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
