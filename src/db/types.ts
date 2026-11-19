// Entity types stored in IndexedDB. Shared by repositories and services.

export type DocType = 'hop_dong' | 'phu_luc' | 'thanh_ly' | 'quyet_dinh';

export type SessionStatus =
  | 'nhap'        // Nháp
  | 'cho_ai'      // Chờ AI đề xuất
  | 'cho_duyet'   // Chờ người dùng duyệt
  | 'da_duyet'    // Đã duyệt, file đã sẵn sàng
  | 'dang_tao'    // Claude đang tạo trên EasyHRM
  | 'da_tao'      // Đã tạo trên EasyHRM, chờ bật hiệu lực
  | 'hoan_tat'    // Người dùng đã bật hiệu lực
  | 'dung';       // Dừng giữa chừng

/** Optional per-project defaults Claude uses for contract signers (EasyHRM "Thiết lập người ký"). */
export interface SignerDefaults {
  companySignerName?: string;  // must exist in "Thiết lập người đại diện ký"
  signMethod?: string;         // Hình thức ký
  digitalSignMethod?: string;  // Hình thức ký số
  otpMethod?: string;          // Hình thức nhận OTP
}

export interface Project {
  id: string;
  name: string;
  url: string;          // origin only, https
  mst?: string;
  username: string;
  hrmVersion: string;
  note?: string;
  signerDefaults?: SignerDefaults;
  createdAt: number;
  updatedAt: number;
}

/** 'chen_key': Studio inserts keys · 'da_co_key': the file already holds {{Key}}s, keep them. */
export type SessionMode = 'chen_key' | 'da_co_key';

export type ContractClass = 'xac_dinh' | 'khong_xac_dinh' | 'thu_viec' | 'cong_tac_vien' | 'khac';

/** What Studio/AI read from the document itself (title, type, contract classification). */
export interface DocMeta {
  title?: string;               // first heading, e.g. "QUYẾT ĐỊNH"
  subject?: string;             // "Về việc bổ nhiệm lại ..."
  detectedDocType?: DocType;
  detectedDecisionType?: string;
  contractClass?: ContractClass;
  termMonths?: number;
  source: 'quy_tac' | 'ai' | 'nguoi_dung';
  confidence?: Confidence;
  note?: string;
}

/** Signature block analysis (contracts): who signs for the company and the anchor texts for drag-and-drop. */
export interface Signing {
  companyTitle?: string;        // "Giám đốc"
  companySignerName?: string;   // only when the template itself names a fixed signer
  employeeAnchor?: string;      // "NGƯỜI LAO ĐỘNG"
  companyAnchor?: string;       // "ĐẠI DIỆN NGƯỜI SỬ DỤNG LAO ĐỘNG"
  source: 'quy_tac' | 'ai' | 'nguoi_dung';
}

export interface Session {
  id: string;
  projectId: string;
  fileName: string;
  docType: DocType;
  decisionType?: string;
  hrmVersion: string;
  status: SessionStatus;
  templateCode?: string;
  templateName?: string;
  approvedAt?: number;
  mode?: SessionMode;           // v2; undefined = 'chen_key'
  docMeta?: DocMeta;            // v2
  signing?: Signing;            // v2
  queueOrder?: number;          // v2: order inside the work queue (upload order)
  batchId?: string;             // v2: files uploaded together
  handedToHrmAt?: number;       // v2: user handed this approved session to Claude for EasyHRM
  createdAt: number;
  updatedAt: number;
}

export interface SessionFile {
  sessionId: string;
  original: Blob;
  output?: Blob;
  outputName?: string;
}

/** Where a candidate sits inside the .docx package. */
export interface DocLocation {
  part: string;           // e.g. word/document.xml
  paragraph: number;      // index in that part's paragraph list
  start: number;          // char offset within paragraph text
  end: number;
}

export type RuleHint =
  | 'dotted_blank' | 'underscore_blank' | 'bracket' | 'date' | 'date_words'
  | 'money' | 'id_number' | 'phone' | 'person_name' | 'existing_key' | 'manual'
  | 'date_blank' | 'doc_number' | 'ai_added';

export type RowSource = 'quy_tac' | 'ai' | 'nguoi_dung';
export type Confidence = 'cao' | 'trung_binh' | 'thap';
export type RowStatus = 'cho' | 'duyet' | 'bo';
export type GapGroup = 'T1' | 'T2' | 'T3' | 'T4';

export interface MappingRow {
  id: string;            // `${sessionId}:${candidateId}`
  sessionId: string;
  candidateId: string;   // c1, c2...
  location: DocLocation;
  text: string;          // original text of the candidate (never sent to AI)
  context: string;       // paragraph text around candidate, unmasked (UI only)
  ruleHint: RuleHint;
  fieldCode?: string;    // chosen catalog field, or `extra:<Key>` for an added field
  extraLabel?: string;   // label for an added field (T2) or a gap
  key?: string;          // generated TenKey (without braces)
  format?: string;       // dd/MM/yyyy, #,##0...
  source?: RowSource;
  confidence?: Confidence;
  reason?: string;
  status: RowStatus;
  gapGroup?: GapGroup;
  gapNote?: string;
  fixedKey?: string;     // v2: key already in the file (mode da_co_key) — kept as is
  proposedSkip?: boolean; // v2: AI suggests "Bỏ" (fixed content); applied by "Duyệt toàn bộ đề xuất"
  addedBy?: 'ai';        // v2: candidate added by the AI from the full text
}

export type FieldKind = 'text' | 'date' | 'number';

export interface CatalogField {
  code: string;
  label: string;
  group: string;
  kind: FieldKind;
}

export interface Catalog {
  id: string;             // `${hrmVersion}|${docType}|${decisionType ?? ''}`
  hrmVersion: string;
  docType: DocType;
  decisionType: string;   // '' for contracts
  fields: CatalogField[];
  verified: boolean;      // true once synced from a real EasyHRM screen
  source: 'mau' | 'dong_bo' | 'nhap_tay';
  updatedAt: number;
}

export interface KeyDictionaryEntry {
  id: string;             // `${projectId}|${fieldCode}`
  projectId: string;
  fieldCode: string;
  key: string;
  uses: number;
  updatedAt: number;
}

export type LogActor = 'ai' | 'nguoi_dung' | 'he_thong';

export interface LogEntry {
  id?: number;
  sessionId: string;
  at: number;
  actor: LogActor;
  action: string;
  detail?: string;
}

export type HrmOutcome = 'thanh_cong' | 'dung_giua_chung' | 'that_bai';

export interface HrmReport {
  id?: number;
  createdExtraFields?: { key: string; label: string }[]; // v2
  signer?: string;                                         // v2
  sessionId: string;
  at: number;
  outcome: HrmOutcome;
  templateCode?: string;
  templateName?: string;
  steps: string[];
  userSteps: string[];
  mappedKeys: string[];
  unmappedKeys: string[];
  hrmMessages: string[];
  skillVersion?: string;
}

export interface Setting {
  key: string;
  value: unknown;
}
