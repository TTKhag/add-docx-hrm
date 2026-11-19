import { makeDocx } from '@/test/makeDocx';
import { detectCandidates, detectInText } from './detect';
import { readDocx } from './docx';
import { detectContract, detectDecisionType, detectDocMeta, detectSigning, templateNameFromFile } from './docMeta';
import { suggestSkip } from './mapping';
import { maskParagraph, unmaskRange } from './mask';

// Sample data only (fake names / numbers).
describe('docMeta (BR-16)', () => {
  it('reads a decision: type, decision type, template name', async () => {
    const doc = await readDocx(await makeDocx([
      ['CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM'], ['Số: ……/QĐ-BV'], ['QUYẾT ĐỊNH'], ['Về bổ nhiệm lại ……………'], ['GIÁM ĐỐC BỆNH VIỆN MẪU'],
    ]));
    const m = detectDocMeta(doc, 'STT 05 - Quyết định bổ nhiệm lại_mau.docx');
    expect(m.docType).toBe('quyet_dinh');
    expect(m.decisionType).toBe('Quyết định bổ nhiệm lại');
    expect(m.templateName).toBe('Quyết định bổ nhiệm lại');
    expect(m.meta.confidence).toBe('cao');
  });

  it('reads a contract with term and classification', async () => {
    const doc = await readDocx(await makeDocx([
      ['HỢP ĐỒNG LAO ĐỘNG'], ['Loại hợp đồng: Hợp đồng lao động xác định thời hạn'], ['Thời hạn hợp đồng: 12 tháng'],
      ['NGƯỜI LAO ĐỘNG'], ['ĐẠI DIỆN NGƯỜI SỬ DỤNG LAO ĐỘNG'], ['GIÁM ĐỐC'],
    ]));
    const m = detectDocMeta(doc, 'HDLD 12 thang.docx');
    expect(m.docType).toBe('hop_dong');
    expect(m.meta.contractClass).toBe('xac_dinh');
    expect(m.meta.termMonths).toBe(12);
    const s = detectSigning(doc);
    expect(s?.employeeAnchor).toBe('NGƯỜI LAO ĐỘNG');
    expect(s?.companyAnchor).toBe('ĐẠI DIỆN NGƯỜI SỬ DỤNG LAO ĐỘNG');
    expect(s?.companyTitle).toBe('Giám đốc');
  });

  it('decision keywords, file names, indefinite contracts', () => {
    expect(detectDecisionType('Về việc điều động, kiêm nhiệm')).toBe('Quyết định điều động, kiêm nhiệm');
    expect(detectDecisionType('nâng bậc lương trước thời hạn')).toBe('Quyết định điều chỉnh lương');
    expect(detectDecisionType('nghỉ hưu để hưởng chế độ BHXH')).toBe('Quyết định nghỉ hưu');
    expect(templateNameFromFile('STT 10 - Quyết định nghỉ hưu_mau (1).docx')).toBe('Quyết định nghỉ hưu');
    expect(detectContract('Hợp đồng lao động không xác định thời hạn, thời hạn 12 tháng')).toEqual({ contractClass: 'khong_xac_dinh', termMonths: undefined });
  });
});

describe('detection v2', () => {
  it('"ngày … tháng … năm …" is ONE candidate (BR-11) and header number is found', () => {
    const hits = detectInText('Hà Nội, ngày ….. tháng ….. năm 20….');
    expect(hits).toHaveLength(1);
    expect(hits[0].hint).toBe('date_blank');
    expect(detectInText('Số: 123/QĐ-BV').map((h) => h.hint)).toEqual(['doc_number']);
  });

  it('legal bases are proposed as fixed (BR-13), per-case bases are not', () => {
    expect(suggestSkip('Căn cứ Nghị định số 115/2020/NĐ-CP ngày 25 tháng 9 năm 2020 của Chính phủ', 'date_words')).toBeTruthy();
    expect(suggestSkip('Căn cứ đơn đề nghị của ông/bà ngày 01/02/2025', 'date')).toBeUndefined();
    expect(suggestSkip('Ông/Bà sinh ngày 01/02/1990', 'date')).toBeUndefined();
  });

  it('pre-keyed mode only keeps existing keys', async () => {
    const doc = await readDocx(await makeDocx([['Ông/Bà: ', '{{HoVaTen}}', ' sinh ngày ……']]));
    expect(detectCandidates(doc, { onlyExistingKeys: true }).map((c) => c.text)).toEqual(['{{HoVaTen}}']);
  });
});

describe('maskParagraph / unmaskRange', () => {
  it('hides personal values and maps masked ranges back to the original', () => {
    const text = 'Ông Nguyễn Văn Mẫu, CCCD 012345678901, giữ chức Phó Trưởng khoa trong 05 năm.';
    const mp = maskParagraph(text, []);
    expect(mp.masked).not.toContain('Nguyễn Văn Mẫu');
    expect(mp.masked).not.toContain('012345678901');
    const i = mp.masked.indexOf('Phó Trưởng khoa');
    expect(text.slice(...Object.values(unmaskRange(mp, i, i + 'Phó Trưởng khoa'.length)!) as [number, number])).toBe('Phó Trưởng khoa');
    const j = mp.masked.indexOf('[tên người]');
    const r = unmaskRange(mp, j, j + 3)!; // touching a masked value selects the whole value
    expect(text.slice(r.start, r.end)).toBe('Nguyễn Văn Mẫu');
  });

  it('refuses ranges that overlap an existing candidate', () => {
    const text = 'Bổ nhiệm lại chức vụ ………… đối với ông/bà';
    const s = text.indexOf('…');
    const mp = maskParagraph(text, [{ start: s, end: s + 12, id: 'c6', hint: 'dotted_blank', text: text.slice(s, s + 12) }]);
    expect(mp.masked).toContain('⟦c6:');
    const k = mp.masked.indexOf('⟦c6');
    expect(unmaskRange(mp, k, k + 4)).toBeUndefined();
  });
});
