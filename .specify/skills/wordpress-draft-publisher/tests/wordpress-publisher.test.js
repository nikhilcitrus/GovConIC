'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildWordPressPayload, buildHttpCallConfig, publishDraft } = require('../scripts/wordpress-publisher');

const article = {
  headline: 'A Real Headline',
  slug: 'a-real-headline',
  subtitle: 'A proper standalone subtitle text goes here for the test article body content today.',
  dek: 'A short deck.'
};
const config = { baseUrl: 'https://staging.example.com', categoryId: 52 };

test('builds a payload that is always status: draft', () => {
  const payload = buildWordPressPayload({ article, html: '<p>content</p>', config });
  assert.equal(payload.status, 'draft');
});

test('payload uses the configured category, never a hardcoded one', () => {
  const payload = buildWordPressPayload({ article, html: '<p>content</p>', config: { categoryId: 99 } });
  assert.deepEqual(payload.categories, [99]);
});

test('payload writes subtitle into td_post_theme_settings.td_subtitle, preferring subtitle over dek', () => {
  const payload = buildWordPressPayload({ article, html: '<p>content</p>', config });
  assert.equal(payload.meta.td_post_theme_settings.td_subtitle, article.subtitle);
});

test('falls back to dek only when subtitle is genuinely absent', () => {
  const payload = buildWordPressPayload({ article: { ...article, subtitle: '' }, html: '<p>x</p>', config });
  assert.equal(payload.meta.td_post_theme_settings.td_subtitle, article.dek);
});

test('throws when required fields are missing', () => {
  assert.throws(() => buildWordPressPayload({ article: {}, html: 'x', config }));
  assert.throws(() => buildWordPressPayload({ article, html: '', config }));
  assert.throws(() => buildWordPressPayload({ article, html: 'x', config: {} }));
});

test('buildHttpCallConfig never embeds a credential value, only a reference', () => {
  const callConfig = buildHttpCallConfig(config, 'wordpressBasicAuthCredential');
  assert.equal(callConfig.credentialRef, 'wordpressBasicAuthCredential');
  assert.equal(callConfig.url, 'https://staging.example.com/wp-json/wp/v2/posts');
  assert.ok(!JSON.stringify(callConfig).match(/password|secret/i));
});

test('publishDraft in dry-run mode never calls the transport and returns the would-be payload', async () => {
  let called = false;
  const result = await publishDraft({
    article,
    html: '<p>content</p>',
    config,
    dryRun: true,
    credentialRef: 'ref',
    transport: async () => {
      called = true;
      return { id: 1 };
    }
  });
  assert.equal(called, false);
  assert.equal(result.dryRun, true);
  assert.equal(result.wouldPublish.status, 'draft');
});

test('publishDraft on success returns a normalized PublicationRecord', async () => {
  const result = await publishDraft({
    article,
    html: '<p>content</p>',
    config,
    dryRun: false,
    credentialRef: 'ref',
    sourceUrl: 'https://source.example.com/a',
    groupId: 'group-1',
    transport: async () => ({ id: 4821, status: 'draft', date_gmt: '2026-07-28T00:00:00' })
  });
  assert.equal(result.postId, 4821);
  assert.equal(result.status, 'draft');
  assert.equal(result.categoryId, 52);
  assert.equal(result.sourceUrl, 'https://source.example.com/a');
  assert.equal(result.groupId, 'group-1');
});

test('publishDraft throws on a malformed WordPress response', async () => {
  await assert.rejects(() =>
    publishDraft({ article, html: '<p>x</p>', config, dryRun: false, credentialRef: 'ref', transport: async () => ({}) })
  );
});
