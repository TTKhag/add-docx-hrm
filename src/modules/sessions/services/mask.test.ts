import { maskCandidateText, maskContext } from './mask';

describe('maskContext', () => {
  it('replaces the candidate and other personal values', () => {
    const ctx = 'Ông Nguyễn Văn Mẫu, CCCD 012345678901, ĐT 0912345678, lương [[8.000.000 đồng]] từ 01/12/2026, email a.b@mau.vn';
    const out = maskContext(ctx, 'money');
    expect(out).toContain('⟦[số tiền]⟧');
    expect(out).toContain('[số giấy tờ]');
    expect(out).toContain('[số điện thoại]');
    expect(out).toContain('[ngày]');
    expect(out).toContain('[email]');
    expect(out).toContain('Ông [tên người]');
    expect(out).not.toMatch(/Nguyễn|012345678901|0912345678|8\.000\.000|a\.b@/);
  });
  it('keeps blanks literally (they hold no data)', () => {
    expect(maskCandidateText('…………', 'dotted_blank')).toBe('…………');
    expect(maskCandidateText('01/12/2026', 'date')).toBe('[ngày]');
  });
});
