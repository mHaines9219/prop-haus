import { afterEach, describe, expect, it, vi } from 'vitest';
import { profileGaps } from '../project-profile';
import {
  MockIntakeExtractor,
  OpenRouterIntakeExtractor,
  composeReply,
  heuristicPatch,
  intakeProvider,
  shortAnswerPatch,
} from './extract';

const BROOKLYN =
  'I’m producing a 10-day indie film in Brooklyn. We’re renting furniture and props from several vendors. We have 15 crew members, two locations, one child actor, a stunt scene, and a rented box truck.';

describe('heuristicPatch', () => {
  it('reads the Brooklyn indie into the profile', () => {
    expect(heuristicPatch(BROOKLYN)).toEqual({
      productionType: 'film',
      schedule: { shootDays: 10 },
      locations: { city: 'Brooklyn', region: 'NY', count: 2 },
      crew: { count: 15 },
      cast: { count: 1, minors: true },
      rentals: { props: true, furniture: true, vendorCount: 3 },
      vehicles: { rentedTrucks: true },
      risks: { stunts: true },
    });
  });

  it('reads a commercial with a client, a venue that needs a COI, and no minors', () => {
    const p = heuristicPatch(
      'Two-day commercial for Acme Cereal shooting 2026-10-01 to 2026-10-02 at a venue in Los Angeles. The venue requires a COI. No minors, no stunts. Load-in the night before.',
    );
    expect(p.productionType).toBe('commercial');
    expect(p.schedule).toEqual({ shootDays: 2, start: '2026-10-01', end: '2026-10-02' });
    expect(p.locations).toEqual({ city: 'Los Angeles', region: 'CA', kinds: ['venue'] });
    expect(p.venue).toEqual({ requiresCoi: true, installStrike: true });
    expect(p.cast).toEqual({ minors: false });
    expect(p.risks?.stunts).toBe(false);
    expect(p.client).toEqual({ billable: true, name: 'Acme Cereal' });
  });

  it('states nothing it was not told', () => {
    expect(heuristicPatch('hello')).toEqual({});
  });
});

describe('shortAnswerPatch', () => {
  it('routes yes/no and numbers to the question that was asked', () => {
    expect(shortAnswerPatch('Yes', ['cast.minors'])).toEqual({ cast: { minors: true } });
    expect(shortAnswerPatch('nope', ['venue.requiresCoi', 'crew.count'])).toEqual({ venue: { requiresCoi: false } });
    expect(shortAnswerPatch('15', ['crew.count'])).toEqual({ crew: { count: 15 } });
    expect(shortAnswerPatch('4 days', ['schedule'])).toEqual({ schedule: { shootDays: 4 } });
    expect(shortAnswerPatch('No', ['rentals'])).toEqual({ rentals: { props: false, furniture: false, equipment: false } });
    expect(shortAnswerPatch('None', ['risks']).risks?.stunts).toBe(false);
  });

  it('does nothing without a pending question or for a full sentence', () => {
    expect(shortAnswerPatch('yes', undefined)).toEqual({});
    expect(shortAnswerPatch('We have a dog in one scene', ['cast.minors'])).toEqual({});
  });
});

describe('MockIntakeExtractor', () => {
  it('extracts and asks the next open questions, skipping what the message answered', async () => {
    const out = await new MockIntakeExtractor().extract({
      projectName: 'Nocturne',
      profile: {},
      transcript: [],
      message: BROOKLYN,
      gaps: profileGaps({}),
    });
    expect(out.patch.productionType).toBe('film');
    expect(out.reply).toBeUndefined();
    expect(out.askedKeys).toEqual(['locations.publicProperty']);
    expect(out.askedKeys).not.toContain('productionType');
    expect(out.askedKeys).not.toContain('cast.minors');
  });
});

describe('composeReply', () => {
  it('reads back what it learned and asks the open questions', () => {
    const reply = composeReply({ productionType: 'film', schedule: { shootDays: 10 }, crew: { count: 15 } }, [
      { key: 'locations.publicProperty', question: 'Any shooting on public property?', priority: 8 },
      { key: 'vehicles.rentedTrucks', question: 'Any rented trucks?', priority: 10 },
    ]);
    expect(reply).toBe('Noted: Film, schedule 10 days, crew 15. A few things to pin down: 1) Any shooting on public property? 2) Any rented trucks?');
  });

  it('closes the loop when nothing is open', () => {
    expect(composeReply({}, [])).toBe('Understood. That covers what the checklist needs. It is below, and it updates as you tell me more.');
  });
});

describe('OpenRouterIntakeExtractor', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sends the profile and open questions, and sanitizes what comes back', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  patch: { productionType: 'film', crew: { count: '15' }, bogus: true, cast: { minors: 'maybe' } },
                  reply: 'Got it. Where is it shooting?',
                  asked: ['locations.city', 'not-a-gap'],
                }),
              },
            },
          ],
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const out = await new OpenRouterIntakeExtractor('key', 'test/model').extract({
      projectName: 'Nocturne',
      profile: { rentals: { props: true } },
      transcript: [{ role: 'user', content: 'earlier' }],
      message: 'A film with 15 crew',
      gaps: profileGaps({ rentals: { props: true } }),
    });
    expect(out.patch).toEqual({ productionType: 'film', crew: { count: 15 } });
    expect(out.reply).toBe('Got it. Where is it shooting?');
    expect(out.askedKeys).toEqual(['locations.city']);

    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.model).toBe('test/model');
    expect(body.response_format).toEqual({ type: 'json_object' });
    expect(body.messages.at(-1).content).toContain('OPEN QUESTIONS');
    expect(body.messages.at(-1).content).toContain('"rentals":{"props":true}');
    expect(body.messages[1]).toEqual({ role: 'user', content: 'earlier' });
  });

  it('throws on a non-OK response so the turn can fall back', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('rate limited', { status: 429 })));
    await expect(
      new OpenRouterIntakeExtractor('key').extract({ projectName: 'x', profile: {}, transcript: [], message: 'hi', gaps: [] }),
    ).rejects.toThrow('OpenRouter 429');
  });
});

describe('intakeProvider', () => {
  afterEach(() => {
    delete process.env.INTAKE_PROVIDER;
    delete process.env.OPENROUTER_API_KEY;
  });

  it('is mock without a key, openrouter with one, and honours an explicit choice', () => {
    expect(intakeProvider()).toBe('mock');
    process.env.OPENROUTER_API_KEY = 'k';
    expect(intakeProvider()).toBe('openrouter');
    process.env.INTAKE_PROVIDER = 'mock';
    expect(intakeProvider()).toBe('mock');
  });
});
