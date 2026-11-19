import JSZip from 'jszip';

/** Build a minimal .docx where each paragraph is a list of runs (to simulate Word splitting text). */
export async function makeDocx(paragraphs: string[][], header?: string[][]): Promise<Uint8Array> {
  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const para = (runs: string[]) =>
    `<w:p>${runs.map((t) => `<w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">${esc(t)}</w:t></w:r>`).join('')}</w:p>`;
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>');
  zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="${W}"><w:body>${paragraphs.map(para).join('')}</w:body></w:document>`);
  if (header) zip.file('word/header1.xml', `<?xml version="1.0" encoding="UTF-8"?><w:hdr xmlns:w="${W}">${header.map(para).join('')}</w:hdr>`);
  zip.file('docProps/core.xml', '<?xml version="1.0"?><cp:coreProperties xmlns:cp="x" xmlns:dc="y"><dc:creator>Nguyễn Văn Mẫu</dc:creator><cp:lastModifiedBy>Trần Thị Mẫu</cp:lastModifiedBy></cp:coreProperties>');
  return zip.generateAsync({ type: 'uint8array' });
}
