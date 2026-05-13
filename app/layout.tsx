import type { Metadata } from 'next'
import './globals.css'
import { Toaster } from '@/components/ui/sonner'
import { ClientLayout } from '@/components/ClientLayout'
import { ThemeProvider } from '@/lib/theme'

export const metadata: Metadata = {
  title: 'Recrutaê Mail — Outreach',
  description: 'Plataforma de email outreach para recrutadores',
}

// Applied before first paint to prevent flash of wrong theme
const themeScript = `(function(){try{var t=localStorage.getItem('recrutae-theme');var h=document.documentElement;if(t==='light'){h.classList.remove('dark');h.classList.add('light');}else{h.classList.add('dark');h.classList.remove('light');}}catch(e){}})()`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="antialiased">
        <ThemeProvider>
          <ClientLayout>{children}</ClientLayout>
          <Toaster richColors position="bottom-right" />
        </ThemeProvider>
      </body>
    </html>
  )
}
