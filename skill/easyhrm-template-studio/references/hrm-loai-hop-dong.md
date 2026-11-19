# Kịch bản: mẫu Hợp đồng / Phụ lục / Thanh lý (EasyHRM v2.5.39)

Nguồn: tri-thuc-easyhrm v2.5.39, trang `hop-dong-loai-hop-dong-mau-nguoi-ky`. Giao diện bản khác có thể khác — thấy lệch thì dừng và mô tả điều thấy, không đoán nút.

Quyền cần: "Hợp đồng › Quản lý danh sách › Hợp đồng › Xem danh sách" (quyền này đủ cho mọi nút — vì vậy càng phải tự giữ điều cấm).

## Trước khi tạo
1. Menu **Hợp đồng › Loại hợp đồng**. Chọn tab theo `doc_type`: **Loại hợp đồng** / **Loại phụ lục** / **Loại thanh lý**.
2. Ô **Trạng thái** → **Tất cả**. Kiểm tra `template_code` và `template_name` chưa trùng (trùng cả với mẫu Không hiệu lực vẫn bị chặn). Trùng → ghi báo cáo `dung_giua_chung`, nhờ người dùng đổi mã/tên trên Studio.

## Bước 1 — Lập mẫu
1. Bấm **Tạo mẫu mới**.
2. **Tệp word mẫu (.docx)**: tải tệp `hrm_job.output_file_name` (người dùng đã tải về từ Studio). Không tải được → nhờ người dùng chọn tệp, chờ xác nhận, ghi vào `user_steps`.
3. **Mã hợp đồng** (≤ 20 ký tự): `template_code` nếu có, không thì giữ mã EasyHRM gợi ý. **Mẫu hợp đồng** (tên, ≤ 255): `template_name`.
4. **Phân loại**, **Loại thời hạn**, **Thời hạn**, **Hình thức**: theo nội dung văn bản; không chắc → hỏi người dùng.
5. Bảng **Trường lấy giá trị trong hợp đồng**: với mỗi dòng trong `hrm_job.mapping`, tìm tham số `{{key}}`, chọn **Trường lấy giá trị** = `field_label` trong nhóm `field_group`, đặt **Định dạng** nếu `format` có giá trị. Tham số đã được tô đỏ trong xem trước là đã tự ghép — chỉ kiểm lại.
6. Với mỗi `hrm_job.extra_fields`: **Thêm tham số khác** → Mã trường = `key`, Tên trường = `label`; rồi ghép tham số đó với trường bổ sung vừa tạo.
7. `unmapped_keys`: để trống, ghi vào báo cáo.
8. **Tiếp theo**.

## Bước 2 — Thiết lập người ký
1. Giữ dòng **Người lao động** (không xóa được).
2. Dòng người ký phía công ty: chọn người theo yêu cầu của người dùng (danh sách lấy từ Thiết lập người đại diện ký, chỉ người Hoạt động). Không có ai → dừng, hướng dẫn người dùng khai báo người đại diện ký trước.
3. Điền **Hình thức ký**, **Hình thức ký số**, **Hình thức nhận OTP** theo người dùng chọn (không được để OTP là trống / "Tất cả" khi ký OTP).
4. **Tiếp theo**.

## Bước 3 — Vị trí ký
1. Kéo ô tên từng người ký lên vùng chữ ký (gần chữ "NGƯỜI LAO ĐỘNG", "ĐẠI DIỆN NGƯỜI SỬ DỤNG LAO ĐỘNG" hoặc tương đương).
2. Kéo không được hoặc không chắc vị trí → nhờ người dùng kéo, chờ xác nhận, ghi vào `user_steps`.
3. **Dừng trước Lưu**: tóm tắt một dòng, hỏi "Lưu mẫu?".
4. Người dùng đồng ý → **Lưu**. Đọc thông báo; "Chưa kéo thả vị trí ký" / "Thông tin dữ liệu còn thiếu" → sửa đúng chỗ báo, hỏi lại trước khi Lưu lần nữa.

## Lưu ý
- Tải lại tệp Word ở bước 1 sẽ xóa mọi vị trí ký đã đặt.
- Không bấm **Xóa**, **Đổi trạng thái**, **Đổi tên** ở menu "…" của bất kỳ mẫu nào.
- Không bật Hiệu lực.
