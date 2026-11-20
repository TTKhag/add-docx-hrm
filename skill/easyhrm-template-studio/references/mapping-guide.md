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
- `thap`: suy luận yếu → vẫn kết luận (gap T1/T2/T3 kèm `label`), ghi `note` lý do chưa chắc.

## Key không có trường: luôn kết luận (từ skill 2.1.0)
Không còn dòng "chưa chọn trường". Chọn một trong hai:
- **Trường giá trị bổ sung** (T2): giá trị nhập mỗi lần lập văn bản — lý do, địa điểm làm việc, nội dung công việc, thời gian giữ chức vụ…
- **Tham số EasyHRM chưa có**: T1 = dữ liệu vốn có trong hồ sơ nhân sự nhưng danh mục thiếu trường (trình độ, dân tộc, số sổ BHXH, hệ số, tài khoản ngân hàng…); T3 = phải tính/ghép (bằng chữ, tổng thu nhập, số năm công tác…).
Cả hai đều có key (TenKey của `label`) và được Claude tạo thành "Trường giá trị bổ sung" trên EasyHRM (tham số chưa ghép trường sẽ in ra nguyên `{{…}}`). Tham số chưa có còn được liệt kê để báo đội sản phẩm. `label` ngắn và rõ: "Địa điểm làm việc" → `{{DiaDiemLamViec}}`. Không dùng T4.

## Quy tắc key (Studio tự áp dụng — chỉ để hiểu)
`{{TenKey}}`: chữ Latin không dấu viết liền, viết hoa chữ đầu mỗi từ, chỉ có chữ và số, bắt đầu bằng chữ hoa, dài 2–50 ký tự. Ví dụ "Họ và tên" → `HoVaTen`, "Số CCCD" → `SoCCCD`. Cặp cũ/mới thêm hậu tố `Cu`/`Moi`.
