# Kịch bản: mẫu Hợp đồng / Phụ lục / Thanh lý (EasyHRM v2.5.39)

Nguồn: tri-thuc-easyhrm v2.5.39, trang `hop-dong-loai-hop-dong-mau-nguoi-ky`. Giao diện khác mô tả → dừng phiên đó, mô tả điều thấy, không đoán nút.

Quyền cần: "Hợp đồng › Quản lý danh sách › Hợp đồng › Xem danh sách". Quyền này đủ cho mọi nút trên màn, nên càng phải tự giữ điều cấm.

## Trước khi tạo
1. Mở `<project.url>/hop-dong/loai-hop-dong`. Chọn tab theo `hrm_job.doc_type`: **Loại hợp đồng** / **Loại phụ lục** / **Loại thanh lý**.
2. Đặt ô **Trạng thái** = **Tất cả**. Kiểm tra `template_name` / `template_code` chưa trùng (trùng cả với mẫu Không hiệu lực vẫn bị chặn). Trùng → thêm hậu tố, ghi vào `steps`.

## Bước 1 — Lập mẫu
1. **Tạo mẫu mới**.
2. **Tệp word mẫu (.docx)**: nạp theo `nap-tep.md`. Chỉ nạp **một lần**, vì nạp lại tệp sẽ xoá vị trí ký.
3. **Mã**: giữ mã gợi ý (HD…/PL…/TL…), trừ khi `template_code` có giá trị. **Tên mẫu** = `template_name`.
4. **Phân loại** = `hrm_job.contract.phan_loai`. Không có → suy từ nội dung văn bản; vẫn không chắc → chọn "Hợp đồng khác" và ghi vào `steps`.
   - "Không xác định thời hạn" → bỏ qua Loại thời hạn / Thời hạn (bị khoá).
   - "Xác định thời hạn" → **Loại thời hạn** chọn đơn vị tháng nếu có; **Thời hạn** = `thoi_han_thang` (trống → 0).
5. **Hình thức**: giữ mặc định. **Hiệu lực** = **Không hiệu lực**.
6. **Thêm tham số khác** → với mỗi `extra_fields`: Mã trường = `key`, Tên trường = `label`.
7. Bảng **Trường lấy giá trị trong hợp đồng**: với mỗi `{{key}}`:
   - có trong `mapping` → chọn `field_label` trong nhóm `field_group`. Không có → chọn trường cùng nghĩa trong cùng nhóm; vẫn không có → tạo trường bổ sung (`created_extra_fields`) rồi ghép.
   - có trong `extra_fields` → chọn trường bổ sung tương ứng.
   - **Định dạng** theo `format` nếu có. Tham số đã tô đỏ trong bản xem trước là đã tự ghép, chỉ cần kiểm lại.
8. **Tiếp theo**.

## Bước 2 — Thiết lập người ký
1. Dòng **Người lao động**: giữ nguyên (không xoá được). Hình thức ký / ký số / nhận OTP lấy theo `signer_defaults` nếu có, không thì giữ mặc định. Ký OTP thì **Hình thức nhận OTP** không được để trống hay "Tất cả": chọn "Email" nếu có.
2. Dòng người ký phía công ty — chọn **Người ký** theo thứ tự ưu tiên:
   1. `signing.company_signer_name` (tên ghi cố định trong mẫu);
   2. `signer_defaults.companySignerName` (mặc định của dự án);
   3. người duy nhất trong danh sách có chức danh khớp `signing.company_title` ("Giám đốc"…), hoặc người duy nhất trong danh sách.
   Không xác định được một người → `dung_giua_chung`, lý do "Chưa xác định người ký phía công ty — khai báo Người ký mặc định ở Hồ sơ dự án". Chuyển phiên kế tiếp.
3. Hình thức ký / ký số / OTP của dòng công ty: theo `signer_defaults`, không thì mặc định (ký số phải có giá trị).
4. **Tiếp theo**. Báo "Thông tin dữ liệu còn thiếu" → sửa đúng dòng có chữ đỏ, rồi Tiếp theo lại.

## Bước 3 — Vị trí ký
1. Chụp màn hình trang PDF, tìm chữ mốc `signing.employee_anchor` (thường là "NGƯỜI LAO ĐỘNG") và `signing.company_anchor` (thường là "ĐẠI DIỆN NGƯỜI SỬ DỤNG LAO ĐỘNG"). Mốc ở trang sau → cuộn tới trang đó.
2. Kéo ô tên **Người lao động** thả ngay dưới chữ mốc của người lao động, khoảng 1–2 dòng chữ. Kéo ô tên người ký công ty thả dưới chữ mốc của công ty (dưới dòng chức danh nếu có).
3. Chụp lại, kiểm tra hai ô đã nằm trên trang, đúng cột. Kéo không được sau 2 lần → `dung_giua_chung`, lý do "Không đặt được vị trí ký", kèm `user_steps` "Kéo vị trí ký rồi bấm Lưu".
4. Bấm **Lưu** (đồng ý đã có trong câu lệnh). "Chưa kéo thả vị trí ký" → kéo lại ô còn thiếu rồi Lưu lại một lần.

## Lưu ý
- Không bấm **Xóa**, **Đổi trạng thái**, **Đổi tên** ở menu "…" của bất kỳ mẫu nào.
- Không bật Hiệu lực.
