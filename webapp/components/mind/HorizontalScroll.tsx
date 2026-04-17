'use client'

interface HorizontalScrollProps {
  children: React.ReactNode
  className?: string
}

export default function HorizontalScroll({ children, className = '' }: HorizontalScrollProps) {
  return (
    <div className={`-mx-3 sm:-mx-6 overflow-x-auto scrollbar-none ${className}`}>
      <div
        className="flex gap-3 px-3 sm:px-6"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {children}
        {/* Trailing spacer so last card isn't flush against the edge */}
        <div className="w-1 shrink-0" />
      </div>
    </div>
  )
}
