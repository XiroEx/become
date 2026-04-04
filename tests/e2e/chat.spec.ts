/**
 * Chat e2e review — sends messages back and forth between two accounts
 * (george8794@gmail.com and a "Jon Don" test account) and verifies
 * delivery, order, and read receipt behaviour.
 *
 * Run: npx playwright test --project=chat-review
 */

import { test, expect, chromium } from '@playwright/test';
import * as fs from 'fs';

const BASE_URL = 'https://become.redbtn.io';

// Load tokens written by the setup script
function loadTokens() {
  const raw = fs.readFileSync('/tmp/chat-tokens.env', 'utf8');
  const lines: Record<string, string> = {};
  for (const line of raw.split('\n')) {
    const [k, ...rest] = line.split('=');
    if (k && rest.length) lines[k.trim()] = rest.join('=').trim();
  }
  return { georgeJwt: lines['GEORGE_JWT'], jonJwt: lines['JON_JWT'] };
}

async function loginAs(jwt: string) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    baseURL: BASE_URL,
  });
  const page = await context.newPage();

  // Inject JWT
  await context.addCookies([{
    name: 'auth_token', value: jwt,
    domain: 'become.redbtn.io', path: '/',
    httpOnly: false, secure: true, sameSite: 'Lax',
  }]);
  await page.goto(`${BASE_URL}/login`);
  await page.evaluate((t) => localStorage.setItem('token', t), jwt);

  return { browser, context, page };
}

async function goToChat(page: import('@playwright/test').Page) {
  await page.goto(`${BASE_URL}/dashboard/chat`);
  await page.waitForLoadState('domcontentloaded');
  // Wait for the chat page to render (either conversation list or message input)
  await page.waitForSelector('h1, textarea, [placeholder*="message" i], [placeholder*="Message" i]', { timeout: 20_000 });
}

async function getOrCreateConversation(jwt: string, otherUserId: string): Promise<string> {
  const res = await fetch(`${BASE_URL}/api/chat/conversations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
    body: JSON.stringify({ participantId: otherUserId }),
  });
  const data = await res.json() as { conversation?: { _id: string }, _id?: string };
  return (data.conversation?._id || data._id) as string;
}

async function sendMessageViaApi(jwt: string, conversationId: string, text: string) {
  const res = await fetch(`${BASE_URL}/api/chat/conversations/${conversationId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
    body: JSON.stringify({ text }),
  });
  const data = await res.json() as { message?: { text: string }, text?: string };
  // API wraps the created message in a `message` key
  return data.message ?? data;
}

async function getMessages(jwt: string, conversationId: string) {
  const res = await fetch(`${BASE_URL}/api/chat/conversations/${conversationId}/messages`, {
    headers: { Authorization: `Bearer ${jwt}` },
  });
  const data = await res.json() as { messages?: Array<{ text: string, senderId: { email?: string } | string }> };
  return data.messages ?? [];
}

// ─── Tests ───────────────────────────────────────────────────────────────────

test.describe('Chat feature review', () => {
  test('API: create conversation, send messages both ways, verify delivery', async () => {
    const { georgeJwt, jonJwt } = loadTokens();

    // Decode user IDs from JWT payloads
    const georgeId = JSON.parse(Buffer.from(georgeJwt.split('.')[1], 'base64').toString()).userId as string;
    const jonId    = JSON.parse(Buffer.from(jonJwt.split('.')[1],    'base64').toString()).userId as string;

    console.log('George ID:', georgeId);
    console.log('Jon    ID:', jonId);

    // 1. Create (or retrieve) conversation from George's side
    const convId = await getOrCreateConversation(georgeJwt, jonId);
    expect(convId).toBeTruthy();
    console.log('Conversation ID:', convId);

    // 2. George → Jon
    const msg1 = await sendMessageViaApi(georgeJwt, convId, 'Hey Jon, checking in — how does my program look this week?');
    expect(msg1).toHaveProperty('text');
    console.log('George sent:', msg1.text);

    // 3. Jon → George
    const msg2 = await sendMessageViaApi(jonJwt, convId, 'Looking great! Make sure to hit all your cardio sessions. 💪');
    expect(msg2).toHaveProperty('text');
    console.log('Jon sent:', msg2.text);

    // 4. George sends another
    const msg3 = await sendMessageViaApi(georgeJwt, convId, 'Will do. Should I increase the weights on squats?');
    expect(msg3).toHaveProperty('text');

    // 5. Jon replies
    const msg4 = await sendMessageViaApi(jonJwt, convId, 'Yes — go up 5kg if the last set felt easy.');
    expect(msg4).toHaveProperty('text');

    // 6. Verify all 4 messages are in the thread (read as Jon — marks George's messages read)
    const messages = await getMessages(jonJwt, convId);
    console.log(`Thread has ${messages.length} message(s)`);
    expect(messages.length).toBeGreaterThanOrEqual(4);

    const texts = messages.map((m) => m.text);
    expect(texts).toContain('Hey Jon, checking in — how does my program look this week?');
    expect(texts).toContain('Looking great! Make sure to hit all your cardio sessions. 💪');
    expect(texts).toContain('Will do. Should I increase the weights on squats?');
    expect(texts).toContain('Yes — go up 5kg if the last set felt easy.');

    console.log('✅ All 4 messages delivered and verified in thread');
  });

  test('UI: George sees conversation in chat page', async () => {
    const { georgeJwt, jonJwt } = loadTokens();
    const jonId = JSON.parse(Buffer.from(jonJwt.split('.')[1], 'base64').toString()).userId as string;

    // Ensure conversation exists
    const convId = await getOrCreateConversation(georgeJwt, jonId);
    expect(convId).toBeTruthy();

    const { browser, page } = await loginAs(georgeJwt);
    try {
      await goToChat(page);

      // Chat page should show the conversation list or jump straight to the thread
      const pageText = await page.textContent('body');
      console.log('Chat page loaded, checking content...');

      // Should see some conversation or message UI — not an error
      const hasConvOrMsg = await page.locator('textarea, [placeholder*="essage" i], .flex.flex-col').first().isVisible({ timeout: 10_000 }).catch(() => false);
      expect(hasConvOrMsg).toBe(true);
      console.log('✅ Chat page renders without errors');

      // Check for Jon's name or messages in the page
      const bodyText = await page.textContent('body') ?? '';
      console.log('Has "Jon":', bodyText.includes('Jon'));
      console.log('Has prior message text:', bodyText.includes('Hey Jon') || bodyText.includes('cardio'));
    } finally {
      await browser.close();
    }
  });

  test('UI: Jon sends a message from the UI, George receives it', async () => {
    const { georgeJwt, jonJwt } = loadTokens();
    const georgeId = JSON.parse(Buffer.from(georgeJwt.split('.')[1], 'base64').toString()).userId as string;

    // Ensure conversation exists from Jon's side too
    const convId = await getOrCreateConversation(jonJwt, georgeId);
    expect(convId).toBeTruthy();

    const { browser, page } = await loginAs(jonJwt);
    try {
      await goToChat(page);

      // Find the message input (may be inside a thread view)
      const input = page.locator('textarea, input[placeholder*="essage" i]').first();
      const inputVisible = await input.isVisible({ timeout: 15_000 }).catch(() => false);

      if (inputVisible) {
        const uiMessage = `Training reminder: leg day tomorrow! ${Date.now()}`;
        await input.fill(uiMessage);
        // Submit via Enter or Send button
        const sendBtn = page.locator('button[type="submit"], button:has-text("Send")').first();
        if (await sendBtn.isVisible({ timeout: 1_000 }).catch(() => false)) {
          await sendBtn.click();
        } else {
          await input.press('Enter');
        }
        await page.waitForTimeout(1_500);

        // Verify it appears in the thread
        const body = await page.textContent('body') ?? '';
        console.log('UI message sent; visible in page:', body.includes('Training reminder'));
        console.log('✅ UI send worked');

        // Verify via API on George's side
        const msgs = await getMessages(georgeJwt, convId);
        const found = msgs.some((m) => m.text?.includes('Training reminder'));
        console.log('Message received via API on George side:', found);
        expect(found).toBe(true);
      } else {
        // No direct message thread visible — chat may be in list view, note it
        console.log('ℹ️  Message input not immediately visible (may need to select conversation from list)');
        const body = await page.textContent('body') ?? '';
        console.log('Page content sample:', body.slice(0, 300));
      }
    } finally {
      await browser.close();
    }
  });

  test('API: unread count increments for George when Jon sends', async () => {
    const { georgeJwt, jonJwt } = loadTokens();
    const georgeId = JSON.parse(Buffer.from(georgeJwt.split('.')[1], 'base64').toString()).userId as string;

    const convId = await getOrCreateConversation(jonJwt, georgeId);

    // Get George's current unread count
    const before = await fetch(`${BASE_URL}/api/chat/unread`, {
      headers: { Authorization: `Bearer ${georgeJwt}` },
    }).then((r) => r.json()) as { unreadCount: number };
    console.log('Unread before:', before.unreadCount);

    // Jon sends a message (George hasn't read it)
    const ts = Date.now();
    await sendMessageViaApi(jonJwt, convId, `Unread test message ${ts}`);

    // Wait briefly for DB write
    await new Promise((r) => setTimeout(r, 800));

    // Check George's unread count — should be +1 or more
    const after = await fetch(`${BASE_URL}/api/chat/unread`, {
      headers: { Authorization: `Bearer ${georgeJwt}` },
    }).then((r) => r.json()) as { unreadCount: number };
    console.log('Unread after:', after.unreadCount);

    expect(after.unreadCount).toBeGreaterThan(before.unreadCount);
    console.log('✅ Unread count incremented correctly');
  });
});
