import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import type { RosContact } from '@/lib/rosTypes'
import { RosContactTable } from '@/components/ros/RosContactTable'
import { findRosContactIssues } from '@/lib/ros/contacts'

const push = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  usePathname: () => '/ros',
}))

vi.mock('next/image', () => ({
  default: ({ priority: _priority, ...props }: React.ImgHTMLAttributes<HTMLImageElement> & { priority?: boolean }) => <img {...props} />,
}))

describe('navegação ROS', () => {
  it('mostra o modo ROS e suas etapas', async () => {
    const { Sidebar } = await import('@/components/Sidebar')

    render(<Sidebar />)

    expect(screen.getByText('ROS')).toBeInTheDocument()
    expect(screen.getByText('Contatos')).toBeInTheDocument()
    expect(screen.getByText('Mensagem')).toBeInTheDocument()
  })

  it('oferece Divulgação ROS na home e abre a área independente', async () => {
    const { default: LandingPage } = await import('@/app/page')

    render(<LandingPage />)

    fireEvent.click(screen.getByRole('button', { name: /divulgação ros/i }))

    expect(push).toHaveBeenCalledWith('/ros')
  })
})

// ── Task 10: contatos ROS ──────────────────────────────────────────────

const rosContact = (overrides: Partial<RosContact> & Pick<RosContact, 'id' | 'email'>): RosContact => ({
  firstName: '', lastName: '', fullName: '', company: '', position: '',
  status: 'pending', generatedSubject: '', generatedBody: '', editedSubject: '', editedBody: '',
  sendAttempts: 0, ...overrides,
})

describe('cadastro manual de contatos ROS', () => {
  it('adiciona um contato manual e limpa o formulário', async () => {
    const user = (await import('@testing-library/user-event')).default.setup()
    const { RosManualContactForm } = await import('@/components/ros/RosManualContactForm')
    const onAdd = vi.fn()

    render(<RosManualContactForm existingEmails={new Set()} onAdd={onAdd} />)

    await user.type(screen.getByLabelText('E-mail'), 'ana@example.com')
    await user.type(screen.getByLabelText('Nome'), 'Ana Souza')
    await user.type(screen.getByLabelText('Empresa'), 'Acme')
    await user.click(screen.getByRole('button', { name: 'Adicionar contato' }))

    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({
      email: 'ana@example.com', fullName: 'Ana Souza', firstName: 'Ana', lastName: 'Souza', company: 'Acme',
    }))
    expect(screen.getByLabelText('E-mail')).toHaveValue('')
    expect(screen.getByLabelText('Nome')).toHaveValue('')
  })

  it('recusa e-mail duplicado com erro acessível e não adiciona', async () => {
    const user = (await import('@testing-library/user-event')).default.setup()
    const { RosManualContactForm } = await import('@/components/ros/RosManualContactForm')
    const onAdd = vi.fn()

    render(<RosManualContactForm existingEmails={new Set(['ANA@example.com'])} onAdd={onAdd} />)

    await user.type(screen.getByLabelText('E-mail'), 'ana@example.com')
    await user.click(screen.getByRole('button', { name: 'Adicionar contato' }))

    const field = screen.getByLabelText('E-mail')
    const describedBy = field.getAttribute('aria-describedby')
    expect(describedBy).toBeTruthy()
    expect(document.getElementById(describedBy!)).toHaveTextContent('E-mail duplicado')
    expect(field).toHaveAttribute('aria-invalid', 'true')
    expect(onAdd).not.toHaveBeenCalled()
  })
})

function StatefulTable({ initial }: { initial: RosContact[] }) {
  const [contacts, setContacts] = React.useState(initial)
  const issues = findRosContactIssues(contacts)
  return (
    <>
      <RosContactTable
        contacts={contacts}
        issues={issues}
        onUpdate={(id, updates) => setContacts((c) => c.map((x) => (x.id === id ? { ...x, ...updates } : x)))}
        onRemove={(id) => setContacts((c) => c.filter((x) => x.id !== id))}
      />
      <output data-testid="estado">{JSON.stringify(contacts.map((c) => `${c.fullName}|${c.email}`))}</output>
      <output data-testid="erros">{String(Object.keys(issues).length)}</output>
    </>
  )
}

describe('tabela de conferência ROS', () => {
  it('permite digitar nome composto sem perder o espaço', async () => {
    const user = (await import('@testing-library/user-event')).default.setup()

    render(<StatefulTable initial={[rosContact({ id: '1', email: 'ana@example.com', fullName: 'Ana' })]} />)

    const name = screen.getByLabelText('Nome do contato 1')
    await user.clear(name)
    await user.type(name, 'Ana Souza')

    expect(name).toHaveValue('Ana Souza')
    expect(screen.getByTestId('estado')).toHaveTextContent('Ana Souza|ana@example.com')
  })

  it('sinaliza duplicado sem deixar o estado divergir do que está na tela', async () => {
    const user = (await import('@testing-library/user-event')).default.setup()

    render(<StatefulTable initial={[
      rosContact({ id: '1', email: 'ana@example.com', fullName: 'Ana' }),
      rosContact({ id: '2', email: 'bruno@example.com', fullName: 'Bruno' }),
    ]} />)

    const secondEmail = screen.getByLabelText('E-mail do contato 2')
    await user.clear(secondEmail)
    await user.type(secondEmail, 'ana@example.com')

    expect(screen.getByText('E-mail duplicado')).toBeInTheDocument()
    expect(secondEmail).toHaveValue('ana@example.com')
    // O que a tela mostra é exatamente o que está no estado — sem endereço intermediário.
    expect(screen.getByTestId('estado')).toHaveTextContent('Bruno|ana@example.com')
    expect(screen.getByTestId('erros')).toHaveTextContent('1')
  })

  it('limpa o erro quando a linha culpada é removida', async () => {
    const user = (await import('@testing-library/user-event')).default.setup()

    render(<StatefulTable initial={[
      rosContact({ id: '1', email: 'ana@example.com', fullName: 'Ana' }),
      rosContact({ id: '2', email: 'ana@example.com', fullName: 'Ana de novo' }),
    ]} />)

    expect(screen.getByTestId('erros')).toHaveTextContent('1')

    await user.click(screen.getByRole('button', { name: 'Remover contato 2' }))

    expect(screen.getByTestId('erros')).toHaveTextContent('0')
  })

  it('remove a linha escolhida', async () => {
    const user = (await import('@testing-library/user-event')).default.setup()
    const onRemove = vi.fn()

    render(
      <RosContactTable
        contacts={[rosContact({ id: '1', email: 'ana@example.com', fullName: 'Ana' })]}
        issues={{}}
        onUpdate={vi.fn()}
        onRemove={onRemove}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Remover contato 1' }))

    expect(onRemove).toHaveBeenCalledWith('1')
  })
})

describe('página de contatos ROS', () => {
  it('só libera a continuação com contato válido e entrega a lista para a composição', async () => {
    const user = (await import('@testing-library/user-event')).default.setup()
    sessionStorage.clear()
    const { default: RosContactsPage } = await import('@/app/ros/page')

    render(<RosContactsPage />)

    const continueButton = screen.getByRole('button', { name: /continuar/i })
    expect(continueButton).toBeDisabled()

    await user.type(screen.getByLabelText('E-mail'), 'ana@example.com')
    await user.type(screen.getByLabelText('Nome'), 'Ana Souza')
    await user.click(screen.getByRole('button', { name: 'Adicionar contato' }))

    expect(continueButton).toBeEnabled()

    await user.click(continueButton)

    const stored = JSON.parse(sessionStorage.getItem('ros-pending-contacts') ?? '[]')
    expect(stored).toHaveLength(1)
    expect(stored[0]).toMatchObject({ email: 'ana@example.com', fullName: 'Ana Souza', status: 'pending' })
    expect(push).toHaveBeenCalledWith('/ros/compose')
  })
})

describe('importação de planilha ROS', () => {
  it('soma os contatos válidos e explica cada rejeição', async () => {
    const user = (await import('@testing-library/user-event')).default.setup()
    sessionStorage.clear()
    const { default: RosContactsPage } = await import('@/app/ros/page')

    const csv = [
      'nome,email,empresa,cargo',
      'Ana Souza,ana@example.com,Acme,Head de RH',
      'Bruno Lima,bruno@example.com,Beta,CTO',
      'Ana de novo,ANA@example.com,Acme,Head de RH',
      'Sem contato,nao-e-email,Gama,Diretor',
    ].join('\n')
    const file = new File([csv], 'contatos.csv', { type: 'text/csv' })

    const { container } = render(<RosContactsPage />)

    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    await user.upload(input, file)

    expect(await screen.findByLabelText('E-mail do contato 1')).toHaveValue('ana@example.com')
    expect(screen.getByLabelText('E-mail do contato 2')).toHaveValue('bruno@example.com')
    expect(screen.queryByLabelText('E-mail do contato 3')).toBeNull()
    expect(screen.getByText('2 contatos na campanha')).toBeInTheDocument()
    expect(screen.getByText('E-mail repetido: 1')).toBeInTheDocument()
    expect(screen.getByText('E-mail inválido: 1')).toBeInTheDocument()
  })
})

describe('portão de saída da tela de contatos', () => {
  it('restaura a lista guardada e bloqueia Continuar enquanto houver e-mail inválido', async () => {
    const user = (await import('@testing-library/user-event')).default.setup()
    const stored = [
      { ...rosContact({ id: 'a', email: 'ana@example.com', fullName: 'Ana Souza', firstName: 'Ana', lastName: 'Souza' }) },
      { ...rosContact({ id: 'b', email: 'bruno@example.com', fullName: 'Bruno Lima', firstName: 'Bruno', lastName: 'Lima' }) },
    ]
    sessionStorage.setItem('ros-pending-contacts', JSON.stringify(stored))
    const { default: RosContactsPage } = await import('@/app/ros/page')

    render(<RosContactsPage />)

    expect(await screen.findByLabelText('E-mail do contato 1')).toHaveValue('ana@example.com')

    const second = screen.getByLabelText('E-mail do contato 2')
    await user.clear(second)
    await user.type(second, 'sem-arroba')

    const continueButton = screen.getByRole('button', { name: /continuar/i })
    expect(continueButton).toBeDisabled()
    expect(screen.getByText(/corrija 1 contato antes de continuar/i)).toBeInTheDocument()

    await user.clear(second)
    await user.type(second, 'BRUNO@Example.com ')

    expect(continueButton).toBeEnabled()
    await user.click(continueButton)

    // A normalização acontece na saída, não a cada tecla digitada.
    const saved = JSON.parse(sessionStorage.getItem('ros-pending-contacts') ?? '[]')
    expect(saved[1]).toMatchObject({ email: 'bruno@example.com', fullName: 'Bruno Lima', firstName: 'Bruno' })
  })

  it('descarta linhas incompletas guardadas na sessão', async () => {
    sessionStorage.setItem('ros-pending-contacts', JSON.stringify([
      { id: 'quebrado', email: 'x@example.com' },
      rosContact({ id: 'ok', email: 'ok@example.com', fullName: 'Ok' }),
    ]))
    const { default: RosContactsPage } = await import('@/app/ros/page')

    render(<RosContactsPage />)

    expect(await screen.findByLabelText('E-mail do contato 1')).toHaveValue('ok@example.com')
    expect(screen.queryByLabelText('E-mail do contato 2')).toBeNull()
  })
})

// ── Task 11: composição da campanha ────────────────────────────────────

// Os mocks abaixo descrevem `Response` só com `json()`. O código de produção lê
// `text()` para conseguir explicar respostas que não são JSON — a borda da
// Vercel devolve HTML. Este envelope faz o mock se comportar como a resposta
// real, para o teste exercitar o mesmo caminho.
function asResponse(partial: Record<string, unknown>): Response {
  const response = partial as unknown as Response & { json: () => Promise<unknown> }
  if (typeof (response as { text?: unknown }).text !== 'function') {
    ;(response as unknown as { text: () => Promise<string> }).text = async () =>
      JSON.stringify(await response.json())
  }
  return response
}

afterEach(() => { vi.unstubAllGlobals() })

const pendingContact = rosContact({
  id: 'c1', email: 'ana@example.com', fullName: 'Ana Souza', firstName: 'Ana', lastName: 'Souza',
  company: 'Acme', position: 'Head de RH',
})

function mockRosApi(saveResponse: unknown = { success: true }, saveStatus = 200) {
  const calls: Array<{ url: string; body?: unknown }> = []
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo, init?: RequestInit) => {
    const url = String(input)
    calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined })
    if (url.includes('/api/ros/preflight')) {
      return asResponse({
        ok: true, status: 200,
        json: async () => ({
          canSend: true, checks: [], fromEmail: 'contato@recrutae.com.br',
          senderOptions: ['contato@recrutae.com.br', 'comercial@recrutae.com.br'],
        }),
      } as Record<string, unknown>)
    }
    return asResponse({ ok: saveStatus < 400, status: saveStatus, json: async () => saveResponse } as Record<string, unknown>)
  }))
  return calls
}

async function renderCompose() {
  sessionStorage.setItem('ros-pending-contacts', JSON.stringify([pendingContact]))
  const { default: Page } = await import('@/app/ros/compose/page')
  return render(<Page />)
}

async function fillCompose(user: { type: (el: Element, text: string) => Promise<void> }) {
  await user.type(screen.getByLabelText('Nome da campanha'), 'Divulgação setembro')
  await user.type(screen.getByLabelText('Assunto'), 'Conheça o Recrutaê OS')
  await user.type(screen.getByLabelText('Mensagem'), 'Olá, {{nome}}! Conheça o **Recrutaê OS**.')
  await user.type(screen.getByLabelText('Nome do remetente'), 'João Mari')
}

describe('composição da campanha ROS', () => {
  it('inicia com o remetente ROS, variação desligada e assinatura do OS', async () => {
    mockRosApi()
    await renderCompose()

    expect(screen.getByLabelText('E-mail de envio')).toHaveValue('contato@recrutae.com.br')
    expect(screen.getByLabelText('Variar assunto')).not.toBeChecked()
    expect(screen.getByLabelText('Variação por contato')).toHaveValue('6')
    expect(screen.getAllByText('Recrutaê | OS').length).toBeGreaterThan(0)
  })

  it('recusa remetente fora do domínio da Recrutaê', async () => {
    const user = (await import('@testing-library/user-event')).default.setup()
    const calls = mockRosApi()
    await renderCompose()
    await fillCompose(user)

    await user.selectOptions(screen.getByLabelText('E-mail de envio'), '__outro__')
    await user.type(screen.getByLabelText('Outro e-mail de envio'), 'contato@gmail.com')
    await user.click(screen.getByRole('button', { name: /revisar e-mails/i }))

    expect(screen.getByText(/deve usar o domínio @recrutae\.com\.br/i)).toBeInTheDocument()
    expect(calls.some((call) => call.url.includes('save-campaign'))).toBe(false)
  })

  it('só navega e limpa a sessão depois que a campanha é salva', async () => {
    const user = (await import('@testing-library/user-event')).default.setup()
    mockRosApi({ success: false, error: 'Supabase fora do ar.' }, 503)
    await renderCompose()
    await fillCompose(user)

    await user.click(screen.getByRole('button', { name: /revisar e-mails/i }))

    expect(await screen.findByText(/supabase fora do ar/i)).toBeInTheDocument()
    expect(sessionStorage.getItem('ros-pending-contacts')).not.toBeNull()
    expect(push).not.toHaveBeenCalledWith('/ros/review')
  })

  it('persiste a campanha com os contatos e segue para a revisão', async () => {
    const user = (await import('@testing-library/user-event')).default.setup()
    const calls = mockRosApi()
    await renderCompose()
    await fillCompose(user)

    await user.click(screen.getByRole('button', { name: /revisar e-mails/i }))

    const save = await vi.waitFor(() => {
      const found = calls.find((call) => call.url.includes('save-campaign'))
      if (!found) throw new Error('save-campaign não foi chamado')
      return found
    })
    const body = save.body as { campaign: { campaignKind: string }; config: Record<string, unknown>; contacts: unknown[] }
    expect(body.campaign.campaignKind).toBe('ros')
    expect(body.config.recruiterEmail).toBe('contato@recrutae.com.br')
    expect(body.config.variationPercent).toBe(6)
    expect(body.contacts).toHaveLength(1)
    await vi.waitFor(() => expect(push).toHaveBeenCalledWith('/ros/review'))
    expect(sessionStorage.getItem('ros-pending-contacts')).toBeNull()
  })
})

// ── Task 12: revisão, edição e aprovação ───────────────────────────────

const reviewConfig = {
  recruiterName: 'João Mari', recruiterRole: 'Comercial', recruiterEmail: 'contato@recrutae.com.br',
  replyTo: 'contato@recrutae.com.br', recruiterLinkedin: '', recruiterWhatsapp: '',
  subjectTemplate: 'Conheça o ROS', emailTemplate: 'Olá, {{nome}}!',
  varySubject: false, variationPercent: 6 as const,
}

const readyContact = rosContact({
  id: 'c1', email: 'ana@example.com', fullName: 'Ana Souza', firstName: 'Ana', lastName: 'Souza',
  company: 'Acme', position: 'Head de RH', status: 'ready',
  generatedSubject: 'Conheça o ROS', generatedBody: 'Olá, Ana!',
  editedSubject: 'Conheça o ROS', editedBody: 'Olá, Ana!',
})

describe('editor de e-mail ROS', () => {
  it('aprova o contato selecionado', async () => {
    const user = (await import('@testing-library/user-event')).default.setup()
    const { RosEmailEditor } = await import('@/components/ros/RosEmailEditor')
    const onApprove = vi.fn()

    render(<RosEmailEditor contact={readyContact} config={reviewConfig} onSave={vi.fn()}
      onApprove={onApprove} onRegenerate={vi.fn()} onSkip={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Aprovar' }))

    expect(onApprove).toHaveBeenCalledWith('c1')
  })

  it('salva a edição uma vez só, depois que o usuário para de digitar', async () => {
    const user = (await import('@testing-library/user-event')).default.setup()
    const { RosEmailEditor } = await import('@/components/ros/RosEmailEditor')
    const onSave = vi.fn()

    render(<RosEmailEditor contact={readyContact} config={reviewConfig} onSave={onSave}
      onApprove={vi.fn()} onRegenerate={vi.fn()} onSkip={vi.fn()} />)

    await user.type(screen.getByLabelText('Assunto'), ' agora')
    // Nada é gravado enquanto as teclas chegam.
    expect(onSave).not.toHaveBeenCalled()

    await vi.waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    expect(onSave).toHaveBeenCalledWith('c1', expect.objectContaining({ editedSubject: 'Conheça o ROS agora' }))
  })

  it('avisa quando a IA não pôde variar e o texto-base foi usado', async () => {
    const { RosEmailEditor } = await import('@/components/ros/RosEmailEditor')

    render(<RosEmailEditor contact={readyContact} config={reviewConfig} onSave={vi.fn()}
      onApprove={vi.fn()} onRegenerate={vi.fn()} onSkip={vi.fn()}
      generation={{ usedProvider: 'template', didFallback: true, templateEnforced: true }} />)

    expect(screen.getByText(/texto-base/i)).toBeInTheDocument()
  })

  it('usa os atalhos só fora dos campos de texto', async () => {
    const user = (await import('@testing-library/user-event')).default.setup()
    const { RosEmailEditor } = await import('@/components/ros/RosEmailEditor')
    const onApprove = vi.fn()

    render(<RosEmailEditor contact={readyContact} config={reviewConfig} onSave={vi.fn()}
      onApprove={onApprove} onRegenerate={vi.fn()} onSkip={vi.fn()} />)

    await user.click(screen.getByLabelText('Assunto'))
    await user.keyboard('a')
    expect(onApprove).not.toHaveBeenCalled()

    await user.click(document.body)
    await user.keyboard('a')
    expect(onApprove).toHaveBeenCalledWith('c1')
  })

  it('não aprova e-mail sem assunto ou sem corpo', async () => {
    const user = (await import('@testing-library/user-event')).default.setup()
    const { RosEmailEditor } = await import('@/components/ros/RosEmailEditor')
    const onApprove = vi.fn()
    const empty = { ...readyContact, editedSubject: '', editedBody: '', generatedSubject: '', generatedBody: '' }

    render(<RosEmailEditor contact={empty} config={reviewConfig} onSave={vi.fn()}
      onApprove={onApprove} onRegenerate={vi.fn()} onSkip={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Aprovar' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Aprovar' }))
    expect(onApprove).not.toHaveBeenCalled()
  })
})

describe('página de revisão ROS', () => {
  async function seedCampaign(contacts: RosContact[]) {
    const { useRosStore } = await import('@/store/rosStore')
    useRosStore.setState({ campaigns: [], activeCampaignId: null, contactsByCampaign: {}, campaignConfigById: {} })
    const id = useRosStore.getState().createCampaign('Divulgação', contacts, reviewConfig)
    return { id, useRosStore }
  }

  it('gera os pendentes um a um e libera o envio só com tudo aprovado', async () => {
    const user = (await import('@testing-library/user-event')).default.setup()
    const generated: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body))
      // Aprovar passou a exigir confirmação do servidor.
      if (String(input).includes('/api/ros/approve')) {
        return asResponse({ ok: true, status: 200, json: async () => ({ success: true, approved: body.contactIds, rejected: [] }) })
      }
      generated.push(body.contact.id)
      return asResponse({
        ok: true, status: 200,
        json: async () => ({ subject: 'Conheça o ROS', body: `Olá, ${body.contact.firstName}!`, usedProvider: 'openai', didFallback: false }),
      } as Record<string, unknown>)
    }))

    const { useRosStore } = await seedCampaign([
      rosContact({ id: 'c1', email: 'ana@example.com', fullName: 'Ana Souza', firstName: 'Ana' }),
      rosContact({ id: 'c2', email: 'bruno@example.com', fullName: 'Bruno Lima', firstName: 'Bruno' }),
    ])
    const { default: Page } = await import('@/app/ros/review/page')

    render(<Page />)

    await vi.waitFor(() => {
      const contacts = Object.values(useRosStore.getState().contactsByCampaign)[0]
      expect(contacts.every((c) => c.status === 'ready')).toBe(true)
    }, { timeout: 20_000 })

    expect(generated).toEqual(['c1', 'c2'])

    const sendButton = screen.getByRole('button', { name: /enviar campanha/i })
    expect(sendButton).toBeDisabled()

    await user.click(screen.getByRole('button', { name: /aprovar todos os prontos/i }))

    await vi.waitFor(() => expect(sendButton).toBeEnabled())
    await user.click(sendButton)
    expect(push).toHaveBeenCalledWith('/ros/sending')
  })

  it('marca falha sem travar o restante da fila', async () => {
    let call = 0
    vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body))
      call += 1
      if (call === 1) return asResponse({ ok: false, status: 502, json: async () => ({ error: 'Provedor fora do ar.' }) } as Record<string, unknown>)
      return asResponse({ ok: true, status: 200, json: async () => ({ subject: 'S', body: `Olá, ${body.contact.firstName}!`, usedProvider: 'groq', didFallback: true }) } as Record<string, unknown>)
    }))

    const { useRosStore } = await seedCampaign([
      rosContact({ id: 'c1', email: 'ana@example.com', fullName: 'Ana', firstName: 'Ana' }),
      rosContact({ id: 'c2', email: 'bruno@example.com', fullName: 'Bruno', firstName: 'Bruno' }),
    ])
    const { default: Page } = await import('@/app/ros/review/page')

    render(<Page />)

    await vi.waitFor(() => {
      const contacts = Object.values(useRosStore.getState().contactsByCampaign)[0]
      expect(contacts.map((c) => c.status)).toEqual(['failed', 'ready'])
    }, { timeout: 20_000 })

    expect(screen.getByRole('button', { name: /enviar campanha/i })).toBeDisabled()
  })
})

describe('corridas e retentativa na composição', () => {
  it('não sobrescreve o remetente que o usuário já digitou', async () => {
    const user = (await import('@testing-library/user-event')).default.setup()
    let releasePreflight: () => void = () => {}
    const preflightReady = new Promise<void>((resolve) => { releasePreflight = resolve })

    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo) => {
      if (String(input).includes('/api/ros/preflight')) {
        await preflightReady
        return asResponse({ ok: true, status: 200, json: async () => ({ canSend: true, checks: [], fromEmail: 'contato@recrutae.com.br' }) } as Record<string, unknown>)
      }
      return asResponse({ ok: true, status: 200, json: async () => ({ success: true }) } as Record<string, unknown>)
    }))

    await renderCompose()

    await user.selectOptions(screen.getByLabelText('E-mail de envio'), '__outro__')
    const custom = screen.getByLabelText('Outro e-mail de envio')
    await user.type(custom, 'joao@recrutae.com.br')

    releasePreflight()
    await vi.waitFor(() => expect(custom).toHaveValue('joao@recrutae.com.br'))
  })

  it('repete o salvamento com o mesmo id de campanha depois de uma falha', async () => {
    const user = (await import('@testing-library/user-event')).default.setup()
    const saved: Array<{ id: string }> = []
    let attempt = 0

    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo, init?: RequestInit) => {
      if (String(input).includes('/api/ros/preflight')) {
        return asResponse({ ok: true, status: 200, json: async () => ({ canSend: true, checks: [], fromEmail: 'contato@recrutae.com.br' }) } as Record<string, unknown>)
      }
      const body = JSON.parse(String(init?.body))
      saved.push({ id: body.campaign.id })
      attempt += 1
      if (attempt === 1) return asResponse({ ok: false, status: 503, json: async () => ({ success: false, error: 'Banco indisponível.' }) } as Record<string, unknown>)
      return asResponse({ ok: true, status: 200, json: async () => ({ success: true }) } as Record<string, unknown>)
    }))

    await renderCompose()
    await fillCompose(user)

    await user.click(screen.getByRole('button', { name: /revisar e-mails/i }))
    expect(await screen.findByText(/banco indisponível/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /revisar e-mails/i }))
    await vi.waitFor(() => expect(saved).toHaveLength(2))

    // Mudar o id faria os contatos pertencerem a outra campanha e o servidor
    // recusaria o lote para sempre.
    expect(saved[0].id).toBe(saved[1].id)
    await vi.waitFor(() => expect(push).toHaveBeenCalledWith('/ros/review'))
  })
})

// ── Task 13: envio, resultados e histórico ─────────────────────────────

describe('tela de envio ROS', () => {
  async function seedForSending(contacts: RosContact[]) {
    const { useRosStore } = await import('@/store/rosStore')
    useRosStore.setState({ campaigns: [], activeCampaignId: null, contactsByCampaign: {}, campaignConfigById: {} })
    useRosStore.getState().createCampaign('Divulgação', contacts, reviewConfig)
    return useRosStore
  }

  const approved = (id: string, email: string) => rosContact({
    id, email, fullName: id, firstName: id, status: 'approved',
    generatedSubject: 'S', generatedBody: 'B', editedSubject: 'S', editedBody: 'B',
  })

  it('envia em sequência, segue após falha e conclui a campanha', async () => {
    const user = (await import('@testing-library/user-event')).default.setup()
    const sent: string[] = []
    let finalized = false

    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/api/ros/preflight')) {
        return asResponse({ ok: true, status: 200, json: async () => ({ canSend: true, checks: [{ key: 'domain', status: 'ok', message: 'Domínio verificado.' }], fromEmail: 'contato@recrutae.com.br' }) } as Record<string, unknown>)
      }
      if (url.includes('/api/ros/campaigns')) return asResponse({ ok: true, status: 200, json: async () => ({ contacts: [] }) } as Record<string, unknown>)
      if (url.includes('/api/ros/finalize-campaign')) { finalized = true; return asResponse({ ok: true, status: 200, json: async () => ({ success: true }) } as Record<string, unknown>) }
      const body = JSON.parse(String(init?.body))
      sent.push(body.contactId)
      if (body.contactId === 'b') {
        return asResponse({ ok: false, status: 409, json: async () => ({ success: false, suppressed: true, error: 'suprimido' }) } as Record<string, unknown>)
      }
      return asResponse({ ok: true, status: 200, json: async () => ({ success: true, messageId: `msg-${body.contactId}` }) } as Record<string, unknown>)
    }))

    const store = await seedForSending([approved('a', 'a@example.com'), approved('b', 'b@example.com'), approved('c', 'c@example.com')])
    const { default: Page } = await import('@/app/ros/sending/page')

    render(<Page />)

    const button = await screen.findByRole('button', { name: /enviar campanha/i })
    await vi.waitFor(() => expect(button).toBeEnabled())
    await user.click(button)

    await vi.waitFor(() => expect(push).toHaveBeenCalledWith('/ros/sent'), { timeout: 20_000 })

    expect(sent).toEqual(['a', 'b', 'c'])
    expect(finalized).toBe(true)
    const contacts = Object.values(store.getState().contactsByCampaign)[0]
    expect(contacts.map((c) => c.status)).toEqual(['sent', 'failed', 'sent'])
    expect(contacts[1].errorMessage).toContain('suprimido')
  })

  it('bloqueia o envio quando a verificação reprova', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo) => {
      const url = String(input)
      if (url.includes('/api/ros/campaigns')) return asResponse({ ok: true, status: 200, json: async () => ({ contacts: [] }) } as Record<string, unknown>)
      return asResponse({ ok: false, status: 503, json: async () => ({ canSend: false, fromEmail: 'contato@recrutae.com.br', checks: [{ key: 'unsubscribe', status: 'error', message: 'Segredo de descadastro ausente.' }] }) } as Record<string, unknown>)
    }))

    await seedForSending([approved('a', 'a@example.com')])
    const { default: Page } = await import('@/app/ros/sending/page')

    render(<Page />)

    expect(await screen.findByText(/segredo de descadastro ausente/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /enviar campanha/i })).toBeDisabled()
  })

  it('reconcilia contatos presos em envio antes de liberar a fila', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo) => {
      const url = String(input)
      if (url.includes('/api/ros/preflight')) {
        return asResponse({ ok: true, status: 200, json: async () => ({ canSend: true, checks: [], fromEmail: 'contato@recrutae.com.br' }) } as Record<string, unknown>)
      }
      return asResponse({
        ok: true, status: 200,
        json: async () => ({ contacts: [
          { id: 'a', status: 'sent', sentAt: '2026-09-16T10:00:00Z', messageId: 'm1' },
          { id: 'b', status: 'approved' },
        ] }),
      } as Record<string, unknown>)
    }))

    const store = await seedForSending([
      { ...approved('a', 'a@example.com'), status: 'sending' as const },
      { ...approved('b', 'b@example.com'), status: 'sending' as const },
    ])
    const { default: Page } = await import('@/app/ros/sending/page')

    render(<Page />)

    await vi.waitFor(() => {
      const contacts = Object.values(store.getState().contactsByCampaign)[0]
      expect(contacts.map((c) => c.status)).toEqual(['sent', 'failed'])
    })
    // O que o servidor confirmou como enviado nunca volta para a fila.
    expect(screen.getByRole('button', { name: /enviar campanha/i })).toBeEnabled()
  })
})

describe('histórico ROS', () => {
  it('lista somente campanhas ROS e exclui pela rota filtrada', async () => {
    const user = (await import('@testing-library/user-event')).default.setup()
    vi.stubGlobal('confirm', vi.fn(() => true))
    let deletedId: string | null = null

    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo, init?: RequestInit) => {
      const url = String(input)
      if (init?.method === 'DELETE') {
        deletedId = new URL(url, 'https://x').searchParams.get('campaignId')
        return asResponse({ ok: true, status: 200, json: async () => ({ success: true }) } as Record<string, unknown>)
      }
      return asResponse({
        ok: true, status: 200,
        json: async () => ({ campaigns: [{
          id: 'ros-1', name: 'Divulgação setembro', status: 'completed', totalContacts: 3,
          sentCount: 2, failedCount: 1, createdAt: '2026-09-15T12:00:00Z',
          recruiterName: 'João', recruiterEmail: 'contato@recrutae.com.br',
        }] }),
      } as Record<string, unknown>)
    }))

    const { default: Page } = await import('@/app/ros/campaigns/page')

    render(<Page />)

    expect(await screen.findByText('Divulgação setembro')).toBeInTheDocument()
    expect(screen.getByText('2 enviados')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /excluir campanha divulgação setembro/i }))

    await vi.waitFor(() => expect(deletedId).toBe('ros-1'))
  })
})

describe('escolha de remetente e destino das respostas', () => {
  it('oferece os endereços do domínio e faz a resposta seguir o envio', async () => {
    const user = (await import('@testing-library/user-event')).default.setup()
    const calls = mockRosApi()
    await renderCompose()

    const sender = await screen.findByLabelText('E-mail de envio')
    // Os dois seletores oferecem os mesmos endereços; a busca fica no de envio.
    await vi.waitFor(() => expect(within(sender).getByRole('option', { name: 'comercial@recrutae.com.br' })).toBeInTheDocument())

    await user.selectOptions(sender, 'comercial@recrutae.com.br')

    // "Mesmo e-mail de envio" é o padrão: a resposta acompanha a escolha.
    expect(screen.getByLabelText('Responder para')).toHaveValue('same')

    await fillCompose(user)
    await user.click(screen.getByRole('button', { name: /revisar e-mails/i }))

    const save = await vi.waitFor(() => {
      const found = calls.find((call) => call.url.includes('save-campaign'))
      if (!found) throw new Error('save-campaign não foi chamado')
      return found
    })
    const body = save.body as { config: { recruiterEmail: string; replyTo: string } }
    expect(body.config.recruiterEmail).toBe('comercial@recrutae.com.br')
    expect(body.config.replyTo).toBe('comercial@recrutae.com.br')
  })

  it('permite direcionar as respostas para outro endereço', async () => {
    const user = (await import('@testing-library/user-event')).default.setup()
    const calls = mockRosApi()
    await renderCompose()

    await user.selectOptions(await screen.findByLabelText('Responder para'), '__outro__')
    await user.type(screen.getByLabelText('Outro e-mail para respostas'), 'respostas@parceiro.com')

    await fillCompose(user)
    await user.click(screen.getByRole('button', { name: /revisar e-mails/i }))

    const save = await vi.waitFor(() => {
      const found = calls.find((call) => call.url.includes('save-campaign'))
      if (!found) throw new Error('save-campaign não foi chamado')
      return found
    })
    const body = save.body as { config: { recruiterEmail: string; replyTo: string } }
    expect(body.config.replyTo).toBe('respostas@parceiro.com')
    expect(body.config.recruiterEmail).toBe('contato@recrutae.com.br')
  })

  it('recusa endereço de resposta inválido', async () => {
    const user = (await import('@testing-library/user-event')).default.setup()
    const calls = mockRosApi()
    await renderCompose()
    await fillCompose(user)

    await user.selectOptions(screen.getByLabelText('Responder para'), '__outro__')
    await user.type(screen.getByLabelText('Outro e-mail para respostas'), 'sem-arroba')
    await user.click(screen.getByRole('button', { name: /revisar e-mails/i }))

    expect(screen.getByText(/e-mail válido para resposta/i)).toBeInTheDocument()
    expect(calls.some((call) => call.url.includes('save-campaign'))).toBe(false)
  })
})

describe('aprovação chega ao servidor', () => {
  async function seedReady(contacts: RosContact[]) {
    const { useRosStore } = await import('@/store/rosStore')
    useRosStore.setState({ campaigns: [], activeCampaignId: null, contactsByCampaign: {}, campaignConfigById: {} })
    useRosStore.getState().createCampaign('Divulgação', contacts, reviewConfig)
    return useRosStore
  }

  const pronto = (id: string) => rosContact({
    id, email: `${id}@example.com`, fullName: id, firstName: id, status: 'ready',
    generatedSubject: 'S', generatedBody: 'B', editedSubject: 'S', editedBody: 'B',
  })

  it('grava a aprovação antes de marcar na tela', async () => {
    const user = (await import('@testing-library/user-event')).default.setup()
    const chamadas: Array<{ url: string; body: unknown }> = []
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo, init?: RequestInit) => {
      const url = String(input)
      const body = init?.body ? JSON.parse(String(init.body)) : undefined
      chamadas.push({ url, body })
      if (url.includes('/api/ros/approve')) {
        return asResponse({ ok: true, status: 200, json: async () => ({ success: true, approved: body.contactIds, rejected: [] }) })
      }
      return asResponse({ ok: true, status: 200, json: async () => ({}) })
    }))

    const store = await seedReady([pronto('a'), pronto('b')])
    const { default: Page } = await import('@/app/ros/review/page')
    render(<Page />)

    await user.click(await screen.findByRole('button', { name: /aprovar todos os prontos/i }))

    await vi.waitFor(() => {
      const contatos = Object.values(store.getState().contactsByCampaign)[0]
      expect(contatos.every((c) => c.status === 'approved')).toBe(true)
    })

    const aprovacao = chamadas.find((c) => c.url.includes('/api/ros/approve'))
    expect(aprovacao).toBeTruthy()
    expect((aprovacao!.body as { contactIds: string[] }).contactIds.sort()).toEqual(['a', 'b'])
  })

  it('não marca como aprovado quando o servidor recusa', async () => {
    const user = (await import('@testing-library/user-event')).default.setup()
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo) => {
      if (String(input).includes('/api/ros/approve')) {
        return asResponse({ ok: false, status: 503, json: async () => ({ success: false, error: 'Banco indisponível.' }) })
      }
      return asResponse({ ok: true, status: 200, json: async () => ({}) })
    }))

    const store = await seedReady([pronto('a')])
    const { default: Page } = await import('@/app/ros/review/page')
    render(<Page />)

    await user.click(await screen.findByRole('button', { name: /aprovar todos os prontos/i }))

    // A campanha inteira já falhou no envio por confiar numa aprovação que só
    // existia na aba; sem confirmação do servidor, o estado local não muda.
    await vi.waitFor(() => {
      const contatos = Object.values(store.getState().contactsByCampaign)[0]
      expect(contatos[0].status).toBe('ready')
    })
    expect(screen.getByRole('button', { name: /enviar campanha/i })).toBeDisabled()
  })

  it('reaprova contatos que o servidor recusou antes', async () => {
    const user = (await import('@testing-library/user-event')).default.setup()
    const enviados: string[][] = []
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : undefined
      if (String(input).includes('/api/ros/approve')) {
        enviados.push(body.contactIds)
        return asResponse({ ok: true, status: 200, json: async () => ({ success: true, approved: body.contactIds, rejected: [] }) })
      }
      return asResponse({ ok: true, status: 200, json: async () => ({}) })
    }))

    // É o estado em que a campanha real ficou: texto pronto, marcado failed.
    const store = await seedReady([{ ...pronto('a'), status: 'failed' as const, errorMessage: 'Contato não disponível para envio.' }])
    const { default: Page } = await import('@/app/ros/review/page')
    render(<Page />)

    await user.click(await screen.findByRole('button', { name: /aprovar todos os prontos/i }))

    await vi.waitFor(() => {
      const contatos = Object.values(store.getState().contactsByCampaign)[0]
      expect(contatos[0].status).toBe('approved')
    })
    expect(enviados[0]).toEqual(['a'])
  })
})
