interface SearchParamsLike {
  has(key: string): boolean
  get(key: string): string | null
}

export interface AuthPageCopy {
  mode: 'login' | 'register'
  heading: string
  subtext: string
  toggleQuestion: string
  toggleLabel: string
  toggleHref: string
}

// The register page used to be a separate route that quietly drifted from
// /login (missing dark-mode classes, its own copy). Deriving both views from
// one query param keeps them from diverging again.
export function getAuthPageCopy(searchParams: SearchParamsLike): AuthPageCopy {
  const isRegister = searchParams.has('register')
  const next = searchParams.get('next')
  const nextQuery = next ? `next=${encodeURIComponent(next)}` : ''

  const toggleHref = isRegister
    ? `/login${nextQuery ? `?${nextQuery}` : ''}`
    : `/login?register${nextQuery ? `&${nextQuery}` : ''}`

  if (isRegister) {
    return {
      mode: 'register',
      heading: 'Create account',
      subtext: 'Start your transformation. Create a free account to get going.',
      toggleQuestion: 'Already have an account?',
      toggleLabel: 'Sign in',
      toggleHref,
    }
  }

  return {
    mode: 'login',
    heading: 'Sign in',
    subtext: 'Welcome back. Sign in to pick up where you left off.',
    toggleQuestion: "Don't have an account?",
    toggleLabel: 'Create one',
    toggleHref,
  }
}
