# Nạp tệp .docx đã chèn key vào EasyHRM (không cần người dùng)

Tệp nằm trong Studio (IndexedDB của trang `ttkhag.github.io`), còn EasyHRM ở domain khác. Thử lần lượt các cách dưới đây. Dùng được cách nào thì giữ cách đó cho cả lô.

Thông tin tệp cần nạp nằm trong `hrm_job.file`: `name`, `size`, `sha256`.

## Cách A — cầu nối postMessage (khuyên dùng)
Chạy JavaScript **trong tab EasyHRM**, thay `<STUDIO>` bằng địa chỉ Studio trong câu lệnh, ví dụ `https://ttkhag.github.io/add-docx-hrm/`:
```js
window.__tstudio = null;
window.addEventListener('message', (e) => {
  if (e.origin === 'https://ttkhag.github.io' && e.data && e.data.type === 'tstudio-file') window.__tstudio = e.data;
});
window.open('<STUDIO>#/cau-noi/<session_id>', 'tstudio-cau-noi');
```
Trang cầu nối mở tab Studio, gửi tệp về đúng domain dự án rồi tự đóng. Chờ 2–3 giây, rồi kiểm tra `window.__tstudio && window.__tstudio.size === hrm_job.file.size`.
Popup bị chặn hoặc không nhận được tệp → sang cách B.

## Cách B — đọc theo đoạn (tệp ≤ 150 KB)
1. Trong tab Studio: `await TemplateStudio.getOutputFile(id, 0, 200000)`. Lặp với `offset` tăng dần tới khi `done`.
2. Trong tab EasyHRM: `window.__tsParts = []`, rồi `window.__tsParts.push("<base64>")` cho từng đoạn.
3. Ghép: `const bytes = Uint8Array.from(atob(window.__tsParts.join('')), c => c.charCodeAt(0));` → `window.__tstudio = { name: hrm_job.file.name, buffer: bytes.buffer, size: bytes.length }`.

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
- Không có tham số nào → tệp sai hoặc không nạp được: thử lại một lần, rồi sang cách C.

## Cách C — nhờ người dùng (cuối cùng)
Nhắn một dòng: "Không tự nạp được tệp. Bạn bấm **Tải .docx** trên Studio (phiên …) rồi chọn tệp ở ô **Chọn tệp tin mẫu** giúp mình." Ghi vào `user_steps`.
