# Đăng nhập EasyHRM: dùng phiên đã lưu

Studio **không lưu mật khẩu**. Claude **không gõ mật khẩu**, kể cả khi người dùng cho phép. Đây là giới hạn cố định của Claude. Đăng nhập dựa vào **phiên đăng nhập đã lưu** trong trình duyệt Claude đang dùng: người dùng đăng nhập một lần, các lần sau Claude làm thẳng.

1. Mở `project.url` trong tab mới, cùng trình duyệt với Studio.
2. **Đã vào trang chủ** (thấy menu, tên người dùng) → đối chiếu rồi làm tiếp, **không hỏi gì**:
   - domain của tab phải trùng `project.url`;
   - nếu `project.username` khác tài khoản đang hiển thị mà không xác định được → ghi chú vào `steps`, vẫn làm tiếp nếu domain đúng. Domain sai → dừng cả lô.
3. **Gặp form đăng nhập** (hết phiên, hoặc lần đầu):
   - Ô MST / mã đơn vị (nếu có) → điền `project.mst`.
   - Ô tài khoản → điền `project.username`.
   - Ô mật khẩu → **không chạm**, kể cả khi trình duyệt đã tự điền.
   - Nhắn người dùng **một dòng**: "EasyHRM hết phiên đăng nhập. Mình đã điền sẵn MST và tài khoản, bạn bấm **Đăng nhập** giúp (trình duyệt tự điền mật khẩu). Xong mình làm tiếp cả lô." Rồi chờ.
   - Người dùng báo xong → kiểm tra đã vào trang chủ, rồi tiếp tục **từ phiên đang dở**.

| Tình huống | Làm gì |
| --- | --- |
| Link không mở được, hoặc không phải EasyHRM | Dừng, báo link sai. Không tự tìm trang khác |
| Đăng nhập báo sai | Dừng sau 1 lần, chép nguyên văn thông báo, đề nghị kiểm MST/tài khoản trên Studio |
| Yêu cầu mã xác thực / đổi mật khẩu | Người dùng tự làm, Claude chờ |
| Hết phiên giữa chừng | Làm lại bước 3 rồi tiếp tục. Trước khi làm lại một phiên dở, **kiểm tra danh sách** xem mẫu đã được lưu chưa |
