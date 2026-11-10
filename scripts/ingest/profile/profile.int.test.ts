import { sql } from "@/test/db";
import { expect, test, vi } from "vitest";
import * as factories from "@/test/factories";
import { profile } from "@/modules/catalog/profile";
import { createFakeAdapter } from "@/modules/curator/llm";
import type { FakeScript } from "@/modules/curator/llm/fake";

vi.mock("server-only", () => ({}));

// B1's fake adapter: replies are serialized and parsed against the profile
// schema, with the one retry, exactly as a real reply would be.
type Reply = NonNullable<FakeScript["compose"]>;
const model = (script: Reply = () => ({ error: "provider" })) =>
  createFakeAdapter({ compose: script }).compose;

const answer = (o: Record<string, unknown> = {}) => ({
  output: {
    genres: ["indie folk"],
    scenes: ["portland"],
    era: "2010s",
    energy: 2,
    similar_artists: [],
    ...o,
  },
});

const profileOf = async (artistId: number) =>
  (
    await sql`
      select genres, scenes, era, energy, similar_artist_ids, source
      from artist_profile where artist_id = ${artistId}`
  )[0];

test("a new artist gets a model profile, with similar names resolved through names and aliases", async () => {
  const series = await factories.series({ name: "Fixture Sessions" });
  const artist = await factories.artist({ name: "Wren Fixture" });
  const p = await factories.performance({ series_id: series.id });
  await factories.performanceArtist({
    performance_id: p.id,
    artist_id: artist.id,
  });
  const byName = await factories.artist({ name: "Ölafur Fixture" });
  const byAlias = await factories.artist({ name: "The Fixture Collective" });
  await factories.artistAlias({ artist_id: byAlias.id, alias: "TFC" });
  const users: string[] = [];

  const tally = await profile(
    model(({ user }) => {
      users.push(user);
      return JSON.parse(user).artist === "Wren Fixture"
        ? answer({
            genres: ["indie folk", "chamber pop"],
            similar_artists: ["olafur fixture", "TFC", "Wren Fixture"],
          })
        : answer();
    }),
  );

  expect(await profileOf(artist.id)).toEqual({
    genres: ["indie folk", "chamber pop"],
    scenes: ["portland"],
    era: "2010s",
    energy: 2,
    similar_artist_ids: [byName.id, byAlias.id],
    source: "model",
  });
  expect(tally).toEqual(
    expect.objectContaining({ profiled: 3, failed: 0, resolved: 2 }),
  );
  expect(JSON.parse(users.find((u) => u.includes("Wren Fixture"))!)).toEqual({
    artist: "Wren Fixture",
    series: ["Fixture Sessions"],
  });
});

test("a similar-artist name that does not resolve is dropped", async () => {
  const artist = await factories.artist({ name: "Lone Fixture" });

  const tally = await profile(
    model(() => answer({ similar_artists: ["Nobody In The Catalog"] })),
  );

  expect((await profileOf(artist.id)).similar_artist_ids).toEqual([]);
  expect(tally).toEqual(
    expect.objectContaining({ profiled: 1, named: 1, resolved: 0 }),
  );
});

test("an editor row is left alone and its artist isn't asked about", async () => {
  const artist = await factories.artist({ name: "Edited Fixture" });
  await factories.artistProfile({
    artist_id: artist.id,
    genres: ["jazz"],
    energy: 4,
    source: "editor",
  });
  const asked: string[] = [];

  await profile(
    model(({ user }) => {
      asked.push(JSON.parse(user).artist);
      return answer();
    }),
  );

  expect(asked).not.toContain("Edited Fixture");
  expect(await profileOf(artist.id)).toEqual(
    expect.objectContaining({ genres: ["jazz"], energy: 4, source: "editor" }),
  );
});

test("a rejected artist isn't profiled", async () => {
  const artist = await factories.artist({
    name: "Rejected Fixture",
    review_status: "rejected",
  });

  await profile(model(() => answer()));

  expect(await profileOf(artist.id)).toBeUndefined();
});

test("when the model can't be reached the artist stays without a profile, and the next run profiles it", async () => {
  const artist = await factories.artist({ name: "Late Fixture" });

  expect(await profile(model())).toEqual(
    expect.objectContaining({ profiled: 0, failed: 1 }),
  );
  expect(await profileOf(artist.id)).toBeUndefined();

  await profile(model(() => answer()));
  expect(await profileOf(artist.id)).toEqual(
    expect.objectContaining({ source: "model" }),
  );
});

test("the fixture's artists all have profiles after one run", async () => {
  await sql`delete from artist_profile`;

  const tally = await profile(model(() => answer()));

  expect(tally.failed).toBe(0);
  expect(
    await sql`
      select a.name from artist a
      left join artist_profile ap on ap.artist_id = a.id
      where ap.artist_id is null and a.review_status <> 'rejected'`,
  ).toEqual([]);
});
