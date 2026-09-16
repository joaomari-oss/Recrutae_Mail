import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { RosContact } from '@/lib/rosTypes'

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

describe('tabela de conferência ROS', () => {
  it('bloqueia e-mail duplicado na edição e preserva o contato original', async () => {
    const user = (await import('@testing-library/user-event')).default.setup()
    const { RosContactTable } = await import('@/components/ros/RosContactTable')
    const onUpdate = vi.fn()

    render(
      <RosContactTable
        contacts={[
          rosContact({ id: '1', email: 'ana@example.com', fullName: 'Ana' }),
          rosContact({ id: '2', email: 'bruno@example.com', fullName: 'Bruno' }),
        ]}
        onUpdate={onUpdate}
        onRemove={vi.fn()}
      />,
    )

    const secondEmail = screen.getByLabelText('E-mail do contato 2')
    await user.clear(secondEmail)
    await user.type(secondEmail, 'ana@example.com')

    expect(screen.getByText('E-mail duplicado')).toBeInTheDocument()
    expect(onUpdate).not.toHaveBeenCalledWith('2', expect.objectContaining({ email: 'ana@example.com' }))
  })

  it('remove a linha escolhida', async () => {
    const user = (await import('@testing-library/user-event')).default.setup()
    const { RosContactTable } = await import('@/components/ros/RosContactTable')
    const onRemove = vi.fn()

    render(
      <RosContactTable
        contacts={[rosContact({ id: '1', email: 'ana@example.com', fullName: 'Ana' })]}
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
