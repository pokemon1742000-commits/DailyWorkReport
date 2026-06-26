# Tổng hợp dữ liệu và các phần đã sửa

File này ghi lại cách phần mềm hiểu dữ liệu nhập vào, các quy tắc bóc tách, và những phần đã sửa trong quá trình phát triển.

## 1. Mục tiêu phần mềm

Phần mềm dùng để nhập báo cáo công việc hằng ngày dạng copy/paste tự do, sau đó tự bóc tách thành dữ liệu chuẩn:

- Mã dự án
- Nội dung công việc
- Thời gian
- Người thực hiện
- Trạng thái
- Ngày thực hiện
- Thư mục ảnh/tài liệu

Dữ liệu sau khi chuẩn hóa được dùng để:

- Tạo folder ảnh/tài liệu theo ngày và người thực hiện.
- Lưu SQLite để tìm kiếm và tổng hợp.
- Render bảng chuẩn hóa để sửa nhanh trước khi lưu.
- Xuất báo cáo tuần Excel.
- Thêm dữ liệu vào file Excel setup máy cho khách hàng.

## 2. Các phần đã sửa chính

### 2.1. Bóc tách mã dự án

Đã sửa để nhận diện mã dự án tốt hơn:

- Không phân biệt chữ hoa/chữ thường: `mec`, `Mec`, `MEC`, `autm`, `Autm`, `AUTM`.
- Nhận mã có khoảng trắng: `Mec 2601043` -> `MEC2601043`.
- Nhận mã có dấu `:`: `AUTM:2602E8, 2602E9` -> `AUTM2602E8`, `AUTM2602E9`.
- Nhận mã rút gọn cùng prefix: `MEC2601044,45` -> `MEC2601044`, `MEC2601045`.
- Không sinh mã ảo không có trong input, ví dụ không được tự tạo `AUTM262602`.
- Một block có nhiều mã dự án phải render đủ từng dự án, không chỉ lấy dự án đầu tiên.

### 2.2. Bóc tách theo số thứ tự 1-5

Đã sửa để ưu tiên số thứ tự làm key khi form nhập liệu phức tạp:

| STT | Ý nghĩa |
| --- | --- |
| 1 | Mã dự án |
| 2 | Nội dung công việc |
| 3 | Người thực hiện |
| 4 | Trạng thái |
| 5 | Ngày thực hiện |

Các dạng `4:` cũng được nhận như `4.` hoặc `4)`.

Nếu có nhiều block `1-4` rồi ngày nằm ở cuối, ngày cuối cùng được dùng chung cho các block trước đó.

### 2.3. Bóc tách thời gian

Đã sửa lỗi mất số đầu thời gian:

- Sai cũ: `8:15 - 18:30` bị thành `:15 - 18:30`.
- Đúng mới: giữ nguyên `8:15 - 18:30`.

Đã sửa lỗi thời gian của block sau bị gộp nhầm vào block trước. Ví dụ:

- `MEC2601042`, `MEC2601043`: thời gian `9:00 - 15:30`
- `AUTM260217`: thời gian `15:30 - 16:30`

Không được gộp hai mốc thời gian này vào cùng một dự án.

### 2.4. Nội dung công việc

Nội dung công việc thường nằm ở mục `2`, nhưng cũng có thể lấy thêm từ mục trạng thái nếu trong trạng thái có mô tả công việc.

Khi lấy nội dung từ trạng thái, phần mềm bỏ các từ báo trạng thái như:

- `đang`
- `đã`
- `sẽ`
- `xong`
- `hoàn thành`
- `%`
- `chưa`

Nhưng không được bỏ toàn bộ câu nếu câu có nội dung công việc thật.

Nội dung công việc không được chứa text nhãn như:

- `trạng thái`
- `thực trạng`
- `tình trạng`

### 2.5. Trạng thái

Trạng thái không chỉ ghi mỗi `hoàn thành` hoặc `%`, mà cần giữ ngữ cảnh:

- `Bắn panel và gá thiết bị tủ chính và tủ phụ - hoàn thành`
  -> trạng thái: `Bắn panel và gá thiết bị tủ chính và tủ phụ hoàn thành`
- `Đấu tủ chính -30%`
  -> trạng thái: `Đấu tủ chính 30%`

Nếu trạng thái chỉ là `100%` và block có một nội dung công việc, phần mềm ghép thành:

`<nội dung công việc> 100%`

### 2.6. Người thực hiện

Đã sửa để làm sạch tên người:

- Bỏ `@`
- Bỏ dấu `-` đầu dòng
- Bỏ ký tự đặc biệt không cần thiết
- Chuẩn hóa viết hoa tên

Ví dụ:

- `Tân, @Nguyễn Quang Hiếu` -> `Tân, Nguyễn Quang Hiếu`
- `@E Hùng Lắp Ráp và @Tân a7` -> `E Hùng Lắp Ráp, Tân A7`

Danh sách thành viên trong cài đặt được dùng để gợi ý tên gần đúng. Chỉ hiện tên có độ trùng nhiều, không hiện toàn bộ danh sách.

### 2.7. Folder ảnh/tài liệu

Đã sửa:

- Nhiều người cùng làm một báo cáo chỉ tạo một folder chung.
- Folder ngày dạng `YYYYMonthDD`, ví dụ `2026June11`.
- Folder người bỏ dấu tiếng Việt và bỏ ký tự đặc biệt.
- Thư mục gốc đã chọn được ghi nhớ.
- Khi mở app, ô nhập báo cáo được clear.
- Bảng cấu trúc thư mục hiển thị theo đúng thư mục gốc đã chọn.
- Cấu trúc thư mục có thể đóng/mở bằng mũi tam giác.
- Có icon ghim để cố định/ẩn bảng cấu trúc thư mục.
- Có nút copy đường dẫn trong folder-row.

### 2.8. SQLite và tìm kiếm

Đã sửa:

- Lưu dữ liệu vào SQLite.
- Mỗi bản ghi mới có index tăng dần, không ghi đè bản ghi cũ cùng mã dự án.
- Tìm kiếm theo mã dự án, ngày, người thực hiện, nội dung, trạng thái, thời gian.
- Khi xóa ở trang tìm kiếm, xóa cả SQLite và JSON.
- Có popup xác nhận trước khi xóa.
- Xóa ô tìm kiếm không tự hiện lại toàn bộ dữ liệu ngoài ý muốn.
- Tìm kiếm theo ngày đã được sửa.

### 2.9. Bảng chuẩn hóa

Đã sửa:

- Cho phép sửa nhanh mã dự án, nội dung công việc, trạng thái.
- Người thực hiện có thể chọn lại theo danh sách thành viên.
- Nếu mã dự án không có trong file tham khảo, STT được bôi vàng.
- Có gợi ý mã dự án gần giống.
- Sau khi sửa mã, tên máy và ghi chú được cập nhật theo file tham khảo.
- Nhấn chuột phải vào bất kỳ cột nào của một hàng đều mở Detail đúng dự án đó.
- Detail phải dùng đúng mã dự án đã sửa, không dùng mã gần giống sai.

### 2.10. Báo cáo tuần

Đã sửa và bổ sung:

- Thêm trang báo cáo tuần.
- Chọn khoảng ngày từ ngày đến ngày.
- Không cho phép ngày đến nhỏ hơn ngày bắt đầu.
- Bảng xem trước giống Excel.
- Có thể kéo rộng cột, kéo cao hàng.
- Ctrl + cuộn chuột để zoom bảng.
- Dữ liệu trong bảng báo cáo tuần được giữ lại sau khi tắt phần mềm.
- Khi đổi khoảng ngày, chỉ hiện dự án thuộc khoảng ngày đó.
- Text đã nhập cho dự án trong khoảng ngày cũ được giữ lại khi quay lại đúng khoảng ngày đó.
- Nếu khoảng ngày không có dự án thì không hiển thị dự án cũ.
- Nếu ô Excel trống khi xuất thì ghi `N/A`.

Hạng mục báo cáo tuần hiện tại:

1. `Lắp máy mới`
2. `Chỉnh máy`
3. `Lắp đặt tại line`
4. `Sửa máy`
5. `Hỗ trợ`

Màu hạng mục:

- `Lắp máy mới`: xanh dương
- `Chỉnh máy`: vàng
- `Lắp đặt tại line`: cam
- `Sửa máy`: đỏ
- `Hỗ trợ`: xám

### 2.11. Tiến độ công việc trong báo cáo tuần

Đã thêm menu chọn tiến độ dạng menu con:

- `%` mở menu phần trăm khi rê chuột vào.
- Cho phép nhập số phần trăm.
- Có các mức `5%`, `10%`, ..., `100%`.
- Có trạng thái:
  - `Hoàn thành`
  - `Đang thực hiện`
  - `Bắt đầu làm.`
  - `Tạm dừng`
  - `Đang xử lý`
  - `Hoàn thiện`
  - `Chờ`

### 2.12. Xuất báo cáo tuần Excel

Đã sửa:

- Tạo file Excel mới theo format yêu cầu.
- Có logo Meiko Automation.
- Tiêu đề đỏ, font Times New Roman.
- Hình ảnh chi tiết nằm trong cùng một sheet.
- Nhóm ảnh theo dự án.
- Ảnh chưa phân nhóm nằm phía trên.
- Nhóm không có ảnh thì không xuất.
- Nếu file trùng tên thì tự tạo tên mới phù hợp.

### 2.13. Thêm vào Excel setup

Nút `Thêm vào Excel setup` dùng để ghi dữ liệu từ bảng báo cáo tuần vào file:

`Theo dõi setup máy cho khách hàng.xlsx`

Quy tắc hiện tại:

- Thêm vào cùng một file Excel, không tạo file mới mỗi lần.
- Nếu file chưa có thì tạo từ template nội bộ trong `reference_files`.
- Nếu file đang mở trong Microsoft Excel, vẫn có thể ghi bằng cơ chế Excel COM.
- Thêm logo `meiko-automation-logo.png` nếu file chưa có logo.
- Đổi tên cột `Khó khăn sự cố` thành `Nội Dung`.
- Thêm cột `Ghi chú` để ghi tên máy.
- Mã dự án ghi vào cột `Mã thiết bị`.
- Loại máy lấy từ file tham khảo theo mã dự án.
- Tên máy ghi vào cột `Ghi chú`.
- Ngày làm lấy từ Detail/ngày thực hiện của báo cáo, không lấy ngày chọn tuần.
- Nếu một dự án có nhiều ngày làm thì có nhiều dòng trong cùng nhóm dự án.
- Nếu dự án đã có trong file setup thì chèn thêm dòng vào đúng nhóm dự án đó.
- STT dựa trên số mã máy hiển thị, mỗi dự án một STT.
- Với tag `Sửa máy`: tìm đúng mã dự án và nhập nội dung từ detail vào cột `Nội Dung`.
- Với tag `Lắp đặt tại line`: ghi nội dung cố định:

```text
1. Lắp đặt tại line
2. Hiệu chỉnh máy
```

- Nếu một dự án có hai lần `Lắp đặt tại line`, chỉ lấy một lần đầu.
- Tag `Lắp máy mới` bị bỏ qua, không thêm vào Excel setup.

### 2.14. File tham khảo máy

File tham khảo dùng sheet `Danh sách máy`.

Theo mã dự án:

- Cột `MKACの管理  コード Số quản lý MKAC` dùng để tìm mã dự án.
- Cột `設備  Type` dùng để lấy tên/loại máy theo yêu cầu.

Dữ liệu này dùng cho:

- Cột `Tên máy` trong báo cáo tuần.
- Cột `Ghi chú` trong báo cáo tuần.
- Cột `Loại máy` và `Ghi chú` khi thêm vào Excel setup.

### 2.15. Update phần mềm

Đã sửa:

- Có nút thông tin `i` cạnh cài đặt.
- Popup thông tin hiển thị tên phần mềm, version, changelog, GitHub.
- Nút Update lấy bản mới từ GitHub Releases.
- Bản `v1.3.4` đã được commit, build NSIS installer và upload GitHub Release.

Release hiện tại:

`v1.3.4`

## 3. Nguyên tắc quan trọng

- Không sinh mã dự án ảo.
- Ưu tiên tách theo số thứ tự 1-5 nếu input có form đánh số.
- Nếu có nhiều block dự án, phải tách từng block từ trên xuống dưới.
- Nếu thiếu ngày ở block trước nhưng ngày nằm cuối input, dùng ngày cuối cho các block trước.
- Không để nội dung công việc hoặc trạng thái chứa text nhãn `trạng thái`.
- Không cắt mất thời gian.
- Không ghi đè bản ghi SQLite cũ.
- Bảng báo cáo tuần phải giữ text người dùng đã nhập theo đúng khoảng ngày.
- Excel setup chỉ lấy `Lắp đặt tại line` và `Sửa máy`, bỏ qua `Lắp máy mới`.
