# Cách đề xuất ghép trường

## Đọc candidate
- Đọc **toàn văn `document` trước** (`phan-tich-mau-hrm.md`). `context` chỉ là đoạn ngắn quanh chỗ cần điền, đánh dấu bằng `⟦…⟧`.
- `rule_hint`: `dotted_blank`/`underscore_blank` (chỗ trống), `date_blank` (ngày … tháng … năm …, **một** tham số), `date`, `date_words`, `doc_number` (Số: …), `money`, `id_number`, `phone`, `person_name`, `bracket`, `existing_key` (tệp đã có `{{…}}`), `ai_added` (chỗ do AI thêm).
- Giá trị thật đã bị che. Không cố đoán giá trị gốc.
- `current.reason` bắt đầu bằng "Quy tắc: căn cứ pháp lý" → Studio đã đề xuất Bỏ. Đồng ý thì không cần gửi gì; không đồng ý thì gửi `proposals` cho chỗ đó.

## Chọn trường
1. Chỉ dùng `field_code` có trong `fields`. Với quyết định, `fields` đã đúng Loại quyết định. Không mượn trường của loại khác.
2. Ưu tiên trường cùng nhóm với ngữ cảnh: người lao động → "Nhân viên"; bên công ty → "Đơn vị"/"Người đại diện"; ngày của văn bản → "Hợp đồng"/"Quyết định"; giá trị đích của quyết định (chức vụ mới, phòng ban mới, lương mới) → nhóm của loại quyết định.
3. "…, ngày … tháng … năm …" ở đầu hoặc cuối văn bản → ngày ký / ngày quyết định, không phải ngày sinh.
4. Cùng ý nghĩa → cùng `field_code`.
5. Số tiền sau "Mức lương", "Lương cơ bản" → trường lương. "Bằng chữ" → trường lương bằng chữ nếu có, không có → gap T3 "Lương bằng chữ".
6. Tệp đã có key (`mode = da_co_key`): key giữ nguyên, chỉ chọn trường cho key. Key không có trường → gap T1/T2 với nhãn đúng nghĩa của key.

## Độ tin cậy
- `cao`: từ dẫn rõ ràng và chỉ có đúng một trường khớp.
- `trung_binh`: khớp, nhưng còn trường gần nghĩa khác.
- `thap`: suy luận yếu → cân nhắc gap T4.

## Gap → trường giá trị bổ sung
T1/T2/T3 kèm `label` sẽ được Studio **tự biến thành trường giá trị bổ sung** (key = TenKey của nhãn), và Claude tạo trường đó trên EasyHRM. T4 để người dùng quyết. `label` phải ngắn và rõ: "Địa điểm làm việc" → `{{DiaDiemLamViec}}`.

## Quy tắc key (Studio tự áp dụng — chỉ để hiểu)
`{{TenKey}}`: chữ Latin không dấu viết liền, viết hoa chữ đầu mỗi từ, chỉ có chữ và số, bắt đầu bằng chữ hoa, dài 2–50 ký tự. Ví dụ "Họ và tên" → `HoVaTen`, "Số CCCD" → `SoCCCD`. Cặp cũ/mới thêm hậu tố `Cu`/`Moi`.
