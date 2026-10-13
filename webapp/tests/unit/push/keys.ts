// Throwaway keys for the push tests. Generated per run; nothing real.
import crypto from 'node:crypto'

export function ecKeyPair() {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
  return {
    privatePem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    publicKey,
  }
}

export function rsaKeyPair() {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 })
  return {
    privatePem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    publicKey,
  }
}

export function decodeJwt(token: string) {
  const [h, c, s] = token.split('.')
  return {
    header: JSON.parse(Buffer.from(h, 'base64url').toString()),
    claims: JSON.parse(Buffer.from(c, 'base64url').toString()),
    signingInput: `${h}.${c}`,
    signature: Buffer.from(s, 'base64url'),
  }
}
