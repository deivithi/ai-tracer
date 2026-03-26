import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import App from './App'

describe('App', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    window.location.hash = ''
  })

  it('renderiza o shell principal do AI Tracer', () => {
    render(<App />)

    expect(screen.getByRole('heading', { name: /Agent chat control plane/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /enviar ao agente/i })).toBeInTheDocument()
    expect(screen.getByLabelText('Chave OpenRouter')).toBeInTheDocument()
  })
})
