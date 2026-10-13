/**
 * Hand a food report to a human when the machine has run out of road.
 *
 * The pipeline can search the web, resolve a UPC against USDA and retailers, and
 * still be wrong — because every "independent" source can be a copy of the same
 * stale figure, and our own row can be a copy of that. A member standing in
 * their kitchen holding the packet is the only party with fresher information
 * than the entire internet, and the reviewer has no way to outrank a consensus
 * of stale sources on its own.
 *
 * So: a review that ends in NO CHANGE while the member supplied photo evidence
 * is not a settled question. It is a question the machine cannot settle. It goes
 * to a person, with the pictures attached.
 *
 * Real case that motivated this (2026-08-13, Mission "Original Zero"): the
 * record said 25 cal per 18g tortilla, the member's panel photo said 3 tortillas
 * = 110 cal. Same 54g of product, a 47% gap. The reviewer confirmed the record
 * and explained the photo away as "a different serving size or package variant"
 * without ever checking that 3 x 18g reconciles the two readings.
 */

import { sendEmail } from '@/lib/email'
import { getBlobStore } from '@/lib/blobStorage'

/** Where a stale-data report goes. Both, always — one is the coach's inbox. */
export const ESCALATION_RECIPIENTS = ['george@redbtn.io', 'info@becomeurbest.com']

/** Never attach more than this; the rest are listed as links. */
const MAX_ATTACHMENTS = 6
const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024

export interface EscalationInput {
  flagId: string
  food: {
    id: string
    name: string
    brand?: string
    barcode?: string
    servingLabel?: string
    nutrition?: Record<string, number | undefined>
  }
  reporter: { email?: string; name?: string }
  kinds: string[]
  note?: string
  photoUrls: string[]
  /** What the reviewer concluded, verbatim — the thing a human is second-guessing. */
  verdict: string
  reasoning?: string
  /** Sources the reviewer leaned on, so the human can check them for staleness. */
  sources?: { sourceDomain?: string; url?: string }[]
  rounds: number
  appUrl?: string
}

function esc(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Pull photos out of blob storage so the email carries them, not just links. */
async function attach(photoUrls: string[]) {
  const out: { filename: string; content: Buffer; contentType: string; cid: string }[] = []
  for (const [i, url] of photoUrls.slice(0, MAX_ATTACHMENTS).entries()) {
    try {
      const key = url.replace(/^\/api\/blob\//, '')
      if (!key || key === url) continue
      const blob = await getBlobStore().get(key)
      if (!blob?.body) continue
      const buf = Buffer.from(await new Response(blob.body).arrayBuffer())
      if (!buf.length || buf.length > MAX_ATTACHMENT_BYTES) continue
      const ext = (key.match(/\.(jpe?g|png|webp)$/i)?.[1] ?? 'jpg').toLowerCase()
      const contentType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg'
      out.push({ filename: `evidence-${i + 1}.${ext}`, content: buf, contentType, cid: `evidence${i + 1}` })
    } catch {
      // A photo we cannot fetch is not a reason to withhold the whole report.
    }
  }
  return out
}

export async function escalateFlagToHuman(input: EscalationInput): Promise<boolean> {
  const attachments = await attach(input.photoUrls)
  const n = input.food.nutrition ?? {}

  const macroRow = ['calories', 'protein', 'carbs', 'fats', 'fiber']
    .filter(k => n[k] != null)
    .map(k => `${esc(k)}: <b>${esc(n[k])}</b>`)
    .join(' &middot; ')

  const sourceList = (input.sources ?? [])
    .map(s => `<li>${esc(s.sourceDomain || s.url || 'unknown source')}</li>`)
    .join('') || '<li>none recorded</li>'

  const inlinePhotos = attachments
    .map(a => `<img src="cid:${a.cid}" alt="member evidence" style="max-width:100%;border-radius:8px;margin:8px 0" />`)
    .join('')

  const notAttached = input.photoUrls.length - attachments.length
  const base = input.appUrl?.replace(/\/$/, '') ?? ''

  const html = `
<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:640px;margin:0 auto;color:#18181b">
  <p style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#71717a;margin:0 0 4px">
    Become &middot; food data needs a human
  </p>
  <h2 style="margin:0 0 4px;font-size:20px">${esc(input.food.name)}</h2>
  <p style="margin:0 0 16px;color:#52525b">
    ${esc(input.food.brand ?? 'no brand')}${input.food.barcode ? ` &middot; UPC ${esc(input.food.barcode)}` : ''}
  </p>

  <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:12px 14px;margin-bottom:16px">
    <p style="margin:0;font-size:14px">
      Review #${esc(input.rounds)} ended in <b>no change</b>, but the member supplied photo evidence.
      Online sources and our own record may both be stale copies of the same figure &mdash;
      that is not something the reviewer can settle by reading them again.
    </p>
  </div>

  <h3 style="font-size:14px;margin:0 0 6px">What the member reported</h3>
  <p style="margin:0 0 4px;font-size:14px"><b>Problem:</b> ${esc(input.kinds.join(', ') || 'unspecified')}</p>
  <p style="margin:0 0 16px;font-size:14px"><b>Their words:</b> ${esc(input.note || '(none)')}</p>

  <h3 style="font-size:14px;margin:0 0 6px">What we currently store</h3>
  <p style="margin:0 0 4px;font-size:14px">${esc(input.food.servingLabel ?? 'serving unknown')}</p>
  <p style="margin:0 0 16px;font-size:14px">${macroRow || 'no macros stored'}</p>

  <h3 style="font-size:14px;margin:0 0 6px">What the reviewer decided</h3>
  <p style="margin:0 0 4px;font-size:14px"><b>${esc(input.verdict)}</b></p>
  <p style="margin:0 0 8px;font-size:14px;color:#52525b">${esc(input.reasoning || '')}</p>
  <p style="margin:0 0 4px;font-size:13px;color:#52525b">Sources it leaned on &mdash; check these for staleness:</p>
  <ul style="margin:0 0 16px;font-size:13px;color:#52525b">${sourceList}</ul>

  <h3 style="font-size:14px;margin:0 0 6px">Member evidence</h3>
  ${inlinePhotos || '<p style="font-size:14px;color:#52525b">No photo could be attached.</p>'}
  ${notAttached > 0 ? `<p style="font-size:13px;color:#52525b">${notAttached} further photo(s) not attached.</p>` : ''}

  <p style="margin:20px 0 0;font-size:13px;color:#71717a">
    Flag ${esc(input.flagId)} &middot; food ${esc(input.food.id)}
    ${base ? ` &middot; <a href="${esc(base)}/dashboard/admin/foods/${esc(input.food.id)}">open in admin</a>` : ''}
  </p>
</div>`.trim()

  try {
    await sendEmail({
      to: ESCALATION_RECIPIENTS.join(', '),
      subject: `[Become] Food data needs a human — ${input.food.name}${input.food.brand ? ` (${input.food.brand})` : ''}`,
      html,
      attachments,
    })
    return true
  } catch (err) {
    console.error('[escalateFlagToHuman] send failed:', err)
    return false
  }
}

/**
 * Should this outcome go to a person?
 *
 * Only when the member actually gave us something to look at. A no-change on a
 * bare "this looks wrong" with no photo is a fair no-change — there is nothing
 * for a human to adjudicate that the machine did not already have.
 */
export function shouldEscalate(opts: {
  changed: boolean
  photoCount: number
  alreadyEscalated: boolean
}): boolean {
  return !opts.changed && opts.photoCount > 0 && !opts.alreadyEscalated
}
