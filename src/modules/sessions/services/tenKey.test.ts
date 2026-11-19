import { isValidTenKey, normalizeExistingKey, toTenKey, uniqueKey } from './tenKey';

describe('toTenKey', () => {
  it.each([
    ['Họ và tên', 'HoVaTen'],
    ['Số CCCD', 'SoCCCD'],
    ['Ngày hiệu lực', 'NgayHieuLuc'],
    ['Đơn vị công tác', 'DonViCongTac'],
    ['Phụ cấp ăn trưa (cũ)', 'PhuCapAnTruaCu'],
    ['Mức lương cơ bản', 'MucLuongCoBan'],
    ['2026 năm', 'Truong2026Nam'],
    ['', 'Truong'],
  ])('%s → %s', (label, key) => {
    expect(toTenKey(label)).toBe(key);
    expect(isValidTenKey(toTenKey(label))).toBe(true);
  });

  it('cuts to 50 characters', () => {
    expect(toTenKey('a '.repeat(80)).length).toBe(50);
  });
});

describe('isValidTenKey', () => {
  it.each(['HoVaTen', 'SoCCCD', 'A1'])('accepts %s', (k) => expect(isValidTenKey(k)).toBe(true));
  it.each(['hoVaTen', 'Ho_Va_Ten', 'Họ', 'H', 'Ho Ten', '1Ho', 'Ho-Ten'])('rejects %s', (k) => expect(isValidTenKey(k)).toBe(false));
});

describe('uniqueKey', () => {
  it('adds a group suffix first, then a number', () => {
    const taken = new Set(['NgayHieuLuc']);
    expect(uniqueKey('NgayHieuLuc', taken, 'Phụ lục')).toBe('NgayHieuLucPhuLuc');
    taken.add('NgayHieuLucPhuLuc');
    expect(uniqueKey('NgayHieuLuc', taken, 'Phụ lục')).toBe('NgayHieuLuc2');
  });
});

describe('normalizeExistingKey', () => {
  it('turns snake and Vietnamese keys into TenKey', () => {
    expect(normalizeExistingKey('ho_ten')).toBe('HoTen');
    expect(normalizeExistingKey('Họ và tên')).toBe('HoVaTen');
  });
});
