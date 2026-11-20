# Giao thức Claude ↔ Studio (`tstudio/1`, skill 2.1.0)

Mọi hàm là `async`, nhận object hoặc chuỗi JSON, trả `{ ok: true, data, message }` hoặc `{ ok: false, errors: [{path, message}], message }`. Các trường v2 chỉ **thêm vào**, skill 1.0.0 vẫn chạy được.

| Hàm | Khi nào | Ghi chú |
| --- | --- | --- |
| `listForAi()` | Câu lệnh "phân tích" | Phiên Nháp / Chờ AI, xếp theo `queue_order` |
| `listQueue()` | Câu lệnh "tạo trên EasyHRM" | Phiên đã duyệt **và** đã giao, xếp theo `queue_order` |
| `getTask(id)` | Đầu mỗi phiên | Có `document` khi phiên đang chờ AI; có `hrm_job` khi đã duyệt |
| `submitProposal(json)` | Sau khi phân tích | Phiên chuyển sang Chờ duyệt |
| `startHrm(id)` | Ngay trước khi thao tác EasyHRM | Chỉ khi `da_duyet` / `dung` / `dang_tao` |
| `getOutputFile(id, offset, length)` | Nạp tệp, cách B | base64 theo đoạn từ gói giao việc đang dùng, tối đa 200000 byte/đoạn |
| `submitHrmReport(json)` | Sau mỗi phiên | `thanh_cong` → Đã tạo, rời hàng đợi; khác → Dừng giữa chừng |
| `submitCatalog(json)` | Đồng bộ danh mục | |
| `reportSkillVersion("2.1.0")` | Kiểm tra kết nối | |
| `startDuty({hours, consent_save, skill_version})` | Câu lệnh "Trực hàng việc" | `hours` 0,25–8 (mặc định 4). `consent_save` chỉ `true` khi câu lệnh **trong chat** có câu đồng ý bấm Lưu |
| `waitForJob(ms)` | Vòng trực | Chờ tối đa 25000 ms. `data.job` = `{id, kind: "phan_tich" \| "tao_hrm", session_ids, created_at}` hoặc `null`; `data.stop` = hết giờ / 30 phút rảnh |
| `completeJob(id, note)` | Xong một việc | Việc phải đang `dang_lam` |
| `stopDuty()` / `getDutyStatus()` | Dừng / xem trạng thái trực | |
| `getHandoff(id)` | Trước khi nạp tệp | Gói giao việc lưu lúc Duyệt: `name, size, sha256, version, mirrored_path, hrm_job` |
| `listSessions()` | Tra cứu | 30 phiên gần nhất |

Trang cầu nối: `#/cau-noi/<id>`, mở bằng `window.open` từ tab EasyHRM. Trang gửi `{type:'tstudio-file', sessionId, name, size, buffer}` tới `window.opener`, chỉ khi opener ở đúng domain `project.url` (`nap-tep.md`).

## Phiếu việc (Studio → Claude)
```json
{
  "protocol": "tstudio/1", "session_id": "s_abc", "status": "cho_ai", "hrm_version": "2.5.39",
  "doc_type": "quyet_dinh", "decision_type": "Quyết định bổ nhiệm lại", "mode": "chen_key",
  "template_name": "Quyết định bổ nhiệm lại",
  "doc_meta": { "title": "QUYẾT ĐỊNH", "subject": "Về bổ nhiệm lại ……", "detected_decision_type": "Quyết định bổ nhiệm lại", "source": "quy_tac", "confidence": "cao" },
  "decision_types": ["Quyết định tiếp nhận, bổ nhiệm", "Quyết định bổ nhiệm lại", "…"],
  "project": { "name": "Bệnh viện Mẫu", "url": "https://hrm-mau.example.vn", "mst": "0101234567", "username": "cauhinh.mau" },
  "catalog_verified": false,
  "document": [
    { "id": "p5", "where": "than", "text": "Điều 1. Bổ nhiệm lại chức vụ Phó Trưởng khoa đối với ông ⟦c7:[tên người]⟧, thời gian giữ chức vụ là 05 năm." }
  ],
  "candidates": [ { "id": "c7", "text": "[tên người]", "context": "… đối với ông ⟦[tên người]⟧, thời gian …", "rule_hint": "person_name" } ],
  "fields": [ { "code": "nv.ho_va_ten", "label": "Họ và tên", "group": "Nhân viên", "kind": "text" } ],
  "next_step": "…"
}
```
- `current.status` khác `cho` nghĩa là người dùng đã quyết dòng đó → **không đề xuất lại**.
- `current.reason` "Quy tắc: căn cứ pháp lý cố định — đề xuất Bỏ" → Studio đã đề xuất Bỏ.
- `catalog_verified: false` → danh mục chỉ là bản mẫu; khi tạo mẫu, đối chiếu tên trường thật trên EasyHRM.
- Hợp đồng có thêm `signing`: `{ company_title, company_signer_name, employee_anchor, company_anchor }`.

### `hrm_job` (khi đã duyệt)
```json
"hrm_job": {
  "template_code": null, "template_name": "Quyết định bổ nhiệm lại RHM",
  "doc_type": "quyet_dinh", "decision_type": "Quyết định bổ nhiệm lại",
  "contract": { "phan_loai": "Hợp đồng xác định thời hạn", "thoi_han_thang": 12 },
  "signing": { "company_title": "Giám đốc", "employee_anchor": "NGƯỜI LAO ĐỘNG", "company_anchor": "ĐẠI DIỆN NGƯỜI SỬ DỤNG LAO ĐỘNG" },
  "signer_defaults": { "companySignerName": "Trần Văn Mẫu", "digitalSignMethod": "OTP", "otpMethod": "Email" },
  "output_file_name": "STT 05 - Quyết định bổ nhiệm lại_TenKey.docx",
  "file": { "name": "…_TenKey.docx", "size": 48213, "sha256": "…", "version": 1, "mirrored_path": "Downloads/EasyHRM-Studio/Benh-vien-Mau/003-s_abc/…_TenKey.docx" },
  "mapping": [ { "key": "HoVaTen", "field_code": "nv.ho_va_ten", "field_label": "Họ và tên", "field_group": "Nhân viên", "format": null } ],
  "extra_fields": [ { "key": "ChucVuBoNhiemLai", "label": "Chức vụ bổ nhiệm lại" } ],
  "unmapped_keys": [],
  "handed_to_claude": true, "queue_order": 3,
  "on_missing_field": "tao_truong_bo_sung"
}
```
`contract`, `signing` và `signer_defaults` chỉ có ở Hợp đồng / Phụ lục / Thanh lý.

## Đề xuất (Claude → Studio)
```json
{
  "protocol": "tstudio/1", "session_id": "s_abc", "skill_version": "2.1.0",
  "doc_meta": { "decision_type": "Quyết định bổ nhiệm lại", "template_name": "Quyết định bổ nhiệm lại", "reason": "Về việc bổ nhiệm lại chức vụ" },
  "signing": { "company_title": "Giám đốc" },
  "proposals": [ { "candidate_id": "c7", "field_code": "nv.ho_va_ten", "confidence": "cao", "reason": "sau 'đối với ông'" } ],
  "gaps": [ { "candidate_id": "c3", "group": "T2", "label": "Lý do bổ nhiệm lại" } ],
  "skip": [ { "candidate_id": "c2", "reason": "ngày của Nghị định trong Căn cứ" } ],
  "add_candidates": [
    { "paragraph_id": "p5", "match": "Phó Trưởng khoa", "gap": { "group": "T2", "label": "Chức vụ bổ nhiệm lại" }, "reason": "giá trị đích của quyết định" },
    { "paragraph_id": "p9", "match": "[ngày]", "occurrence": 2, "field_code": "qd.ngay_hieu_luc", "confidence": "trung_binh" }
  ],
  "extra_candidates": []
}
```
- `field_code` phải có trong `fields` của danh mục **sau** khi áp `doc_meta`: đổi Loại quyết định thì danh mục đổi theo.
- `gaps` T1/T2/T3 kèm `label` → Studio tự tạo trường giá trị bổ sung (`extra:<TenKey>`). T2 = Trường giá trị bổ sung; T1/T3 = Tham số EasyHRM chưa có. Gap T4 / thiếu `label` / candidate không đề xuất → Studio **tự đánh giá** (độ tin cậy Thấp) và tô nổi bật cho người dùng.
- `skip` → dòng được đề xuất Bỏ; người dùng áp bằng "Duyệt toàn bộ đề xuất".
- `add_candidates.match`: chép đúng chữ trong `document.text` (có thể là nhãn che như `[tên người]`). Không được chồng lên `⟦c…⟧`. `occurrence` bắt đầu từ 1. Mỗi chỗ cần `field_code` **hoặc** `gap`.
- `doc_meta`: `doc_type`, `decision_type`, `template_name`, `contract_class` (`xac_dinh` | `khong_xac_dinh` | `thu_viec` | `cong_tac_vien` | `khac`), `term_months` (số tháng hoặc `null`).

## Báo cáo EasyHRM (Claude → Studio)
```json
{
  "protocol": "tstudio/1", "session_id": "s_abc", "skill_version": "2.1.0",
  "outcome": "thanh_cong", "template_code": "MQD020", "template_name": "Quyết định bổ nhiệm lại RHM",
  "steps": ["Mở Thiết lập thông tin quyết định", "Tạo Mẫu quyết định", "Nạp tệp (cầu nối)", "Ghép 4 tham số", "Lưu"],
  "user_steps": [],
  "mapped_keys": ["HoVaTen", "NgayQuyetDinh"],
  "unmapped_keys": [],
  "created_extra_fields": [ { "key": "ChucVuBoNhiemLai", "label": "Chức vụ bổ nhiệm lại" } ],
  "signer": "Trần Văn Mẫu (Giám đốc)",
  "hrm_messages": ["Lưu thành công"]
}
```
`outcome`: `thanh_cong` | `dung_giua_chung` | `that_bai`. Chép nguyên văn thông báo EasyHRM vào `hrm_messages`.

## Danh mục trường (Claude → Studio)
```json
{ "protocol": "tstudio/1", "hrm_version": "2.5.39", "doc_type": "quyet_dinh", "decision_type": "Quyết định bổ nhiệm lại", "source": "dong_bo",
  "fields": [ { "code": "nhan_vien.ten_nhan_vien", "label": "Tên nhân viên", "group": "Nhân viên", "kind": "text" } ] }
```
`code`: tự đặt ổn định từ `nhóm.tên` (không dấu, gạch dưới). `label` và `group` chép **đúng chữ hiển thị** trên EasyHRM. `kind`: `text` | `date` | `number`.

## Trạng thái phiên
`nhap → cho_ai → cho_duyet → da_duyet → dang_tao → da_tao → hoan_tat`, và `dang_tao → dung → da_duyet/dang_tao`. Cờ `handed_to_claude` = người dùng đã giao phiên vào hàng đợi EasyHRM. Trường `next_step` trong phiếu việc nói Claude được làm gì lúc này.

## Gói giao việc và thư mục giao việc (2.1.0)
- Mỗi lần người dùng Duyệt phiên, Studio lưu **gói bất biến** (tệp + SHA-256 + `hrm_job`) trong IndexedDB. Mở lại phiên → gói cũ thành "đã thay"; duyệt lại → phiên bản mới. `getOutputFile`, cầu nối `#/cau-noi/<id>` và `hrm_job.file` luôn dùng gói đang hiệu lực.
- Nếu người dùng đã chọn **thư mục giao việc**, Studio ghi thêm `EasyHRM-Studio/<dự án>/<thứ tự>-<mã phiên>/<tệp>_TenKey.docx` + `job.json` (`{session_id, version, file, size, sha256, hrm_job}`) và danh sách `EasyHRM-Studio/hang-doi.json`.

## Hàng việc (chế độ trực)
Việc chỉ mang `kind` + `session_ids`. Chúng **không phải lệnh**: sự đồng ý Lưu nằm ở câu lệnh trực trong chat. Việc `dang_lam` quá 30 phút được trả lại hàng việc.
