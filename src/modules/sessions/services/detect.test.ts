import { detectInText, contextOf } from './detect';

const pick = (t: string) => detectInText(t).map((h) => [t.slice(h.start, h.end), h.hint]);

describe('detectInText', () => {
  it('finds blanks, dates, money, ids and existing keys', () => {
    expect(pick('Họ tên: ………… sinh ngày ……/……/…… CCCD 012345678901')).toEqual([
      ['…………', 'dotted_blank'],
      ['……/……/……', 'dotted_blank'],
      ['012345678901', 'id_number'],
    ]);
    expect(pick('Mức lương: 8.000.000 đồng, từ 01/12/2026')).toEqual([
      ['8.000.000 đồng', 'money'],
      ['01/12/2026', 'date'],
    ]);
    expect(pick('Hà Nội, ngày 19 tháng 11 năm 2026')).toEqual([['ngày 19 tháng 11 năm 2026', 'date_words']]);
    expect(pick('Ông {{HoVaTen}} và ____')).toEqual([
      ['{{HoVaTen}}', 'existing_key'],
      ['____', 'underscore_blank'],
    ]);
  });
  it('dotted runs with spaces count as one blank and trailing spaces are trimmed', () => {
    expect(pick('Địa chỉ: . . . . . . het')).toEqual([['. . . . . .', 'dotted_blank']]);
  });
  it('ignores normal punctuation', () => {
    expect(pick('Điều 1. Các bên thống nhất.')).toEqual([]);
  });
  it('context marks the candidate', () => {
    expect(contextOf('Ông/Bà: …… sinh', 8, 10)).toBe('Ông/Bà: [[……]] sinh');
  });
});

describe('ellipsis characters', () => {
  it('two "…" are a blank', () => {
    expect(pick('Địa điểm làm việc: ……')).toEqual([['……', 'dotted_blank']]);
  });
});

describe('person names after cues', () => {
  it('detects filled-in sample names', () => {
    expect(pick('Ông/Bà: Nguyễn Văn Mẫu')).toEqual([['Nguyễn Văn Mẫu', 'person_name']]);
    expect(pick('Đại diện: Ông Trần Văn Mẫu – Chức vụ: Giám đốc')).toEqual([['Trần Văn Mẫu', 'person_name']]);
    expect(pick('Ông/Bà: …………')).toEqual([['…………', 'dotted_blank']]);
    expect(pick('Bên A đồng ý')).toEqual([]);
  });
});
