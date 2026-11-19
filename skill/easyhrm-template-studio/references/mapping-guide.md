# Cách đề xuất ghép trường

## Đọc candidate
- `context` là đoạn văn quanh chỗ cần điền; chỗ đó nằm trong `⟦…⟧`. Từ ngay **trước** `⟦` thường quyết định trường ("Ông/Bà:", "Sinh ngày", "Số CCCD", "kể từ ngày").
- `rule_hint`: `dotted_blank`/`underscore_blank` (chỗ trống), `date`, `date_words` (ngày… tháng… năm…), `money`, `id_number`, `phone`, `bracket` ([…]), `existing_key` (file đã có `{{…}}`).
- Giá trị thật đã bị che. Không cố đoán giá trị gốc.

## Chọn trường
1. Chỉ dùng `field_code` có trong `fields`. Với quyết định, `fields` đã đúng Loại quyết định — không mượn trường của loại khác.
2. Ưu tiên trường cùng nhóm với ngữ cảnh: người lao động → nhóm "Nhân viên"; bên công ty → "Đơn vị"/"Người đại diện"; ngày của văn bản → nhóm "Hợp đồng"/"Quyết định".
3. "Hà Nội, ngày … tháng … năm …" ở đầu/cuối văn bản → ngày ký / ngày quyết định, không phải ngày sinh.
4. Cùng một ý nghĩa xuất hiện nhiều lần → cùng `field_code` (Studio dùng chung một key).
5. Số tiền sau "Mức lương", "Lương cơ bản" → trường lương; "Bằng chữ" → trường lương bằng chữ nếu có, không có → gap T3.

## Độ tin cậy
- `cao`: từ dẫn rõ ràng và có đúng một trường khớp.
- `trung_binh`: khớp nhưng còn trường gần nghĩa khác.
- `thap`: suy luận yếu — cân nhắc đưa vào `gaps` T4 thay vì đề xuất.

## Khi nào dùng gaps
| Nhóm | Khi | Ví dụ |
| --- | --- | --- |
| T1 | Dữ liệu có trong hồ sơ nhưng danh mục không có trường | Số tài khoản ngân hàng |
| T2 | Nhập mỗi lần lập văn bản, không lưu ở đâu | Địa điểm làm việc cụ thể, công việc phải làm |
| T3 | Cần tính hoặc ghép chuỗi | Lương bằng chữ, tổng thu nhập |
| T4 | Không chắc là tham số (có thể là nội dung cố định) | Tên dự án nội bộ trong điều khoản |

`label` của gap: tên tiếng Việt ngắn, rõ (Studio sinh `{{TenKey}}` từ đây, ví dụ "Địa điểm làm việc" → `{{DiaDiemLamViec}}`).

## Quy tắc key (Studio tự áp dụng — chỉ để hiểu)
`{{TenKey}}`: chữ Latin không dấu viết liền, viết hoa chữ đầu mỗi từ, chỉ chữ và số, bắt đầu bằng chữ hoa, 2–50 ký tự. "Họ và tên" → `HoVaTen`, "Số CCCD" → `SoCCCD`, cũ/mới → hậu tố `Cu`/`Moi`.
