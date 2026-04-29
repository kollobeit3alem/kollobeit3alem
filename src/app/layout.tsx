import type { Metadata } from 'next';
import './globals.css';
import { Providers } from '@/components/Providers';

export const metadata: Metadata = {
  title: 'منصة كله بيتعلم',
  description: 'منصتك الشبابية المتكاملة لإتقان المهارات العملية',
  manifest: '/manifest.json',
  themeColor: '#015669',
  icons: {
    icon: '/logo.png',
    apple: '/icon-192.png',
  },
  openGraph: {
    title: 'منصة كله بيتعلم',
    description: 'منصتك الشبابية المتكاملة لإتقان المهارات العملية',
    type: 'website',
    locale: 'ar_EG',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ar" dir="rtl">
      <head>
        {/* Google Identity Services */}
        <script src="https://accounts.google.com/gsi/client" async defer />
        {/* Font Awesome */}
        <link
          rel="stylesheet"
          href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css"
        />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
