import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
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
