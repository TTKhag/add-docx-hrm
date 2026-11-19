# Kịch bản: Mẫu quyết định (EasyHRM v2.5.39)

Nguồn: tri-thuc-easyhrm v2.5.39, trang `thiet-lap-quyet-dinh`. Giao diện bản khác có thể khác: thấy lệch thì dừng phiên đó và mô tả điều thấy.

Quyền cần: "Nhân sự › Thiết lập dữ liệu nhân sự". Thiếu quyền thì trang chỉ có tiêu đề.

## Trước khi tạo
1. Mở `<project.url>/thong-tin-nhan-su/thiet-lap/mau-quyet-dinh` (menu **Thông tin nhân sự › Thiết lập › Thiết lập thông tin quyết định**, tab **Mẫu quyết định**).
2. Kiểm tra `template_name` (và `template_code` nếu có) chưa trùng mẫu nào. Bảng hiện cả mẫu hết hiệu lực; xem hết các trang. Trùng tên → thêm hậu tố ngắn theo đơn vị hoặc dự án (ví dụ " RHM", " (2)"), ghi vào `steps`.

## Tạo mẫu
1. Mở menu "…" cạnh **Tạo mẫu mới** → chọn **Mẫu quyết định**. Khung "Thông tin mẫu quyết định" mở với mã MQD… tự sinh.
2. **Tên mẫu quyết định** = `template_name`. **Mã**: giữ mã tự sinh, trừ khi `template_code` có giá trị.
3. **Loại quyết định** = `hrm_job.decision_type`. Chọn **trước** khi nạp tệp và ghép (đổi loại sau sẽ xoá toàn bộ ánh xạ mà không hỏi). Không có đúng tên đó → chọn loại gần nghĩa nhất, ghi vào `steps`.
4. **Hiệu lực** = **Không hiệu lực**: người dùng sẽ xem trước rồi tự bật. Tên đơn vị, Ghi chú: để nguyên.
5. Nạp tệp: `nap-tep.md`.
6. Khối **Trường giá trị bổ sung**: với mỗi `extra_fields`, bấm **Thêm tham số khác** → Mã = `key`, Tên = `label`.
7. Khối **Trường giá trị trong quyết định**: với mỗi tham số `{{key}}`:
   - có trong `mapping` → **Trường lấy giá trị**: gõ tìm `field_label`, chọn mục nằm dưới nhóm `field_group`. Không thấy → chọn trường **cùng nghĩa, cùng nhóm** (ví dụ "Họ và tên" → "Tên nhân viên"). Vẫn không có → tạo trường bổ sung với key đó, rồi ghép (ghi vào `created_extra_fields`).
   - có trong `extra_fields` → chọn trường bổ sung vừa tạo (nhóm "Thông tin khác").
   - **Định dạng**: trường ngày chọn `dd/MM/yyyy`, trường số chọn định dạng số. Một số loại quyết định không tự điền định dạng.
   - `unmapped_keys` → để trống, ghi vào báo cáo.
8. Kiểm tra: không còn tham số nào để trống ở "Trường lấy giá trị", trừ `unmapped_keys`.
9. Bấm **Lưu** (đồng ý đã có trong câu lệnh). Đọc thông báo.

## Sau khi Lưu
- Danh sách có dòng mới với đúng tên, loại, Trạng thái "Không hiệu lực" → `thanh_cong`, `template_code` = mã MQD vừa tạo.
- "Tên/Mã mẫu quyết định đã tồn tại" → đổi hậu tố, Lưu lại **một** lần.
- "Tệp tin mẫu không tồn tại" khi tải lại tệp mẫu → `dung_giua_chung`, nhờ người dùng kiểm tra.
- Tham số có dấu cách, `-` hoặc `.` không được EasyHRM nhận. Key `{{TenKey}}` của Studio đã đúng dạng.
