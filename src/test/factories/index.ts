// A factory per table (build plan 6.2). Each inserts a valid row into the
// test database and returns it. Overrides replace any column; a missing parent
// row is created, so `await playlistRevision()` also makes a guest and a draft.

import { randomBytes, randomUUID } from "node:crypto";
import type { Row } from "postgres";
import { sql } from "../db";

type Overrides = Record<string, unknown>;

let n = 0;
const unique = () => `${++n}-${randomUUID().slice(0, 8)}`;
const videoId = () => randomBytes(8).toString("base64url").slice(0, 11);

async function insert(table: string, row: Overrides): Promise<Row> {
  const [inserted] =
    await sql`insert into ${sql(table)} ${sql(row as Record<string, never>)} returning *`;
  return inserted;
}

// 5.1 Catalog

export const publisher = (o: Overrides = {}) => {
  const id = unique();
  return insert("publisher", {
    name: `Publisher ${id}`,
    channel_id: `UC${id}`,
    channel_url: `https://www.youtube.com/channel/UC${id}`,
    ...o,
  });
};

export const series = async (o: Overrides = {}) =>
  insert("series", {
    publisher_id: o.publisher_id ?? (await publisher()).id,
    name: `Series ${unique()}`,
    uploads_playlist_id: `UU${unique()}`,
    title_rule: "{artist}: Live Session",
    launch_depth: "full",
    convention: "artist first",
    ...o,
  });

export const artist = (o: Overrides = {}) =>
  insert("artist", { name: `Artist ${unique()}`, ...o });

export const artistAlias = async (o: Overrides = {}) =>
  insert("artist_alias", {
    artist_id: o.artist_id ?? (await artist()).id,
    alias: `Alias ${unique()}`,
    ...o,
  });

export const artistProfile = async (o: Overrides = {}) =>
  insert("artist_profile", {
    artist_id: o.artist_id ?? (await artist()).id,
    energy: 3,
    source: "editor",
    ...o,
  });

export const performance = async (o: Overrides = {}) =>
  insert("performance", {
    video_id: videoId(),
    series_id: o.series_id ?? (await series()).id,
    ...o,
  });

export const performanceArtist = async (o: Overrides = {}) =>
  insert("performance_artist", {
    performance_id: o.performance_id ?? (await performance()).id,
    artist_id: o.artist_id ?? (await artist()).id,
    billing_order: 1,
    ...o,
  });

export const performanceYtCache = async (o: Overrides = {}) =>
  insert("performance_yt_cache", {
    performance_id: o.performance_id ?? (await performance()).id,
    title: `Live Session ${unique()}`,
    duration_s: 1200,
    published_at: new Date("2026-01-01T00:00:00Z"),
    available: true,
    ...o,
  });

export const performanceTag = async (o: Overrides = {}) =>
  insert("performance_tag", {
    performance_id: o.performance_id ?? (await performance()).id,
    kind: "mood",
    value: "warm",
    source: "editor",
    ...o,
  });

// 5.4 Accounts, billing and events

// app_user.id references auth.users, so the auth row comes first.
export const appUser = async (o: Overrides = {}) => {
  const id = o.id ?? randomUUID();
  const email = o.email ?? `${unique()}@example.test`;
  await sql`insert into auth.users (id, email, aud, role)
            values (${id as string}, ${email as string}, 'authenticated', 'authenticated')`;
  return insert("app_user", { ...o, id, email });
};

export const guest = (o: Overrides = {}) =>
  insert("guest", {
    token_hash: randomBytes(32),
    cohort: "pass_first",
    ...o,
  });

export const entitlement = async (o: Overrides = {}) =>
  insert("entitlement", {
    user_id: o.user_id ?? (await appUser()).id,
    kind: "subscription",
    status: "active",
    ...o,
  });

export const appFlag = (o: Overrides = {}) =>
  insert("app_flag", { key: `flag-${unique()}`, value: "on", ...o });

export const event = (o: Overrides = {}) =>
  insert("event", { name: "test_event", ...o });

// 5.2 Playlists

// Owned by a new guest unless an owner is given.
export const playlistDraft = async (o: Overrides = {}) =>
  insert("playlist_draft", {
    ...(o.owner_user_id || o.owner_guest_id
      ? {}
      : { owner_guest_id: (await guest()).id }),
    creation_method: "prompt",
    ...o,
  });

export const curatorRun = async (o: Overrides = {}) =>
  insert("curator_run", {
    draft_id: o.draft_id ?? (await playlistDraft()).id,
    kind: "generate",
    ...o,
  });

// Numbered after the draft's latest revision unless a number is given.
export const playlistRevision = async (o: Overrides = {}) => {
  const draftId = (o.draft_id ?? (await playlistDraft()).id) as string;
  const [{ next }] = await sql`
    select coalesce(max(number), 0) + 1 as next
    from playlist_revision where draft_id = ${draftId}`;
  return insert("playlist_revision", {
    number: next,
    trigger: "generate",
    ...o,
    draft_id: draftId,
  });
};

// Points at a new revision unless draft_id and revision are both given.
export const shareLink = async (o: Overrides = {}) => {
  const target =
    o.draft_id && o.revision
      ? {}
      : await playlistRevision(o.draft_id ? { draft_id: o.draft_id } : {});
  return insert("share_link", {
    code: unique(),
    draft_id: target.draft_id,
    revision: target.number,
    ...o,
  });
};

export const handoffEvent = async (o: Overrides = {}) =>
  insert("handoff_event", {
    draft_id: o.draft_id ?? (await playlistDraft()).id,
    revision: 1,
    type: "open",
    ...o,
  });
