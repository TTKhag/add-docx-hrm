import { z } from 'zod';
import type { Catalog, CatalogField, DocType } from '@/db/types';

export const HRM_VERSIONS = ['2.5.39'];

export const DOC_TYPE_LABEL: Record<DocType, string> = {
  hop_dong: 'Hợp đồng lao động',
  phu_luc: 'Phụ lục hợp đồng',
  thanh_ly: 'Thanh lý hợp đồng',
  quyet_dinh: 'Quyết định',
};

/** Decision types named in tri-thuc-easyhrm v2.5.39 (Thiết lập thông tin quyết định). */
export const DECISION_TYPES = [
  'Quyết định tiếp nhận, bổ nhiệm',
  'Quyết định bổ nhiệm lại',
  'Quyết định lương',
  'Quyết định điều chỉnh lương',
  'Quyết định điều chuyển',
  'Quyết định bổ nhiệm chức danh nghề nghiệp',
  'Quyết định điều động, kiêm nhiệm',
  'Quyết định cử đi học',
  'Quyết định cử đi công tác',
  'Quyết định thôi việc',
  'Quyết định nghỉ hưu',
  'Quyết định thử việc',
  'Quyết định giao nhiệm vụ',
];

export function catalogId(hrmVersion: string, docType: DocType, decisionType = ''): string {
  return `${hrmVersion}|${docType}|${docType === 'quyet_dinh' ? decisionType : ''}`;
}

const f = (code: string, label: string, group: string, kind: CatalogField['kind'] = 'text'): CatalogField => ({ code, label, group, kind });

// SAMPLE field names. Group names follow tri-thuc-easyhrm; individual labels are placeholders
// until synced from the real "Trường lấy giá trị" list (catalog.verified = false).
const EMPLOYEE: CatalogField[] = [
  f('nv.ma_nhan_vien', 'Mã nhân viên', 'Nhân viên'),
  f('nv.ho_va_ten', 'Họ và tên', 'Nhân viên'),
  f('nv.gioi_tinh', 'Giới tính', 'Nhân viên'),
  f('nv.ngay_sinh', 'Ngày sinh', 'Nhân viên', 'date'),
  f('nv.quoc_tich', 'Quốc tịch', 'Nhân viên'),
  f('nv.so_cccd', 'Số CCCD', 'Nhân viên'),
  f('nv.ngay_cap', 'Ngày cấp CCCD', 'Nhân viên', 'date'),
  f('nv.noi_cap', 'Nơi cấp CCCD', 'Nhân viên'),
  f('nv.thuong_tru', 'Địa chỉ thường trú', 'Nhân viên'),
  f('nv.cho_o', 'Chỗ ở hiện tại', 'Nhân viên'),
  f('nv.dien_thoai', 'Điện thoại', 'Nhân viên'),
  f('nv.email', 'Email', 'Nhân viên'),
  f('nv.chuc_danh', 'Chức danh', 'Nhân viên'),
  f('nv.phong_ban', 'Phòng ban', 'Nhân viên'),
  f('nv.ma_so_thue', 'Mã số thuế cá nhân', 'Nhân viên'),
  f('nv.so_tai_khoan', 'Số tài khoản', 'Nhân viên'),
];

const CONTRACT_EXTRA: CatalogField[] = [
  f('hd.so_hop_dong', 'Số hợp đồng', 'Hợp đồng'),
  f('hd.ngay_ky', 'Ngày ký', 'Hợp đồng', 'date'),
  f('hd.ngay_hieu_luc', 'Ngày hiệu lực', 'Hợp đồng', 'date'),
  f('hd.ngay_ket_thuc', 'Ngày kết thúc', 'Hợp đồng', 'date'),
  f('hd.loai_hop_dong', 'Loại hợp đồng', 'Hợp đồng'),
  f('dv.ten_don_vi', 'Tên đơn vị', 'Đơn vị'),
  f('dv.dia_chi', 'Địa chỉ đơn vị', 'Đơn vị'),
  f('dv.ma_so_thue', 'Mã số thuế đơn vị', 'Đơn vị'),
  f('dd.ho_va_ten', 'Họ và tên người đại diện', 'Người đại diện'),
  f('dd.chuc_vu', 'Chức vụ người đại diện', 'Người đại diện'),
  f('lg.luong_co_ban', 'Lương cơ bản', 'Lương', 'number'),
  f('lg.luong_bang_chu', 'Lương cơ bản bằng chữ', 'Lương'),
  f('pc.bao_hiem', 'Phụ cấp kê khai bảo hiểm', 'Phụ cấp kê khai bảo hiểm', 'number'),
];

const DECISION_COMMON: CatalogField[] = [
  f('qd.so_quyet_dinh', 'Số quyết định', 'Quyết định'),
  f('qd.ngay_quyet_dinh', 'Ngày quyết định', 'Quyết định', 'date'),
  f('qd.ngay_hieu_luc', 'Ngày hiệu lực', 'Quyết định', 'date'),
  f('qd.nguoi_ky', 'Người ký', 'Quyết định'),
];

export function sampleCatalog(hrmVersion: string, docType: DocType, decisionType = ''): Catalog {
  const fields = docType === 'quyet_dinh' ? [...EMPLOYEE, ...DECISION_COMMON] : [...EMPLOYEE, ...CONTRACT_EXTRA];
  return {
    id: catalogId(hrmVersion, docType, decisionType),
    hrmVersion,
    docType,
    decisionType: docType === 'quyet_dinh' ? decisionType : '',
    fields,
    verified: false,
    source: 'mau',
    updatedAt: Date.now(),
  };
}

export const catalogFieldSchema = z.object({
  code: z.string().trim().min(1).max(120),
  label: z.string().trim().min(1).max(200),
  group: z.string().trim().min(1).max(120),
  kind: z.enum(['text', 'date', 'number']).default('text'),
});

/** What Claude (or a person) submits to sync a catalog from the EasyHRM "Trường lấy giá trị" list. */
export const catalogImportSchema = z.object({
  protocol: z.string().optional(),
  hrm_version: z.string().trim().min(1),
  doc_type: z.enum(['hop_dong', 'phu_luc', 'thanh_ly', 'quyet_dinh']),
  decision_type: z.string().trim().optional().default(''),
  source: z.enum(['dong_bo', 'nhap_tay']).default('dong_bo'),
  fields: z.array(catalogFieldSchema).min(1, 'Danh mục phải có ít nhất 1 trường'),
});

export type CatalogImport = z.infer<typeof catalogImportSchema>;

export interface CatalogDiff {
  added: CatalogField[];
  removed: CatalogField[];
  changed: { before: CatalogField; after: CatalogField }[];
}

export function diffCatalog(before: CatalogField[], after: CatalogField[]): CatalogDiff {
  const b = new Map(before.map((x) => [x.code, x]));
  const a = new Map(after.map((x) => [x.code, x]));
  const added = after.filter((x) => !b.has(x.code));
  const removed = before.filter((x) => !a.has(x.code));
  const changed = after
    .filter((x) => b.has(x.code))
    .map((x) => ({ before: b.get(x.code)!, after: x }))
    .filter(({ before: p, after: q }) => p.label !== q.label || p.group !== q.group || p.kind !== q.kind);
  return { added, removed, changed };
}

export function importToCatalog(imp: CatalogImport): Catalog {
  const seen = new Set<string>();
  const fields = imp.fields.filter((x) => (seen.has(x.code) ? false : (seen.add(x.code), true)));
  return {
    id: catalogId(imp.hrm_version, imp.doc_type, imp.decision_type),
    hrmVersion: imp.hrm_version,
    docType: imp.doc_type,
    decisionType: imp.doc_type === 'quyet_dinh' ? imp.decision_type : '',
    fields,
    verified: imp.source === 'dong_bo',
    source: imp.source,
    updatedAt: Date.now(),
  };
}
