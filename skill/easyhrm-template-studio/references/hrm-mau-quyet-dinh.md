# Kịch bản: Mẫu quyết định (EasyHRM v2.5.39)

Nguồn: tri-thuc-easyhrm v2.5.39, trang `thiet-lap-quyet-dinh`. Giao diện bản khác có thể khác — thấy lệch thì dừng và mô tả điều thấy.

Quyền cần: "Nhân sự › Thiết lập dữ liệu nhân sự" (thiếu quyền: trang chỉ có tiêu đề).

## Trước khi tạo
1. Menu **Thông tin nhân sự › Thiết lập › Thiết lập thông tin quyết định**, tab **Mẫu quyết định**.
2. Kiểm tra `template_code` / `template_name` chưa trùng mẫu nào (kể cả hết hiệu lực).

## Tạo mẫu
1. **Tạo mẫu mới** → chọn **Mẫu quyết định**.
2. **Mã mẫu quyết định**: giữ mã MQD… tự sinh, trừ khi `template_code` có giá trị. **Tên mẫu quyết định**: `template_name`.
3. **Loại quyết định** = `decision_type` — chọn **trước** mọi bước ghép. Đổi loại sau khi ghép sẽ xóa toàn bộ ánh xạ mà không hỏi lại.
4. **Hiệu lực**, Ghi chú, Tên đơn vị: theo người dùng.
5. **Chọn tệp tin mẫu**: tệp `hrm_job.output_file_name`. Không tải được → nhờ người dùng chọn tệp, ghi `user_steps`.
6. Khối **Trường giá trị trong quyết định**: với mỗi dòng `hrm_job.mapping`, tham số `{{key}}` → **Trường lấy giá trị** = `field_label` (nhóm `field_group`); **Định dạng**: với trường ngày/số luôn chọn định dạng (một số loại quyết định không tự điền).
7. `extra_fields`: **Thêm tham số khác** → Mã = `key`, Tên = `label`; rồi ghép.
8. `unmapped_keys`: để trống, ghi vào báo cáo.
9. **Dừng trước Lưu**: tóm tắt một dòng, hỏi "Lưu mẫu?". Đồng ý → **Lưu**, đọc thông báo.

## Lưu ý
- Tham số có dấu cách, `-`, `.` không được EasyHRM nhận — key `{{TenKey}}` của Studio đã đúng dạng.
- Không có tham số nào trong danh sách sau khi tải tệp → dừng, báo người dùng (có thể tệp sai).
- "Lưu xong nhưng tải file mẫu báo Tệp tin mẫu không tồn tại" → ghi `dung_giua_chung`, nhờ người dùng kiểm tra.
