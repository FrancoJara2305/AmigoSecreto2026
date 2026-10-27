import test from 'node:test';
import type { Participant, Gift, EventSettings } from '../../src/domain/database.types.ts';
import type { listParticipants, listGifts, getEventSettings } from '../../src/services/public-data.ts';

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
type Assert<T extends true> = T;
// Checked by tsc. Imports are type-only: never create a client or request data in this test.
type ParticipantsTyped = Assert<Equal<Awaited<ReturnType<typeof listParticipants>>['data'], Participant[]>>;
type GiftsTyped = Assert<Equal<Awaited<ReturnType<typeof listGifts>>['data'], Gift[]>>;
type SettingsTyped = Assert<Equal<Awaited<ReturnType<typeof getEventSettings>>['data'], EventSettings>>;

test('public query contracts retain their row types', () => {
  const proof: [ParticipantsTyped, GiftsTyped, SettingsTyped] = [true, true, true];
  if (proof.some((value) => !value)) throw new Error('Unexpected type contract');
});
