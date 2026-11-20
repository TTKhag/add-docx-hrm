# Nạp tệp .docx đã chèn key vào EasyHRM (không cần người dùng)

Tệp lấy từ **gói giao việc** Studio lưu lúc người dùng bấm Duyệt (`getHandoff(id)` → `name`, `size`, `sha256`, `version`, `mirrored_path`). Gói không bị xoá khi phiên mở lại, nên nếu phiên Đã duyệt thì luôn có tệp. Thử lần lượt; dùng được cách nào thì giữ cách đó cho cả lô.

## Cách A — cầu nối postMessage (khuyên dùng, cùng trình duyệt)
Chạy JavaScript **trong tab EasyHRM**, thay `<STUDIO>` bằng địa chỉ Studio, ví dụ `https://ttkhag.github.io/add-docx-hrm/`:
```js
window.__tstudio = null;
window.addEventListener('message', (e) => {
  if (e.origin === 'https://ttkhag.github.io' && e.data && e.data.type === 'tstudio-file') window.__tstudio = e.data;
});
window.open('<STUDIO>#/cau-noi/<session_id>', 'tstudio-cau-noi');
```
Trang cầu nối đọc gói giao việc, gửi tệp về đúng domain dự án rồi tự đóng. Chờ 2–3 giây, kiểm tra `window.__tstudio && window.__tstudio.size === <size>`.
Trang cầu nối báo "Phiên chưa được duyệt"/"không có phiên" → Studio trong trình duyệt này không có dữ liệu → sang cách C. Popup bị chặn → cách B.

## Cách B — đọc theo đoạn (tệp ≤ 150 KB)
1. Trong tab Studio: `await TemplateStudio.getOutputFile(id, 0, 200000)`. Lặp với `offset` tăng dần tới khi `done`.
2. Trong tab EasyHRM: `window.__tsParts = []`, rồi `window.__tsParts.push("<base64>")` cho từng đoạn.
3. Ghép: `const bytes = Uint8Array.from(atob(window.__tsParts.join('')), c => c.charCodeAt(0));` → `window.__tstudio = { name, buffer: bytes.buffer, size: bytes.length }`.

## Cách C — thư mục giao việc trên máy (Studio ở trình duyệt khác)
Người dùng đã chọn thư mục giao việc thì mỗi gói có bản trên máy: `<thư mục>/EasyHRM-Studio/<dự án>/<thứ tự>-<mã phiên>/<tệp>_TenKey.docx` + `job.json`, và danh sách `EasyHRM-Studio/hang-doi.json` (mỗi phiên một dòng: `session_id, path, size, sha256, version`).
1. Đọc `hang-doi.json` bằng quyền truy cập thư mục của Claude desktop (nếu chưa có, xin quyền đúng thư mục đó). Lấy dòng có `session_id` cần làm; đọc `job.json` cùng thư mục để có `hrm_job` (thay cho `getTask`).
2. Kiểm `sha256` của tệp khớp `job.json`. Không khớp → dừng phiên đó (`dung_giua_chung`).
3. Đưa tệp vào tab EasyHRM:
   - Có shell trên máy người dùng: phục vụ thư mục của gói bằng một máy chủ cục bộ tạm (chỉ `127.0.0.1`, chỉ thư mục đó, trả `Access-Control-Allow-Origin: <domain EasyHRM>` và `Access-Control-Allow-Private-Network: true`), trong tab EasyHRM `fetch('http://127.0.0.1:<cổng>/<tệp>')` → `window.__tstudio = { name, buffer: await r.arrayBuffer(), size }`. Tắt máy chủ ngay sau khi nạp.
   - Không có shell: đọc tệp thành base64 và đẩy vào tab EasyHRM như cách B bước 2–3.
4. Không có `hrm_job` của phiên trong cả Studio lẫn thư mục → báo người dùng mở Studio trong cùng trình duyệt với Claude.

## Gắn tệp vào ô "Chọn tệp tin mẫu"
Với quyết định: **chọn Loại quyết định trước** khi gắn tệp (đổi loại sau sẽ xoá ánh xạ).
```js
const d = window.__tstudio;
const file = new File([d.buffer], d.name, { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
const input = [...document.querySelectorAll('input[type=file]')].find((i) => !i.disabled && (!i.accept || /docx|word/.test(i.accept)));
const dt = new DataTransfer(); dt.items.add(file); input.files = dt.files;
input.dispatchEvent(new Event('change', { bubbles: true }));
input.files[0].size
```
Kiểm tra: tên tệp hiện dưới ô "Tệp word mẫu", và bảng tham số liệt kê đủ các key trong `hrm_job.mapping` + `extra_fields`.
- Không có tham số nào → tệp sai hoặc không nạp được: thử lại một lần, rồi sang cách D.

## Cách D — nhờ người dùng (cuối cùng)
Nhắn một dòng: "Không tự nạp được tệp. Bạn bấm **Chọn tệp tin mẫu** và chọn `<mirrored_path>`" (nếu có thư mục giao việc), hoặc "bấm **Tải .docx** trên Studio (phiên …) rồi chọn tệp đó". Ghi vào `user_steps`.
