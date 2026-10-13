import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('nutrition quickAdd query parameter parity (NP-149)', () => {
  it('reads quickAdd=true from searchParams in webapp nutrition page to open quick-add sheet', () => {
    const pagePath = path.resolve(__dirname, '../../app/dashboard/nutrition/page.tsx');
    const content = fs.readFileSync(pagePath, 'utf8');

    // Asserts that quickAdd query param is read from searchParams
    assert.ok(
      content.includes("searchParams?.get('quickAdd') === 'true'"),
      'Expected nutrition page to check quickAdd parameter on searchParams',
    );

    // Asserts quickAddOpen state is initialized or synced from quickAdd=true
    assert.ok(
      content.includes("const [quickAddOpen, setQuickAddOpen] = useState(() => searchParams?.get('quickAdd') === 'true')"),
      'Expected quickAddOpen to initialize from searchParams quickAdd=true',
    );
  });
});
