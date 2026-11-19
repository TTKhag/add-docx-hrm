# EasyHRM Template Studio (add-docx-hrm)

Trang làm việc chạy trên GitHub Pages để biến một Hợp đồng / Phụ lục / Thanh lý / Quyết định `.docx` thành **mẫu EasyHRM có key `{{TenKey}}`**, kèm bộ skill để Claude đề xuất ghép trường và thao tác trên EasyHRM bằng phiên đăng nhập của người dùng.

- Studio giữ toàn bộ logic (dò chỗ cần điền, sinh key, kiểm lỗi, danh mục trường, lịch sử) và **dùng được cả khi không có Claude**.
- Claude kết nối qua trình duyệt (Claude in Chrome / trình duyệt của Claude desktop), **không cần API key**.
- Không có server: mọi dữ liệu nằm trong IndexedDB của trình duyệt.
- Căn cứ hành vi EasyHRM: tri-thuc-easyhrm v2.5.39 (trang `hop-dong-loai-hop-dong-mau-nguoi-ky`, `thiet-lap-quyet-dinh`).

## v2 — tự động hoá tối đa

Người dùng chỉ **đọc lại, duyệt, giao việc**. Bản phân tích nghiệp vụ: [`docs/BA-v2-tu-dong-hoa.md`](docs/BA-v2-tu-dong-hoa.md).

1. **Tải văn bản**: thả một hoặc nhiều `.docx`. Studio tự nhận loại văn bản, loại quyết định, tên mẫu, phân loại/thời hạn hợp đồng, khối chữ ký, và chế độ (tệp chưa có key / **tệp đã có key**). Thứ tự chọn tệp là thứ tự hàng đợi.
2. **Giao Claude phân tích**: Claude đọc **toàn văn đã che dữ liệu cá nhân**, đề xuất trường, **thêm chỗ Studio dò sót**, đặt tên **trường giá trị bổ sung** cho chỗ không có trường, đề xuất Bỏ phần cố định (căn cứ pháp lý…).
3. **Duyệt toàn bộ đề xuất**: một nút cho mỗi phiên, hoặc tick nhiều phiên ở danh sách. Bản xem trước hiển thị **giống Word** (docx-preview).
4. **Giao Claude tạo trên EasyHRM**: câu lệnh chép sẵn có câu đồng ý Lưu. Claude làm lần lượt từng phiên: mở dự án (dùng phiên đăng nhập đã lưu), tạo mẫu, **tự nạp tệp** (cầu nối `#/cau-noi/:id` hoặc đọc theo đoạn), ghép trường, tạo trường bổ sung, người ký, vị trí ký, Lưu, kiểm tra, báo cáo.

## Chức năng

| Màn | Đường dẫn | Làm gì |
| --- | --- | --- |
| Phiên làm việc | `#/` | Danh sách phiên, lọc theo trạng thái, thống kê |
| Tải văn bản | `#/phien/moi` | Chọn nhiều `.docx`, Studio tự nhận loại/tên/chế độ, đọc và dò chỗ cần điền |
| Phiên | `#/phien/:id` | Xem trước, bảng ghép, duyệt, tham số thiếu, tải `.docx` có key |
| Khung cho AI | `#/phien/:id/ai` | Phiếu việc JSON (đã che dữ liệu cá nhân), ô dán kết quả AI |
| Kết quả EasyHRM | `#/phien/:id/ket-qua` | Báo cáo Claude ghi sau khi tạo mẫu |
| Nhật ký | `#/phien/:id/nhat-ky` | Ai (AI / người dùng / hệ thống) làm gì, lúc nào |
| Hồ sơ dự án | `#/du-an` | Link dự án, MST, Tài khoản, phiên bản EasyHRM, người ký hợp đồng mặc định; chọn dự án hiện tại; xuất JSON |
| Cầu nối tệp | `#/cau-noi/:id` | Trang EasyHRM (Claude điều khiển) mở trang này để nhận tệp đã duyệt qua `postMessage`, chỉ gửi tới đúng domain dự án |
| Danh mục trường | `#/danh-muc` | Danh mục "Trường lấy giá trị" theo phiên bản × loại mẫu; nhập / đồng bộ JSON, xem khác biệt |
| Cài vào Claude | `#/claude` | Tải skill `.zip`, hướng dẫn cài, kiểm tra kết nối / phiên bản |
| Sao lưu | `#/sao-luu` | Xuất / khôi phục toàn bộ dữ liệu, xóa toàn bộ |

### Quy tắc key `{{TenKey}}`

Chữ Latin không dấu viết liền, viết hoa chữ đầu mỗi từ, chỉ chữ và số, bắt đầu bằng chữ hoa, 2–50 ký tự (`^[A-Z][A-Za-z0-9]{1,49}$`). "Họ và tên" → `HoVaTen`, "Số CCCD" → `SoCCCD`. Cùng trường → cùng key; trùng key khác trường → thêm hậu tố nhóm. Key được ghi trong **một** đoạn chữ liền (không bị Word chẻ) và Studio kiểm lại sau khi xuất.

### Vòng đời phiên

`Nháp → Chờ AI → Chờ duyệt → Đã duyệt → Đang tạo trên HRM → Đã tạo, chờ bật → Hoàn tất` (+ `Dừng giữa chừng`). Claude chỉ được sang EasyHRM khi phiên **Đã duyệt** (`startHrm` bị từ chối nếu chưa).

### Đăng nhập EasyHRM

Studio lưu Link, MST, Tài khoản. **Không lưu mật khẩu** (trang tĩnh, IndexedDB không mã hoá) và Claude **không gõ mật khẩu** (giới hạn cố định của Claude). Người dùng **đăng nhập một lần** trong trình duyệt Claude dùng; phiên được giữ, các lần sau Claude làm thẳng. Hết phiên: Claude điền MST + tài khoản, người dùng bấm Đăng nhập (trình duyệt tự điền mật khẩu).

### Danh mục trường

Danh mục tạo sẵn là **bản mẫu** (`verified = false`) — nhóm trường theo tri-thức, tên trường là giả định. Trước khi tạo mẫu thật, đồng bộ danh mục từ EasyHRM (Claude đọc danh sách "Trường lấy giá trị" rồi gọi `submitCatalog`, hoặc dán JSON ở màn Danh mục trường).

## Kết nối với Claude

`window.TemplateStudio` (giao thức `tstudio/1`, skill 2.0.0): `listForAi`, `listQueue`, `getTask`, `getStatus`, `submitProposal`, `startHrm`, `getOutputFile`, `submitHrmReport`, `submitCatalog`, `reportSkillVersion`, `listSessions`. Mọi dữ liệu Claude gửi được kiểm bằng Zod và quy tắc nghiệp vụ; AI không bao giờ tự duyệt. Chi tiết: `skill/easyhrm-template-studio/references/studio-protocol.md`.

Bộ skill nằm ở `skill/easyhrm-template-studio/` (SKILL.md + references). `npm run skill` đóng gói thành `public/skill/easyhrm-template-studio-<version>.zip` (thư mục gốc trong zip là tên skill — đúng cấu trúc Claude yêu cầu). Phiên bản và giao thức đặt ở `skill/skill-meta.json`; script kiểm SKILL.md khớp với file này.

## Cấu trúc thư mục

```
src/
  app/                 # shell, router (HashRouter), layout sidebar, window.TemplateStudio
  db/                  # Dexie schema (v2, có migration từ v1), types, repositories
  modules/
    projects/          # Hồ sơ dự án (validate MST/URL, workflow, trang)
    sessions/          # docx đọc/dò/ghi/kiểm, TenKey, che dữ liệu, gợi ý, bảng ghép, trang phiên
    catalog/           # danh mục trường, nhập/đồng bộ, diff
    agent/             # giao thức Claude ↔ Studio, Khung cho AI
    skill/             # màn Cài vào Claude
    backup/            # sao lưu / khôi phục
  shared/              # components (Prinstream), toast, utils
  test/                # setup + tạo .docx giả cho test
skill/                 # bộ skill cho Claude + skill-meta.json
scripts/build-skill.mjs
```

Quy ước: component → hook → service → repository; module dùng nhau qua `index.ts`; service thuần, test được không cần trình duyệt.

## Chạy trên máy

```bash
npm ci
npm run dev          # đóng gói skill rồi chạy Vite
npm test -- --run    # 66 unit test (docx, TenKey, dò, che toàn văn, tự nhận loại, ghép, giao thức v2, hàng đợi, nạp tệp, luồng end-to-end, sao lưu, popup)
npm run typecheck
npm run build        # dist/ gồm cả dist/skill/*.zip
npm run preview
```

## Triển khai GitHub Pages

1. Tạo repo tên **`add-docx-hrm`** (nếu đổi tên, sửa `base` trong `vite.config.ts` thành `/<tên-repo>/`).
2. Đẩy mã lên nhánh `main`.
3. Repo → **Settings → Pages → Source = GitHub Actions**.
4. Workflow `.github/workflows/deploy.yml` chạy typecheck, test, build và deploy. Địa chỉ: `https://<tài-khoản>.github.io/add-docx-hrm/`.
5. Khuyến nghị: dùng tên miền riêng hoặc một tài khoản/tổ chức GitHub chỉ cho Studio — mọi trang `<tài-khoản>.github.io` dùng chung kho lưu trữ trình duyệt.

## Sao lưu dữ liệu

Màn **Sao lưu → Xuất sao lưu** tải một tệp JSON gồm mọi bảng và file `.docx` (base64). **Khôi phục** thay toàn bộ dữ liệu hiện tại (kiểm định dạng bằng Zod, chặn tệp từ phiên bản Studio mới hơn). Tệp sao lưu có thể chứa dữ liệu cá nhân trong file gốc — cất như tài liệu nội bộ.

## Giới hạn đã biết

- Đọc `.docx` chạy trên luồng chính (Web Worker không có `DOMParser`); file ≤ 30 trang đọc dưới 1 giây.
- Dò chỗ cần điền bằng quy tắc: chỗ trống (`……`, `____`, `[…]`), ngày, số tiền, số giấy tờ, số điện thoại, tên người sau "Ông/Bà", key có sẵn. Chỗ quy tắc bỏ sót, Claude chỉ báo (`extra_candidates`) để người dùng xem — chưa có thao tác thêm dòng thủ công.
- Tải file vào EasyHRM và kéo vị trí ký phụ thuộc khả năng của trình duyệt Claude — skill có phương án để người dùng làm thay bước đó.
