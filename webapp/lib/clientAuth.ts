export async function register(payload: { name: string; email: string; password: string }) {
  const res = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return res.json()
}

export async function login(payload: { email: string; password: string }) {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return res.json()
}

export function getToken() {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('token')
}

export function logout() {
  if (typeof window === 'undefined') return
  localStorage.removeItem('token')
}
