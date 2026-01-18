export async function POST() {
  // Clear the auth cookie
  return new Response(JSON.stringify({ success: true }), { 
    status: 200,
    headers: {
      'Set-Cookie': 'auth_token=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax'
    }
  })
}
