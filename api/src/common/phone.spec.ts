import { normalizePhone, formatPhone, maskPhone } from './phone';

describe('normalizePhone', () => {
  // The whole point: every way a learner might type ONE number collapses to a
  // single key, so they don't end up with several empty accounts.
  it('accepts every common way of writing the same number', () => {
    const expected = '+998901234567';
    for (const input of [
      '901234567',
      '+998901234567',
      '998901234567',
      '998 90 123 45 67',
      '+998 (90) 123-45-67',
      '8901234567',
      '8998901234567',
    ]) {
      expect(normalizePhone(input)).toBe(expected);
    }
  });

  it('rejects numbers that are not Uzbek mobiles', () => {
    for (const bad of [
      '',
      '12345',
      '+7 900 123 45 67', // Russian number
      '001234567', // operator code cannot start with 0
      '101234567', // ...or 1
      '9012345678', // too long
    ]) {
      expect(() => normalizePhone(bad)).toThrow();
    }
  });
});

describe('formatPhone', () => {
  it('groups the number for display', () => {
    expect(formatPhone('+998901234567')).toBe('+998 90 123 45 67');
  });

  it('passes anything unrecognised straight through', () => {
    expect(formatPhone('nonsense')).toBe('nonsense');
  });
});

describe('maskPhone', () => {
  it('hides the middle digits', () => {
    expect(maskPhone('+998901234567')).toBe('+998901****67');
  });
});
