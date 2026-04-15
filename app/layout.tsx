import type { Metadata } from 'next'
import './globals.css'
import { Toaster } from '@/components/ui/sonner'
import { ClientLayout } from '@/components/ClientLayout'

export const metadata: Metadata = {
  title: 'Recrutaê Mail — Outreach',
  description: 'Plataforma de email outreach para recrutadores',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className="dark">
      <body className="antialiased">
        <ClientLayout>{children}</ClientLayout>
        <Toaster richColors position="bottom-right" />
      </body>
    </html>
  )
}
