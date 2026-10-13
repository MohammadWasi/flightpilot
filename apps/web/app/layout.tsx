import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'FlightPilot — A clearer way to fly',
  description:
    'Thoughtful flight comparisons and secure, explicit booking approval. Your travel companion for Codex and Claude.',
  robots: { index: false, follow: false },
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
