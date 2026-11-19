# Phân tích mẫu như BA nhân sự (đọc trước khi đề xuất)

Mục tiêu: tìm **đủ** mọi chỗ thay đổi theo nhân viên hoặc theo lần lập văn bản, kể cả chỗ không có dấu "……". Studio chỉ dò theo quy tắc (dấu chấm, gạch dưới, ngày, số tiền, tên sau "Ông/Bà"…), nên phần còn lại là việc của Claude.

## 1. Cách đọc
1. Đọc **toàn bộ `document`** một lượt. Xác định văn bản thuộc loại gì và nói về việc gì ("bổ nhiệm lại chức vụ", "nâng bậc lương", "HĐLĐ xác định thời hạn 12 tháng").
2. Chia vùng: **Đầu** (quốc hiệu, số, địa danh/ngày) → **Căn cứ** → **Thân** (Điều 1, 2, 3… hoặc các điều khoản hợp đồng) → **Cuối** (nơi nhận, chức danh, người ký).
3. Với mỗi cụm chữ, tự hỏi: *"Lập văn bản này cho một nhân viên khác thì chữ này có đổi không?"* Có đổi → tham số. Giống nhau mọi lần → cố định (Bỏ).
4. Một ý nghĩa xuất hiện nhiều lần → **cùng một trường**, ví dụ họ tên ở Điều 1 và Điều 3.

## 2. Bảng tra theo vùng

| Vùng | Thường là tham số | Thường cố định → `skip` |
|---|---|---|
| Đầu | Số văn bản (`Số: …/QĐ-…`); "…, ngày … tháng … năm …" (**một** tham số ngày, không chẻ 3) | Quốc hiệu, tiêu ngữ, tên cơ quan chủ quản |
| Căn cứ | "Căn cứ đơn/đề nghị/tờ trình/biên bản/hợp đồng số … ngày …" (theo từng việc) | Luật, Nghị định, Thông tư, Quyết định ban hành quy chế, kèm **số và ngày** của các văn bản đó |
| Thân — người | Họ tên, giới tính ("ông/bà"), ngày sinh, mã NV, CCCD/ngày cấp/nơi cấp, quê quán, địa chỉ, điện thoại, trình độ | — |
| Thân — việc | Chức vụ/chức danh **cũ và mới**, khoa/phòng/đơn vị **cũ và mới**, ngày hiệu lực, thời hạn (nếu đổi theo người), mức lương, bậc, hệ số, phụ cấp, lý do, địa điểm làm việc, công việc phải làm | Điều khoản quyền và nghĩa vụ chung; câu "thời gian giữ chức vụ là 05 năm" nếu theo quy chế (không chắc → T4) |
| Cuối | Người ký và chức danh người ký **chỉ khi đổi theo văn bản**; "Nơi nhận: ông/bà …" | "Nơi nhận: Như Điều 3; Lưu: VT, TCCB"; chức danh người ký cố định |

## 3. Chọn trường hay trường bổ sung
- Có trường đúng nghĩa trong `fields` → `field_code`. Ưu tiên trường của **nhóm loại quyết định** cho giá trị đích của quyết định. Ví dụ: "bổ nhiệm lại chức vụ …" → trường chức danh/chức vụ **mới** của loại quyết định, không lấy chức danh hiện tại trong hồ sơ, vì hồ sơ có thể chưa cập nhật.
- Không có trường → `gaps` với `label` tiếng Việt ngắn, rõ, viết hoa chữ đầu câu. Studio sinh key từ nhãn này, Claude tạo trường bổ sung trên EasyHRM:
  - T1 dữ liệu có trong hồ sơ nhưng danh mục thiếu trường (ví dụ "Số tài khoản ngân hàng")
  - T2 nhập mỗi lần lập văn bản (ví dụ "Chức vụ bổ nhiệm lại", "Địa điểm làm việc", "Lý do điều chuyển")
  - T3 cần tính hoặc ghép chuỗi (ví dụ "Lương bằng chữ", "Tổng thu nhập")
  - T4 không chắc là tham số → để người dùng quyết
- Đặt tên nhãn **không trùng nghĩa** với trường có sẵn và **không trùng nhau** giữa các chỗ khác nghĩa ("Chức vụ cũ", "Chức vụ mới").

## 4. Chỗ Studio hay sót → `add_candidates`
- Giá trị mẫu điền sẵn không có dấu chấm: "Phó Trưởng khoa", "Khoa Răng Hàm Mặt", "Bác sĩ hạng III", "05 năm", "hệ số 0,3", "Hà Nội".
- Ngày, số tiền, hệ số đã bị che thành nhãn (`[ngày]`, `[số tiền]`, `[tên người]`): dùng đúng nhãn đó làm `match`, kèm `occurrence` khi đoạn có nhiều nhãn giống nhau.
- Chỉ chọn **đúng cụm giá trị**, không kèm từ dẫn ("chức vụ", "ông/bà").

## 5. Thông tin mẫu (`doc_meta`)
- `doc_type` theo tiêu đề in hoa đầu văn bản.
- `decision_type`: chọn trong `decision_types` theo nội dung "Về việc …", không theo tên tệp. Ví dụ "điều động người lao động" → "Quyết định điều động, kiêm nhiệm"; "nâng bậc lương" → "Quyết định điều chỉnh lương".
- `template_name`: tên ngắn, rõ, bỏ "STT 05 -" và "_mau". Giữ hậu tố đơn vị nếu người dùng đặt.
- Hợp đồng: `contract_class` (xác định / không xác định / thử việc / cộng tác viên), `term_months` khi thời hạn **cố định trong mẫu**. Thời hạn để trống ("… tháng") → không gửi `term_months`, và đưa chỗ đó thành tham số.

## 6. Tự kiểm trước khi gửi
- Mọi chỗ còn giá trị thật (tên, ngày cụ thể, số tiền) đều đã có hướng xử lý: tham số hoặc Bỏ.
- Không có candidate nào còn "chờ" mà không có đề xuất. Nếu có, người dùng sẽ phải tự xử lý.
- Ngày trong "Căn cứ" pháp lý → Bỏ.
