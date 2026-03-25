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

    expect(screen.getByText('AI Tracer')).toBeInTheDocument()
    expect(screen.getByText(/Mission control spec-driven/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /abrir goal studio/i })).toBeInTheDocument()
  })
})
