import { makeDocx } from '@/test/makeDocx';
import { applyReplacements, readDocx, verifyDocx } from './docx';
import { detectCandidates } from './detect';

async function blobBytes(b: Blob): Promise<Uint8Array> {
  return new Uint8Array(await b.arrayBuffer());
}

describe('docx read / apply / verify', () => {
  it('reads paragraphs across split runs, headers first', async () => {
    const data = await makeDocx([['Ông/Bà: ', '……', '……'], ['Sinh ngày: 01/02/1990']], [['CÔNG TY MẪU']]);
    const doc = await readDocx(data);
    expect(doc.parts).toEqual(['word/header1.xml', 'word/document.xml']);
    expect(doc.paragraphs.map((p) => p.text)).toEqual(['CÔNG TY MẪU', 'Ông/Bà: …………', 'Sinh ngày: 01/02/1990']);
  });

  it('writes each key into a single run even when the blank spans several runs', async () => {
    const data = await makeDocx([['Ông/Bà: ', '……', '……', ' – Mã NV: ', '[mã]']]);
    const doc = await readDocx(data);
    const cands = detectCandidates(doc);
    expect(cands.map((c) => [c.text, c.ruleHint])).toEqual([
      ['…………', 'dotted_blank'],
      ['[mã]', 'bracket'],
    ]);
    const { blob, applied } = await applyReplacements(data, [
      { location: cands[0].location, expected: cands[0].text, key: 'HoVaTen' },
      { location: cands[1].location, expected: cands[1].text, key: 'MaNhanVien' },
    ]);
    expect(applied).toBe(2);
    const out = await blobBytes(blob);
    const again = await readDocx(out);
    expect(again.paragraphs[0].text).toBe('Ông/Bà: {{HoVaTen}} – Mã NV: {{MaNhanVien}}');
    const v = await verifyDocx(out);
    expect(v.keys).toEqual(['HoVaTen', 'MaNhanVien']);
    expect(v.issues.filter((i) => i.level === 'loi')).toEqual([]);
    expect(v.issues.some((i) => i.code === 'author_left')).toBe(false); // author scrubbed
  });

  it('refuses to apply when the text at the location changed', async () => {
    const data = await makeDocx([['Ngày: 01/02/2026']]);
    const doc = await readDocx(data);
    const [c] = detectCandidates(doc);
    await expect(
      applyReplacements(data, [{ location: c.location, expected: '09/09/2026', key: 'NgayKy' }]),
    ).rejects.toThrow(/đã thay đổi/);
  });

  it('rejects invalid keys before writing', async () => {
    const data = await makeDocx([['Ngày: 01/02/2026']]);
    const doc = await readDocx(data);
    const [c] = detectCandidates(doc);
    await expect(applyReplacements(data, [{ location: c.location, expected: c.text, key: 'ngay_ky' }])).rejects.toThrow(/TenKey/);
  });

  it('verify flags split keys, invalid keys and leftover personal data', async () => {
    const data = await makeDocx([['{{Ho', 'VaTen}}'], ['{{ho_ten}}'], ['CCCD 012345678901, lương 8.000.000']]);
    const v = await verifyDocx(data);
    const codes = v.issues.map((i) => i.code);
    expect(codes).toContain('key_split');
    expect(codes).toContain('key_invalid');
    expect(codes.filter((c) => c === 'pii_left').length).toBeGreaterThanOrEqual(2);
    expect(codes).toContain('author_left');
  });

  it('rejects files that are not docx', async () => {
    await expect(readDocx(new Uint8Array([1, 2, 3]))).rejects.toThrow(/\.docx/);
  });
});
