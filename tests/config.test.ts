import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveMode } from '../lib/config';
test('production fails closed without complete configuration; demo requires explicit opt in', () => {
  assert.equal(resolveMode({ NODE_ENV:'production' }), 'unconfigured');
  assert.equal(resolveMode({ NODE_ENV:'production', DEMO_MODE:'true' }), 'demo');
  assert.equal(resolveMode({ NODE_ENV:'development' }), 'demo');
  assert.equal(resolveMode({ NODE_ENV:'development', NEXT_PUBLIC_SUPABASE_URL:'https://office.supabase.co' }), 'unconfigured');
  assert.equal(resolveMode({ NODE_ENV:'production', NEXT_PUBLIC_SUPABASE_URL:'https://office.supabase.co', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_sample' }), 'live');
  assert.equal(resolveMode({ NODE_ENV:'production', DEMO_MODE:'true', NEXT_PUBLIC_SUPABASE_URL:'https://office.supabase.co', NEXT_PUBLIC_SUPABASE_ANON_KEY:'sample' }), 'live');
});
