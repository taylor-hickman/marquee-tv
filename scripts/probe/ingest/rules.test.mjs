import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classify } from './rules.mjs';

const LONG = 20 * 60;

test('concert titles become performances with the artist parsed', () => {
  for (const [title, artist] of [
    ['Jungle: Tiny Desk Concert', 'Jungle'],
    ['Mac Miller: NPR Music Tiny Desk Concert', 'Mac Miller'],
    ['Anderson .Paak & The Free Nationals: NPR Music Tiny Desk Concert', 'Anderson .Paak & The Free Nationals'],
    ['Lizzo: Tiny Desk (Home) Concert', 'Lizzo'],
    ['Tems: Tiny Desk Home Concert', 'Tems'],
  ]) {
    const r = classify(title, LONG);
    assert.equal(r.kind, 'performance', title);
    assert.deepEqual(r.artists, [artist], title);
    assert.equal(r.reviewStatus, 'accepted', title);
  }
});

test('a short video with a concert title is a clip', () => {
  assert.equal(classify('Jungle: Tiny Desk Concert', 59).kind, 'clip');
});

test('trailers and interviews are kept out of the eligible set', () => {
  assert.equal(classify('Tiny Desk Concert trailer: coming soon', LONG).kind, 'trailer');
  assert.equal(classify('Behind the Tiny Desk with Bob Boilen', LONG).kind, 'interview');
});

test('a possible collaboration is flagged for review', () => {
  const r = classify('Artist A x Artist B: Tiny Desk Concert', LONG);
  assert.equal(r.kind, 'performance');
  assert.equal(r.reviewStatus, 'flagged');
});

test('a title that names the series but matches no rule is flagged with no kind', () => {
  const r = classify('The 10 best Tiny Desk moments', LONG);
  assert.equal(r.kind, null);
  assert.equal(r.reviewStatus, 'flagged');
});

test('other series and unrelated uploads are outside the series', () => {
  assert.equal(classify('Tiny Desk Contest 2026: the winner', LONG).inSeries, false);
  assert.equal(classify('Tiny Desk Korea: Artist', LONG).inSeries, false);
  assert.equal(classify('All Songs Considered: new music Friday', LONG).inSeries, false);
});
