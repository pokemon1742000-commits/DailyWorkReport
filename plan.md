# Kế hoạch cải tiến Daily Work Report

## Context

Phần mềm hiện đã có các luồng chính: chuẩn hóa báo cáo, tạo cấu trúc thư mục ảnh/tài liệu, lưu SQLite/JSON, tìm kiếm/xóa, backup SQLite hoặc Google Sheet, tự chuyển ảnh Zalo, xuất Excel và tự cập nhật từ GitHub. Tuy nhiên phần lớn logic đang tập trung trong hai file rất lớn là `main.js` và `index.html`, chưa có bộ test tự động, và các lỗi gần đây liên quan đến đường dẫn thư mục và updater cho thấy cần ưu tiên độ tin cậy trước khi bổ sung nhiều tính năng mới.

Mục tiêu của kế hoạch này là giảm lỗi mất dữ liệu/không mở được thư mục/không cập nhật được, làm cho phần mềm dễ bảo trì hơn và có quy trình phát hành an toàn hơn.

## Hiện trạng và vấn đề cần cải tiến

### P0 — Cần làm trước

#### 1. Chuẩn hóa đường dẫn thư mục và mở thư mục

**Bằng chứng:**

- `main.js` tạo thư mục thật tại `save-reports`, trong khi `index.html` còn tạo đường dẫn preview riêng.
- `folder_nguoi` có thể là đường dẫn tuyệt đối hoặc tương đối tùy nguồn dữ liệu/phiên bản.
- `open-folder` cần xử lý lỗi `shell.openPath`; nếu không, Windows chỉ hiện “Windows cannot find”.

**Phương án khuyến nghị:**

- Lưu trong SQLite cả `folder_root` và `folder_nguoi` dạng tuyệt đối chuẩn hóa.
- Khi đọc dữ liệu cũ, có hàm `resolveStoredFolderPath()` xử lý tương thích: tuyệt đối dùng nguyên trạng; tương đối ghép với root hiện tại; nếu không tồn tại thì báo rõ nguyên nhân.
- Mọi nút mở thư mục dùng chung một hàm UI và một IPC handler duy nhất.
- Thêm nút “Chọn lại thư mục gốc”/“Sửa đường dẫn” khi thư mục đã bị di chuyển.

**Lợi ích:** loại bỏ lỗi đường dẫn tương đối và tương thích dữ liệu các phiên bản cũ.

#### 2. Luồng cập nhật và khóa file trên Windows

**Bằng chứng:**

- Updater có hai đường: `electron-updater` và installer fallback.
- Installer fallback phải chờ tiến trình hiện tại đóng; nếu Electron/watcher chưa thoát, NSIS báo “Daily Work Report cannot be closed”.
- Có nhiều tiến trình phụ và watcher Zalo có thể làm việc đóng ứng dụng không ổn định.

**Phương án khuyến nghị:**

- Chỉ sử dụng một chiến lược cập nhật chính: `electron-updater` cho bản cài NSIS.
- Tách updater thành module nhỏ, có state rõ ràng: checking → downloading → shutting-down → installing → finished/failed.
- Trước khi cài: dừng watcher Zalo, đóng cửa sổ, chờ PID biến mất, kiểm tra lại bằng log.
- Nếu quá thời gian: không chạy installer; hiển thị hướng dẫn đóng ứng dụng/Task Manager và đường dẫn log.
- Không tự động cài nếu phiên bản hiện tại là portable hoặc đang chạy từ `win-unpacked`; hiển thị lựa chọn tải installer.

**Lợi ích:** giảm lỗi update lặp lại và tránh trạng thái cài đặt nửa chừng.

#### 3. Backup và phục hồi dữ liệu an toàn

**Bằng chứng:**

- SQLite là nguồn đọc chính, JSON vẫn được dùng trong một số nhánh tương thích.
- Backup server mặc định bind `0.0.0.0`; token là tùy chọn và README vẫn hướng dẫn chạy không token.
- Google Sheet lưu cả JSON nhưng có thể ghi đè toàn bộ sheet.

**Phương án khuyến nghị:**

- Trước mỗi thao tác xóa/restore/ghi đè, tự tạo snapshot SQLite cục bộ có timestamp.
- Khi restore, hiển thị số bản ghi trước/sau và yêu cầu xác nhận nếu dữ liệu hiện tại sẽ bị thay thế.
- Có chức năng kiểm tra integrity SQLite và phục hồi từ snapshot gần nhất.
- Không cho phép bật server sync ngoài mạng nội bộ nếu chưa có token; cảnh báo rõ khi `SYNC_TOKEN` rỗng.
- Backup server giữ metadata hash, kích thước, phiên bản và thời điểm; thêm cơ chế giới hạn số bản backup.

**Lợi ích:** giảm rủi ro mất dữ liệu do thao tác nhầm hoặc restore lỗi.

### P1 — Nên làm tiếp theo

#### 4. Tách mã nguồn theo module

**Hiện trạng:** `main.js` và `index.html` chứa quá nhiều trách nhiệm: IPC, SQLite, updater, Excel, Zalo, parser và UI.

**Phương án:**

- `src/main/`: cửa sổ, IPC, updater, file system.
- `src/data/`: SQLite, migration, serialize/deserialize, backup.
- `src/reports/`: parser, chuẩn hóa, validation, duplicate fingerprint.
- `src/integrations/`: Google Sheet, sync server, Zalo.
- `src/ui/`: renderer modules hoặc ít nhất tách các vùng script lớn khỏi `index.html`.
- Giữ IPC là lớp giao tiếp duy nhất giữa UI và main process.

**Lợi ích:** sửa một chức năng không làm tăng rủi ro ảnh hưởng các luồng khác.

#### 5. Xây bộ test tự động tối thiểu

Hiện chưa thấy bộ test độc lập cho các luồng chính.

**Phương án khuyến nghị:** dùng Node test runner tích hợp, không cần thêm framework ban đầu.

Các nhóm test ưu tiên:

- `sanitizeFolderName`, `parseDate`, tạo tên thư mục.
- Resolve đường dẫn tuyệt đối/tương đối trên Windows.
- Duplicate fingerprint và lọc mã dự án không hợp lệ.
- Save/load/restore SQLite và migration schema.
- Phân loại bản ghi có mã/không mã dự án.
- Server sync: token, giới hạn body, upload/download/latest.
- Updater: chọn asset, so sánh version, tạo launcher.

Sau đó bổ sung smoke test chạy app unpacked: nhập dữ liệu → tạo folder → mở folder → reload → tìm kiếm → backup.

#### 6. Cải thiện trải nghiệm lưu dữ liệu

**Các điểm nên bổ sung:**

- Hiển thị tiến trình khi lưu nhiều báo cáo hoặc tạo nhiều thư mục.
- Thông báo rõ: đã lưu bao nhiêu, bỏ qua bao nhiêu bản trùng, bao nhiêu bản ghi thiếu mã.
- Cho phép mở folder ngay sau khi lưu bằng nút “Mở thư mục vừa tạo”.
- Hiển thị đường dẫn đầy đủ theo tooltip/copy button, không chỉ ellipsis.
- Cảnh báo trước khi đổi root folder nếu preview hiện tại chưa lưu.
- Nút hoàn tác cho thao tác xóa trong phiên hiện tại hoặc ít nhất yêu cầu xác nhận mạnh hơn khi xóa toàn bộ.

#### 7. Validation và chất lượng dữ liệu

- Chuẩn hóa schema báo cáo thành một hàm duy nhất dùng cho parse, save, restore và Google Sheet.
- Kiểm tra ngày hợp lệ, mã dự án, người thực hiện, nội dung trước khi tạo folder.
- Tách “giá trị hiển thị” và “giá trị lưu trữ” để không làm thay đổi mã dự án gốc ngoài ý muốn.
- Cảnh báo tên folder bị cắt/ký tự không hợp lệ.
- Định nghĩa version schema và migration thay vì chỉ kiểm tra cột SQLite rời rạc.

### P2 — Cải tiến sau khi nền tảng ổn định

#### 8. Bảo mật và phân quyền

- Tắt `nodeIntegration` và bật `contextIsolation` bằng preload API an toàn.
- Whitelist các IPC channel, validate payload ở main process.
- Không truyền URL Google Sheet/token trực tiếp qua log hoặc thông báo không cần thiết.
- Sync server mặc định bind `127.0.0.1`; chỉ bind `0.0.0.0` khi người dùng cấu hình rõ.
- Thêm rate limit cơ bản, giới hạn kích thước file và kiểm tra MIME/nội dung SQLite.
- Không dùng quyền Administrator cho toàn bộ ứng dụng nếu không thật sự cần; chỉ yêu cầu quyền khi thao tác cần thiết.

#### 9. Quản lý phiên bản và phát hành

- Thêm CI trên GitHub: syntax check, test, build unpacked và kiểm tra asset release.
- `release.js` cần dry-run đầy đủ hơn và không tự cài `gh` bằng winget nếu chưa được người dùng xác nhận.
- Kiểm tra version giữa `package.json`, `latest.yml`, installer và GitHub tag.
- Tạo release notes có cấu trúc: Added/Fixed/Changed/Breaking.
- Giữ lại manifest/checksum cho installer và file zip.

#### 10. Tìm kiếm, báo cáo và hiệu năng

- Thêm index SQLite cho `ma_du_an`, `ngay_thuc_hien`, `nguoi_text` nếu dữ liệu lớn.
- Phân trang kết quả tìm kiếm thay vì render toàn bộ bảng.
- Debounce và hủy truy vấn cũ khi người dùng gõ nhanh.
- Cho phép lọc theo khoảng ngày, trạng thái, người thực hiện và dự án.
- Cache cấu trúc folder với nút refresh thay vì quét toàn bộ mỗi lần render.

## Phương án triển khai tổng thể

### Phương án A — Sửa nhanh, ít thay đổi

- Hoàn thiện resolve đường dẫn và thông báo lỗi.
- Ổn định updater hiện tại.
- Thêm snapshot trước restore/xóa.
- Viết một số test cho các hàm thuần.

**Ưu:** nhanh, ít ảnh hưởng bản đang dùng.  
**Nhược:** vẫn còn hai file lớn, khó mở rộng lâu dài.

### Phương án B — Cân bằng, khuyến nghị

- Làm toàn bộ P0.
- Tách dần data/updater/path resolver thành module riêng.
- Thêm test unit và smoke test.
- Giữ giao diện hiện tại, không thay đổi lớn trải nghiệm người dùng.

**Ưu:** giảm lỗi thực tế nhưng vẫn kiểm soát phạm vi.  
**Nhược:** cần refactor nhiều bước và phải kiểm tra hồi quy.

### Phương án C — Tái cấu trúc lớn

- Chuyển renderer sang các file/module frontend riêng.
- Dùng preload + context isolation.
- Thiết kế lại schema/version migration và hệ thống sync.
- Thêm CI/CD, test tự động và telemetry lỗi cục bộ.

**Ưu:** nền tảng tốt cho nhiều người dùng và tính năng mới.  
**Nhược:** thời gian dài, rủi ro hồi quy cao nếu làm một lần.

## Lộ trình đề xuất

### Giai đoạn 1 — 1 đến 2 ngày

1. Hoàn thiện resolver đường dẫn tuyệt đối/tương đối.
2. Kiểm tra và sửa toàn bộ nút mở folder.
3. Ổn định shutdown/update trên Windows.
4. Thêm log lỗi updater dễ tìm.
5. Viết test cho path, date, folder name và duplicate.

### Giai đoạn 2 — 2 đến 4 ngày

1. Snapshot SQLite trước restore/xóa.
2. Bổ sung migration/schema validation.
3. Cải thiện thông báo tiến trình lưu và restore.
4. Thêm smoke test cho luồng nhập → lưu → reload → mở folder.
5. Cải thiện sync server mặc định và cảnh báo token.

### Giai đoạn 3 — 1 đến 2 tuần

1. Tách module `data`, `updater`, `filesystem`, `reports`.
2. Tách JavaScript renderer khỏi `index.html`.
3. Thêm CI build/test/release.
4. Đánh giá chuyển sang preload/context isolation.
5. Bổ sung index, phân trang và cache nếu dữ liệu thực tế tăng cao.

## Tiêu chí nghiệm thu

- 100% đường dẫn folder lưu mới mở được sau khi restart app.
- Dữ liệu folder tương đối từ phiên bản cũ vẫn được resolve hoặc báo lỗi có hướng dẫn sửa.
- Update thành công khi app đang bật watcher Zalo và không còn lỗi “cannot be closed”.
- Restore/xóa có snapshot và có thể khôi phục dữ liệu trước thao tác.
- Có test tự động cho các hàm path/parser/database quan trọng.
- Build installer mới có thể cài trên máy sạch và mở được app.
- Không làm mất dữ liệu hiện có trong SQLite, JSON hoặc Google Sheet.

## Đề xuất lựa chọn

Chọn **Phương án B — Cân bằng**. Thứ tự nên là **P0 đường dẫn + updater + backup**, sau đó **test và tách module từng phần**, cuối cùng mới thực hiện thay đổi bảo mật kiến trúc lớn như preload/context isolation. Cách này giải quyết ngay các lỗi người dùng đang gặp mà không làm gián đoạn toàn bộ phần mềm.
