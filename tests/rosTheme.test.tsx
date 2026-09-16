import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { isRosPath } from '@/lib/ros/routes'

let pathname = '/ros'

vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
  useRouter: () => ({ push: vi.fn() }),
}))

// The layout is the unit under test; its neighbours would pull the store,
// integrity checks and a polling fetch into jsdom for no added coverage.
vi.mock('@/components/Sidebar', () => ({ Sidebar: () => <aside data-testid="sidebar" /> }))
vi.mock('@/lib/integrity', () => ({ validateStoreIntegrity: vi.fn(), cleanupOldCampaigns: () => 0 }))
vi.mock('@/store', () => ({ useAppStore: () => vi.fn() }))

async function renderLayoutAt(path: string) {
  pathname = path
  const { ClientLayout } = await import('@/components/ClientLayout')
  return render(<ClientLayout><p>conteúdo</p></ClientLayout>)
}

afterEach(() => {
  document.body.classList.remove('ros-theme')
})

describe('escopo do tema ROS', () => {
  it('reconhece apenas segmentos ROS reais', () => {
    expect(isRosPath('/ros')).toBe(true)
    expect(isRosPath('/ros/compose')).toBe(true)
    expect(isRosPath('/roster')).toBe(false)
    expect(isRosPath('/clients/review')).toBe(false)
    expect(isRosPath('/')).toBe(false)
  })

  it('aplica o tema no wrapper e no body das rotas ROS', async () => {
    const { container } = await renderLayoutAt('/ros/compose')

    expect(container.querySelector('.ros-theme')).not.toBeNull()
    // Radix dialogs and sonner toasts portal into the body.
    expect(document.body).toHaveClass('ros-theme')
  })

  it('não vaza o tema para Clientes nem para Candidatos', async () => {
    for (const path of ['/clients/compose', '/campaign', '/campaigns']) {
      const { container, unmount } = await renderLayoutAt(path)
      expect(container.querySelector('.ros-theme')).toBeNull()
      expect(document.body).not.toHaveClass('ros-theme')
      unmount()
    }
  })

  it('remove o tema do body ao sair da área ROS', async () => {
    const { unmount } = await renderLayoutAt('/ros')
    expect(document.body).toHaveClass('ros-theme')

    unmount()

    expect(document.body).not.toHaveClass('ros-theme')
  })

  it('mantém /unsubscribe sem sidebar e sem tema ROS', async () => {
    const { container, queryByTestId } = await renderLayoutAt('/unsubscribe')

    expect(queryByTestId('sidebar')).toBeNull()
    expect(container.querySelector('.ros-theme')).toBeNull()
    expect(document.body).not.toHaveClass('ros-theme')
  })
})

describe('assets de marca', () => {
  it('toda imagem referenciada pela raiz existe em public/', () => {
    // Vitest roda a partir da raiz do pacote; ancorar aqui evita depender do cwd do shell.
    const repoRoot = process.cwd()
    const sources: string[] = []
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry)
        if (statSync(full).isDirectory()) walk(full)
        else if (/\.(tsx?|css)$/.test(entry)) sources.push(full)
      }
    }
    for (const root of ['app', 'components', 'lib', 'store']) walk(join(repoRoot, root))

    // O Windows resolve caminhos sem diferenciar maiúsculas; a checagem percorre
    // o diretório para que um erro de caixa falhe aqui e não só no deploy Linux.
    const existsCaseSensitive = (relative: string): boolean => {
      let current = join(repoRoot, 'public')
      for (const segment of relative.split('/').filter(Boolean)) {
        if (!readdirSync(current).includes(segment)) return false
        current = join(current, segment)
      }
      return true
    }

    const missing: string[] = []
    for (const file of sources) {
      const content = readFileSync(file, 'utf8')
      // Só caminhos de raiz do próprio projeto — `//cdn.exemplo/x.png` é externo.
      for (const match of content.matchAll(/['"`](\/[\w.-][\w./-]*\.(?:png|jpe?g|webp|svg|gif|ico))['"`]/g)) {
        if (!existsCaseSensitive(match[1])) missing.push(`${file.slice(repoRoot.length)} → ${match[1]}`)
      }
    }

    expect(missing).toEqual([])
  })
})
