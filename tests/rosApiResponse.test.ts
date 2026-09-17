import { describe, expect, it } from 'vitest'
import { networkErrorMessage, readRosApiResponse } from '@/lib/ros/apiResponse'

const response = (body: string, status = 200, ok = status < 400) =>
  ({ ok, status, text: async () => body }) as unknown as Response

describe('leitura de resposta da API ROS', () => {
  it('devolve os dados quando o servidor responde JSON', async () => {
    const result = await readRosApiResponse<{ success: boolean }>(response('{"success":true}'))
    expect(result).toEqual({ ok: true, status: 200, data: { success: true } })
  })

  it('explica a verificação de segurança em vez de estourar no parser', async () => {
    const html = '<!DOCTYPE html><html><head><title>Vercel Security Checkpoint</title></head><body></body></html>'
    const result = await readRosApiResponse(response(html, 403, false))

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toMatch(/verificação de segurança/i)
    expect(result.error).not.toMatch(/Unexpected token/)
  })

  it('não deixa passar HTML genérico como erro cru', async () => {
    const result = await readRosApiResponse(response('<!doctype html><html>erro do gateway</html>', 502, false))

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toMatch(/formato inesperado/i)
  })

  it('usa a mensagem do servidor quando ela vem em JSON', async () => {
    const result = await readRosApiResponse(response('{"error":"Supabase não configurado."}', 503, false))

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toBe('Supabase não configurado.')
  })

  it('descreve erro sem mensagem pelo código HTTP', async () => {
    const result = await readRosApiResponse(response('{}', 500, false))

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain('500')
  })

  it('traduz falha de rede', () => {
    expect(networkErrorMessage(new TypeError('Failed to fetch'), 'x')).toMatch(/conexão/i)
    expect(networkErrorMessage(new Error('estourou o tempo'), 'x')).toBe('estourou o tempo')
    expect(networkErrorMessage(null, 'padrao')).toBe('padrao')
  })
})
