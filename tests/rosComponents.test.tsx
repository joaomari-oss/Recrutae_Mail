import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

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
