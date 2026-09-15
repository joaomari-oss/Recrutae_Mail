import { describe, expect, it } from 'vitest'
import { rowsToRosContactsDetailed } from '@/lib/contactParsing'
import { createManualRosContact } from '@/lib/ros/contacts'

describe('contatos ROS', () => {
  it('detecta email antes do nome e aliases em português', () => {
    const result = rowsToRosContactsDetailed([
      ['E-mail', 'Empresa', 'Nome', 'Cargo'],
      ['ANA@EXAMPLE.COM', 'ACME', 'Ana Lima', 'Diretora'],
    ])

    expect(result.contacts[0]).toMatchObject({
      email: 'ana@example.com',
      fullName: 'Ana Lima',
      company: 'ACME',
      position: 'Diretora',
    })
  })

  it('relata email inválido e duplicado sem perder linhas válidas', () => {
    const result = rowsToRosContactsDetailed([
      ['Nome', 'Contato'],
      ['Ana', 'ana@example.com'],
      ['Erro', 'sem-email'],
      ['Ana 2', 'ANA@example.com'],
    ])

    expect(result.contacts).toHaveLength(1)
    expect(result.rejected.map((row) => row.reason)).toEqual(['invalid_email', 'duplicate'])
    expect(result.rejected.map((row) => row.rowNumber)).toEqual([3, 4])
  })

  it('relata email ausente quando a coluna de contato é conhecida pelo alias', () => {
    const result = rowsToRosContactsDetailed([
      ['Nome', 'E-mail'],
      ['Sem contato', ''],
    ])

    expect(result.rejected).toEqual([{
      rowNumber: 2,
      reason: 'missing_email',
      values: ['Sem contato', ''],
    }])
  })

  it('aplica a mesma validação ao contato manual', () => {
    expect(() => createManualRosContact(
      { fullName: 'Ana', email: 'errado', company: '', position: '' },
      new Set()
    )).toThrow('E-mail inválido')
  })

  it('trata placeholders de e-mail manual como ausência', () => {
    expect(() => createManualRosContact(
      { fullName: 'Ana', email: 'N/A', company: '', position: '' },
      new Set()
    )).toThrow('E-mail obrigatório')
  })
})
