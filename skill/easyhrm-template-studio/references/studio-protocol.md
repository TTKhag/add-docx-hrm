# Giao thức Studio ↔ Claude (tstudio/1)

## window.TemplateStudio

| Hàm | Dùng khi | Ghi chú |
| --- | --- | --- |
| `getTask(sessionId)` | Bắt đầu mọi việc | Trả phiếu việc (bên dưới) |
| `getStatus(sessionId)` | Kiểm nhanh trạng thái | `{status, label}` |
| `submitProposal(json)` | Gửi đề xuất ghép trường | Chỉ khi `nhap` / `cho_ai` / `cho_duyet` |
| `startHrm(sessionId)` | Ngay trước khi thao tác EasyHRM | Chỉ khi `da_duyet` / `dung` |
| `submitHrmReport(json)` | Sau khi thao tác EasyHRM | Chỉ khi đã `startHrm` |
| `submitCatalog(json)` | Đồng bộ danh mục trường | |
| `reportSkillVersion("1.0.0")` | Kiểm tra kết nối | |
| `listSessions()` | Người dùng không đưa session_id | 30 phiên gần nhất |

Tất cả là `async`, nhận object hoặc chuỗi JSON, trả `{ ok: true, data, message }` hoặc `{ ok: false, errors: [{path, message}], message }`.

Nếu không chạy được JavaScript: tab **Khung cho AI** (`#/phien/<id>/ai`) có ô chỉ đọc "Phiếu việc JSON (chỉ đọc)" (`data-testid="agent-task-json"`), ô "Dán JSON kết quả từ AI" (`agent-input-json`), nút **Áp dụng** (`agent-apply`), khung kết quả (`agent-result`, thuộc tính `data-ok`). Studio tự nhận loại JSON: có `proposals`/`gaps` → đề xuất; có `outcome` → báo cáo; có `fields` + `doc_type` → danh mục.

## Trạng thái phiên

`nhap` → `cho_ai` → `cho_duyet` → `da_duyet` → `dang_tao` → `da_tao` → `hoan_tat`; `dang_tao` → `dung` → `da_duyet`/`dang_tao`. Trường `next_step` trong phiếu việc nói Claude được làm gì lúc này — làm đúng như vậy.

## Phiếu việc (Studio → Claude) — dữ liệu mẫu

```json
{
  "protocol": "tstudio/1",
  "session_id": "s_abc123",
  "status": "cho_ai",
  "hrm_version": "2.5.39",
  "doc_type": "quyet_dinh",
  "decision_type": "Quyết định điều chuyển",
  "key_rule": "TenKey",
  "project": { "name": "Công ty Mẫu A", "url": "https://hrm-mau-a.example.vn", "mst": "0101234567", "username": "cauhinh.mau" },
  "catalog_verified": false,
  "candidates": [
    { "id": "c1", "text": "…………", "context": "Ông/Bà: ⟦[chỗ trống]⟧ Mã NV: [số giấy tờ]", "rule_hint": "dotted_blank",
      "current": { "field_code": "nv.ho_va_ten", "status": "cho", "source": "quy_tac" } }
  ],
  "fields": [ { "code": "nv.ho_va_ten", "label": "Họ và tên", "group": "Nhân viên", "kind": "text" } ],
  "next_step": "Đề xuất trường cho từng candidate rồi gọi submitProposal. Không tự duyệt."
}
```

- `current` = gợi ý sẵn có (quy tắc hoặc người dùng). `status` khác `cho` nghĩa là người dùng đã quyết — **không đề xuất lại** dòng đó.
- `catalog_verified: false` → danh mục là bản mẫu; nhắc người dùng đồng bộ trước khi tạo mẫu thật.
- Khi phiên đã duyệt, có thêm `hrm_job`:

```json
"hrm_job": {
  "template_code": "MQD010",
  "template_name": "QĐ điều chuyển mẫu",
  "output_file_name": "QD dieu chuyen_TenKey.docx",
  "mapping": [ { "key": "HoVaTen", "field_code": "nv.ho_va_ten", "field_label": "Họ và tên", "field_group": "Nhân viên", "format": null } ],
  "extra_fields": [ { "key": "DiaDiemLamViec", "label": "Địa điểm làm việc" } ],
  "unmapped_keys": [ "LuongBangChu" ]
}
```

## Đề xuất (Claude → Studio)

```json
{
  "protocol": "tstudio/1",
  "session_id": "s_abc123",
  "skill_version": "1.0.0",
  "proposals": [
    { "candidate_id": "c1", "field_code": "nv.ho_va_ten", "confidence": "cao", "reason": "đứng sau Ông/Bà" }
  ],
  "gaps": [
    { "candidate_id": "c7", "group": "T3", "label": "Lương bằng chữ", "note": "danh mục không có trường" }
  ],
  "extra_candidates": [ { "hint": "Đoạn 'Thời gian làm việc: 8 giờ/ngày' có thể là tham số" } ]
}
```

- `confidence`: `cao` | `trung_binh` | `thap`.
- `field_code` phải có trong `fields`, nếu không Studio từ chối dòng đó.
- `gaps.group`: T1 có dữ liệu nhưng thiếu trường · T2 nhập mỗi lần (trường bổ sung) · T3 cần tính/ghép · T4 không chắc là tham số. `label` là tên tham số tiếng Việt (Studio sinh key từ đây).
- `extra_candidates`: chỗ Studio dò sót — chỉ để người dùng xem, Studio không tự thêm.

## Báo cáo EasyHRM (Claude → Studio)

```json
{
  "protocol": "tstudio/1",
  "session_id": "s_abc123",
  "skill_version": "1.0.0",
  "outcome": "thanh_cong",
  "template_code": "MQD010",
  "template_name": "QĐ điều chuyển mẫu",
  "steps": ["Mở Thiết lập thông tin quyết định", "Tạo Mẫu quyết định", "Ghép 6 tham số", "Lưu (người dùng đồng ý)"],
  "user_steps": ["Người dùng chọn tệp ở ô Chọn tệp tin mẫu"],
  "mapped_keys": ["HoVaTen", "NgayHieuLuc"],
  "unmapped_keys": ["LuongBangChu"],
  "hrm_messages": []
}
```

`outcome`: `thanh_cong` | `dung_giua_chung` | `that_bai`. Chép nguyên văn thông báo EasyHRM vào `hrm_messages`.

## Danh mục trường (Claude → Studio)

```json
{
  "protocol": "tstudio/1",
  "hrm_version": "2.5.39",
  "doc_type": "hop_dong",
  "decision_type": "",
  "source": "dong_bo",
  "fields": [ { "code": "nhan_vien.ho_va_ten", "label": "Họ và tên", "group": "Nhân viên", "kind": "text" } ]
}
```

`code`: tự đặt ổn định từ `nhóm.tên` (không dấu, gạch dưới); `label` và `group` chép **đúng chữ hiển thị** trên EasyHRM; `kind`: `text` | `date` | `number`.
