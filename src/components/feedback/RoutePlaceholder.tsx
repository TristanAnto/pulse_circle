type RoutePlaceholderProps = {
  title: string
}

export function RoutePlaceholder({ title }: RoutePlaceholderProps) {
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-3xl flex-col justify-center gap-4 px-6 py-16">
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-pulse-700">
        Pulse Circle
      </p>
      <h1 className="text-3xl font-semibold tracking-tight text-ink">{title}</h1>
      <p className="max-w-prose text-ink-muted">
        This route is a placeholder. Page content is added in a later phase.
      </p>
    </main>
  )
}
