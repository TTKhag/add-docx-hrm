# Đăng nhập EasyHRM

Claude **không gõ mật khẩu** — kể cả khi người dùng cho phép. Mật khẩu do trình quản lý mật khẩu của trình duyệt hoặc người dùng điền.

1. Mở `project.url`.
2. Đã vào trang chủ (thấy menu, tên đơn vị) → sang bước đối chiếu đơn vị trong SKILL.md.
3. Gặp form đăng nhập:
   - Ô MST / mã đơn vị (nếu có) → điền `project.mst`.
   - Ô tài khoản / tên đăng nhập → điền `project.username`.
   - Ô mật khẩu → **không chạm**. Nếu trình duyệt đã tự điền thì để nguyên.
   - Báo trong chat: "Đã điền tài khoản, mời bạn kiểm tra mật khẩu và bấm Đăng nhập." Rồi chờ.
4. Sau khi người dùng báo xong: kiểm tra đã vào trang chủ.

| Tình huống | Làm gì |
| --- | --- |
| Link không mở được / không phải EasyHRM | Dừng, báo Link sai; không tự tìm trang khác |
| Đăng nhập báo sai | Dừng sau 1 lần, chép nguyên văn thông báo, đề nghị kiểm MST/tài khoản trên Studio |
| Yêu cầu mã xác thực / đổi mật khẩu | Người dùng tự làm; Claude chờ |
| Hết phiên giữa chừng | Làm lại các bước trên, rồi tiếp tục từ bước đang dở |
