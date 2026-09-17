// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('jose', () => ({ jwtVerify: async () => ({ payload: {} }) }))

const AUTH = 'recrutae-auth=token-valido'

async function call(url: string, origin?: string) {
  const { middleware } = await import('@/middleware')
  const headers: Record<string, string> = { cookie: AUTH }
  if (origin) headers.origin = origin
  return middleware(new NextRequest(url, { method: 'POST', headers }))
}

describe('checagem de origem das rotas de API', () => {
  const originalSecret = process.env.JWT_SECRET
  process.env.JWT_SECRET = 'chave-de-teste-local-com-mais-de-32-caracteres'
  process.env.NEXT_PUBLIC_APP_URL = 'https://recrutae-mail.vercel.app'

  it('aceita a própria origem da requisição, mesmo fora da lista', async () => {
    // É por aqui que o app é aberto quando se clica no deploy da Vercel.
    const res = await call(
      'https://recrutae-mail-3mgkxmasf-joaomari-oss-projects.vercel.app/api/ros/save-campaign',
      'https://recrutae-mail-3mgkxmasf-joaomari-oss-projects.vercel.app',
    )
    expect(res.status).not.toBe(403)
  })

  it('aceita a origem configurada', async () => {
    const res = await call('https://recrutae-mail.vercel.app/api/ros/save-campaign', 'https://recrutae-mail.vercel.app')
    expect(res.status).not.toBe(403)
  })

  it('aceita porta local diferente de 3000', async () => {
    const res = await call('http://localhost:3022/api/ros/save-campaign', 'http://localhost:3022')
    expect(res.status).not.toBe(403)
  })

  it('recusa origem de outro site', async () => {
    const res = await call('https://recrutae-mail.vercel.app/api/ros/save-campaign', 'https://site-malicioso.com')
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'Origem não permitida.' })
  })

  it('recusa domínio que apenas termina igual', async () => {
    const res = await call('https://recrutae-mail.vercel.app/api/ros/save-campaign', 'https://evil-recrutae-mail.vercel.app')
    expect(res.status).toBe(403)
  })

  it('não exige origem quando o cabeçalho não vem', async () => {
    const res = await call('https://recrutae-mail.vercel.app/api/ros/save-campaign')
    expect(res.status).not.toBe(403)
  })

  if (originalSecret) process.env.JWT_SECRET = originalSecret
})
