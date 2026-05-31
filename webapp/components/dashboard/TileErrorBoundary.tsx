'use client'

// Per-tile error boundary. Isolates a single tile's render crash so it can't
// take down the entire dashboard tree (which previously surfaced as Next's
// "This page couldn't load"). A failed tile renders a quiet placeholder; the
// rest of the grid and page keep working.

import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  /** Shown in the fallback so a broken tile is still identifiable. */
  label?: string
}

interface State {
  hasError: boolean
}

export default class TileErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: unknown) {
    // Non-fatal: log for diagnostics but don't rethrow.
    console.error('Tile render error', this.props.label ?? '', error)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-full min-h-[5rem] items-center justify-center rounded-2xl border border-zinc-200 bg-white p-3 text-center text-xs text-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-500">
          {this.props.label ? `${this.props.label} unavailable` : 'Tile unavailable'}
        </div>
      )
    }
    return this.props.children
  }
}
