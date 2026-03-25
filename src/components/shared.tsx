import { ArrowRight, CheckCircle2, Orbit } from 'lucide-react'
import type { ReactNode } from 'react'
import type { BannerMessage, ViewId } from '../app/types'

export function Banner({ banner }: { banner: BannerMessage }) {
  return (
    <section className={`banner banner-${banner.tone}`}>
      <div className="banner-dot" />
      <div>
        <strong>{banner.title}</strong>
        <p>{banner.body}</p>
      </div>
    </section>
  )
}

export function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

export function PipelineCard({ title, copy, icon }: { title: string; copy: string; icon: ReactNode }) {
  return (
    <article className="pipeline-card">
      <div className="pipeline-icon">{icon}</div>
      <strong>{title}</strong>
      <p>{copy}</p>
    </article>
  )
}

export function ArtifactList({ title, items, compact = false }: { title: string; items: string[]; compact?: boolean }) {
  if (items.length === 0) {
    return null
  }

  return (
    <section className={`list-card ${compact ? 'is-compact' : ''}`}>
      <div className="panel-header">
        <div>
          <span className="eyebrow">{title}</span>
        </div>
      </div>
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  )
}

export function EmptyArtifact({ title, copy }: { title: string; copy: string }) {
  return (
    <article className="empty-state">
      <strong>{title}</strong>
      <p>{copy}</p>
    </article>
  )
}

export function ActionHeader({
  title,
  subtitle,
  actionLabel,
  disabled,
  onClick,
}: {
  title: string
  subtitle: string
  actionLabel: string
  disabled: boolean
  onClick: () => void
}) {
  return (
    <section className="feature-ribbon">
      <div>
        <span className="eyebrow">{title}</span>
        <h4>{subtitle}</h4>
      </div>
      <button className="primary-button" disabled={disabled} onClick={onClick} type="button">
        {actionLabel}
        {!disabled && <ArrowRight size={16} />}
      </button>
    </section>
  )
}

export function ArtifactHero({ artifactTitle, summary }: { artifactTitle: string; summary: string }) {
  return (
    <section className="feature-ribbon">
      <div>
        <span className="eyebrow">Artifact ready</span>
        <h4>{artifactTitle}</h4>
        <p>{summary}</p>
      </div>
    </section>
  )
}

export function StageProgress({ progress }: { progress: Array<{ label: string; done: boolean }> }) {
  return (
    <div className="progress-grid">
      {progress.map((item) => (
        <div key={item.label} className={`progress-pill ${item.done ? 'is-done' : ''}`}>
          {item.done ? <CheckCircle2 size={14} /> : <Orbit size={14} />}
          <span>{item.label}</span>
        </div>
      ))}
    </div>
  )
}

export function ShortcutButton({ label, onClick }: { label: string; onClick: (view: ViewId) => void }) {
  return (
    <button className="ghost-button" onClick={() => onClick('goal')} type="button">
      {label}
    </button>
  )
}
