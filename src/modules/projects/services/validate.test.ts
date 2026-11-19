import { MST_RE, normalizeProjectUrl, validateProjectInput } from './validate';

const base = { name: 'Công ty Mẫu A', url: 'https://hrm-mau-a.example.vn/dang-nhap?x=1', mst: '0101234567', username: 'cauhinh.mau', hrmVersion: '2.5.39', note: '' };

describe('project validation', () => {
  it('accepts valid input and keeps only the origin', () => {
    const r = validateProjectInput(base);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.url).toBe('https://hrm-mau-a.example.vn');
  });
  it('MST: 10 digits or 10-3', () => {
    expect(MST_RE.test('0101234567')).toBe(true);
    expect(MST_RE.test('0101234567-001')).toBe(true);
    expect(MST_RE.test('01012345')).toBe(false);
    expect(MST_RE.test('0101234567001')).toBe(false);
  });
  it('rejects http and bad MST with Vietnamese messages', () => {
    const r = validateProjectInput({ ...base, url: 'http://hrm.example.vn', mst: '123' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.url).toMatch(/https/);
      expect(r.errors.mst).toMatch(/10 chữ số/);
    }
  });
  it('MST is optional', () => {
    expect(validateProjectInput({ ...base, mst: '' }).ok).toBe(true);
  });
  it('normalizeProjectUrl rejects garbage', () => {
    expect(normalizeProjectUrl('abc')).toBeNull();
  });
});
