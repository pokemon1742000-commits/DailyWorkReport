# Kế hoạch V2: Phần mềm báo cáo công việc hằng ngày

## 1. Mục tiêu

Phần mềm dùng để nhập nhanh nội dung báo cáo công việc được copy từ bên ngoài, tự động nhận diện các trường dữ liệu, chuẩn hóa thành form thống nhất, tách theo từng dự án, tạo thư mục lưu ảnh theo ngày và người thực hiện, lưu dữ liệu vào JSON để tìm kiếm về sau, đồng thời hỗ trợ chọn một số công việc để thêm vào file Excel.

Mockup giao diện tổng quát:

![Mockup giao diện](./work-report-ui-mockup.png)

## 2. Chức năng chính

### 2.1. Màn hình nhập liệu

- Có vùng nhập văn bản lớn để dán dữ liệu copy từ bên ngoài.
- Có nút `Chọn thư mục` để chọn thư mục gốc lưu các folder ảnh/tài liệu sẽ tạo.
- Hiển thị đường dẫn thư mục đã chọn.
- Có nút `Accept / Xác nhận` để xử lý nội dung vừa nhập.
- Sau khi xác nhận, phần mềm hiển thị bảng preview dữ liệu đã chuẩn hóa.

### 2.2. Dữ liệu đầu vào cần nhận diện

Phần mềm cần nhận diện được các nhóm thông tin sau:

- `Tên dự án / Mã dự án`: có thể là một hoặc nhiều dự án, ví dụ `AUTM2602E8`, `2602E9`, `MEC2601045`.
- `Nội dung công việc`: có thể là một đoạn văn, một khoảng thời gian, hoặc nhiều gạch đầu dòng.
- `Người thực hiện`: có thể là một hoặc nhiều người, có thể có ký hiệu `@`.
- `Trạng thái máy / thực trạng`: thể hiện phần trăm hoàn thiện, việc đã xong, việc đang làm, hoặc vấn đề cần xử lý.
- `Ngày / tháng / năm`: có thể viết dạng số hoặc dạng tiếng Việt.

### 2.3. Chuẩn hóa dữ liệu sau khi nhập

Mỗi bản ghi sau khi xử lý cần có các trường:

- `ma_du_an`
- `noi_dung_cong_viec`
- `nguoi_thuc_hien`
- `trang_thai`
- `ngay_thuc_hien`
- `folder_ngay`
- `folder_nguoi`
- `raw_text`
- `created_at`

Nếu một lần nhập có nhiều dự án, phần mềm tách thành nhiều vùng, mỗi vùng tương ứng với một dự án. Nếu thông tin chung áp dụng cho nhiều dự án, phần mềm tự gán lại cho từng dự án và cho phép sửa tay ở bảng preview trước khi lưu.

### 2.4. Xử lý trường hợp ghi sai form

Phần mềm cần có bộ nhận diện linh hoạt, chấp nhận các kiểu nhập không đồng nhất:

- Có hoặc không có số thứ tự `1.`, `2.`, `3.`.
- Tên trường viết khác nhau: `mã dự án`, `tên dự án`, `nội dung`, `nội dung CV`, `thực hiện`, `người thực hiện`, `tình trạng`, `thực trạng`, `trạng thái`, `ngày thực hiện`.
- Ngày viết dạng `11/6/2026`, `thứ Năm ngày 11 tháng 06 năm 2026`, hoặc `ngày 11 tháng 6 năm 2026`.
- Tên người có ký tự `@`, dấu phẩy, chữ `và`, hoặc nằm trong câu mô tả dài.
- Mã dự án viết hoa/thường lẫn lộn, có dấu `:`, dấu `.`, dấu `,`, hoặc khoảng trắng.

Khi phần mềm không chắc chắn, dòng đó cần được đánh dấu cảnh báo trong bảng preview để người dùng kiểm tra trước khi lưu.

## 3. Giao diện sau khi bấm Accept

Sau khi bấm `Accept / Xác nhận`, phần mềm sinh ra các phần sau:

### 3.1. Bảng chuẩn hóa

- Hiển thị các dữ liệu vừa nhập theo form chuẩn.
- Nếu có 3 dự án thì chia thành 3 vùng, mỗi vùng là một dự án.
- Mỗi vùng có đủ thông tin: mã dự án, nội dung công việc, người thực hiện, trạng thái, ngày thực hiện, đường dẫn thư mục.
- Cho phép sửa tay dữ liệu trước khi lưu chính thức.
- Có checkbox ở từng công việc để chọn các dòng cần đưa sang Excel.

### 3.2. Nút thêm vào Excel

Sau khi người dùng tick ít nhất một checkbox trong bảng preview:

- Hiển thị nút `Thêm vào Excel`.
- Khi bấm nút này, phần mềm cho phép chọn file Excel.
- Sau khi chọn file Excel, phần mềm cho phép chọn sheet cần thêm dữ liệu.
- Dữ liệu được thêm vào Excel theo cấu trúc do người dùng quy định sau.
- Giai đoạn đầu chỉ cần thiết kế sẵn luồng xử lý và điểm mở rộng, chưa cần cố định cột Excel nếu chưa có mẫu chính thức.

Gợi ý dữ liệu có thể gửi sang Excel:

- Ngày thực hiện.
- Mã dự án.
- Nội dung công việc.
- Người thực hiện.
- Trạng thái.
- Đường dẫn thư mục.

## 4. Quy tắc tạo thư mục

Sau khi xác nhận và lưu:

- Tạo folder ngày theo dạng `YYYYMonthDD`, ví dụ `2026June16`.
- Nếu folder ngày đã tồn tại thì dùng lại folder cũ, không tạo trùng.
- Bên trong folder ngày, tạo folder theo tên người thực hiện.
- Tên folder người thực hiện được chuẩn hóa không dấu, viết liền, ví dụ `Lộc Milo` thành `LocMilo`, `Nguyễn Quang Hiếu` thành `NguyenQuangHieu`.
- Nếu nhiều người có cùng ngày thực hiện, tất cả nằm trong cùng folder ngày.
- Nếu cùng ngày đã có folder `2026June16`, người mới chỉ cần tạo thêm folder người đó bên trong.

Ví dụ:

```text
D:/Daily_work_report/2026June16/LocMilo
D:/Daily_work_report/2026June16/Tan
D:/Daily_work_report/2026June16/NguyenQuangHieu
```

## 5. Lưu dữ liệu JSON

Dữ liệu đã chuẩn hóa sẽ được lưu vào file `data/work_reports.json` để phục vụ tìm kiếm.

Cấu trúc gợi ý:

```json
[
  {
    "id": "2026-06-11_AUTM2602E8_001",
    "ma_du_an": "AUTM2602E8",
    "noi_dung_cong_viec": [
      "Bọc lại dây tín hiệu và nguồn kết nối máy lazer"
    ],
    "nguoi_thuc_hien": [
      "Bùi Hữu Sỹ",
      "E Hùng Lắp Ráp",
      "Tân A7"
    ],
    "trang_thai": [
      "Đã bọc xong dây kết nối LD, UL và lazer"
    ],
    "ngay_thuc_hien": "2026-06-11",
    "folder_ngay": "D:/Daily_work_report/2026June11",
    "folder_nguoi": [
      "D:/Daily_work_report/2026June11/BuiHuuSy",
      "D:/Daily_work_report/2026June11/EHungLapRap",
      "D:/Daily_work_report/2026June11/TanA7"
    ],
    "raw_text": "Nội dung gốc đã nhập",
    "excel_exported": false,
    "excel_file": null,
    "excel_sheet": null,
    "created_at": "2026-06-16T12:00:00+07:00"
  }
]
```

Khi một dòng đã được thêm vào Excel, có thể cập nhật:

- `excel_exported`: `true`
- `excel_file`: đường dẫn file Excel
- `excel_sheet`: tên sheet đã thêm

## 6. Trang tìm kiếm

Trang `Tìm kiếm` cần có:

- Ô tìm kiếm tổng hợp theo mã dự án, người thực hiện, nội dung công việc, trạng thái, ngày.
- Bộ lọc nhanh theo ngày, tháng, năm, người thực hiện, mã dự án.
- Bảng kết quả gồm mã dự án, ngày, người thực hiện, nội dung ngắn, trạng thái ngắn.
- Link hoặc nút `Mở thư mục` để mở folder đã tạo.
- Khi bấm vào một dòng kết quả, hiển thị chi tiết đầy đủ và nội dung gốc.
- Có thể lọc riêng các dòng đã thêm vào Excel hoặc chưa thêm vào Excel.

## 7. Kiến trúc đề xuất

Vì phần mềm cần chọn thư mục, tạo folder, đọc/ghi JSON, mở folder và thao tác với Excel cục bộ, nên nên làm dưới dạng ứng dụng desktop.

Đề xuất:

- Desktop shell: Electron.
- Giao diện: HTML/CSS/JavaScript hoặc React nếu muốn mở rộng lâu dài.
- Lưu trữ giai đoạn đầu: JSON.
- Xử lý Excel: thư viện `xlsx` trong Node.js.
- Về sau nếu dữ liệu lớn: nâng cấp từ JSON lên SQLite.

Các module chính:

- `InputPage`: nhập liệu, chọn thư mục, bấm xác nhận.
- `PreviewTable`: hiển thị bảng chuẩn hóa, sửa tay, checkbox chọn dòng.
- `ExcelExportPanel`: chọn file Excel, chọn sheet, thêm dữ liệu.
- `SearchPage`: tìm kiếm và mở folder.
- `reportParser`: tách raw text thành dữ liệu có cấu trúc.
- `dateNormalizer`: chuẩn hóa ngày tiếng Việt và ngày dạng số.
- `nameNormalizer`: bỏ dấu, chuẩn hóa tên hiển thị và tên folder.
- `projectNormalizer`: nhận diện và chuẩn hóa mã dự án.
- `storageService`: đọc/ghi JSON.
- `folderService`: tạo folder ngày, folder người, mở folder.
- `excelService`: đọc file Excel, lấy danh sách sheet, ghi dữ liệu vào sheet.

## 8. Luồng xử lý khi bấm Accept

1. Đọc raw text từ vùng nhập.
2. Tách các section theo số thứ tự, tiêu đề, dấu gạch đầu dòng và từ khóa.
3. Nhận diện ngày thực hiện.
4. Nhận diện mã dự án. Nếu có nhiều mã, tạo nhiều bản ghi preview.
5. Nhận diện người thực hiện và chuẩn hóa tên.
6. Tách nội dung công việc và trạng thái thành danh sách dòng.
7. Render bảng preview.
8. Cho phép người dùng sửa lại dữ liệu nếu parser nhận sai.
9. Cho phép tick checkbox các công việc cần thêm vào Excel.
10. Tạo folder ngày và folder người.
11. Lưu bản ghi vào JSON.
12. Nếu người dùng bấm `Thêm vào Excel`, chọn file Excel, chọn sheet và ghi dữ liệu.
13. Cập nhật trạng thái Excel vào JSON.
14. Cập nhật trang tìm kiếm.

## 9. Quy tắc chuẩn hóa quan trọng

- Mã dự án viết hoa toàn bộ, bỏ khoảng trắng thừa: `Autm2602e7` thành `AUTM2602E7`.
- `MEC 2601045` được chuẩn hóa thành `MEC2601045`.
- Tên người trên giao diện có thể giữ tiếng Việt có dấu: `Lộc Milo`, `Nguyễn Quang Hiếu`.
- Tên folder bỏ dấu và bỏ ký tự đặc biệt: `Nguyễn Quang Hiếu` thành `NguyenQuangHieu`.
- Ký tự `@` trong tên người được loại bỏ khi tạo tên folder.
- Tháng trong folder dùng tiếng Anh: `June`.
- Nên thống nhất ngày một chữ số có số `0` hay không. Theo ví dụ hiện tại có thể dùng `2026June16`; nếu ngày là mùng 6 thì nên cân nhắc dùng `2026June06` để dễ sắp xếp.

## 10. Kế hoạch triển khai

### Giai đoạn 1: Hoàn thiện prototype giao diện

- Tạo app desktop có 2 tab `Nhập liệu` và `Tìm kiếm`.
- Làm vùng nhập, nút chọn thư mục, nút xác nhận, bảng preview.
- Thêm checkbox chọn từng công việc.
- Thêm nút `Thêm vào Excel` chỉ hiện khi có checkbox được chọn.

### Giai đoạn 2: Parser và chuẩn hóa dữ liệu

- Viết bộ nhận diện các trường chính.
- Viết bộ tách mã dự án, ngày, người thực hiện.
- Xử lý các form nhập sai hoặc không đủ tiêu đề.
- Thêm cảnh báo khi thiếu dữ liệu hoặc không chắc chắn.
- Test với 3 ví dụ mẫu và các biến thể sai form.

### Giai đoạn 3: Tạo folder và lưu JSON

- Thêm chọn thư mục gốc.
- Tạo folder ngày và folder người.
- Ghi dữ liệu chuẩn hóa vào JSON.
- Chống tạo folder trùng.
- Chống ghi trùng bản ghi nếu cùng ngày, cùng dự án, cùng người và cùng nội dung.

### Giai đoạn 4: Tích hợp Excel

- Cho phép chọn file Excel.
- Đọc danh sách sheet trong file.
- Cho phép chọn sheet.
- Chuẩn bị mapping dữ liệu sang cột Excel.
- Khi người dùng cung cấp mẫu Excel chính thức, thêm dữ liệu đúng vị trí/cột theo mẫu đó.
- Cập nhật trạng thái đã thêm Excel vào JSON.

### Giai đoạn 5: Trang tìm kiếm

- Đọc JSON và tạo danh sách kết quả.
- Tìm theo chuỗi tổng hợp và bộ lọc.
- Mở folder khi bấm link.
- Hiển thị chi tiết bản ghi.
- Lọc theo trạng thái đã thêm Excel hoặc chưa thêm Excel.

### Giai đoạn 6: Hoàn thiện và đóng gói

- Thêm sao lưu JSON.
- Thêm xuất dữ liệu tổng hợp nếu cần.
- Kiểm tra lỗi khi file Excel đang mở hoặc bị khóa.
- Đóng gói thành ứng dụng Windows.

## 11. Rủi ro cần xử lý sớm

- Dữ liệu nhập không đồng nhất, một dòng có thể chứa cả người, nhiệm vụ và trạng thái.
- Nhiều dự án nhưng trạng thái không ghi rõ trạng thái nào ứng với dự án nào.
- Tên người có nickname, ký hiệu `@`, hoặc mô tả vai trò kèm theo.
- Mã dự án có nhiều format khác nhau.
- File Excel có thể đang mở, bị khóa hoặc có cấu trúc sheet chưa thống nhất.
- JSON có thể lớn dần; nếu dữ liệu nhiều nên chuyển sang SQLite.

## 12. Kết quả mong đợi của bản đầu tiên

Phần mềm bản đầu tiên cần làm tốt:

- Dán dữ liệu từ 3 ví dụ mẫu.
- Tách được dự án, công việc, người thực hiện, trạng thái và ngày.
- Hiển thị preview để người dùng xem lại và sửa tay.
- Có checkbox chọn công việc cần đưa vào Excel.
- Có nút `Thêm vào Excel` sau khi chọn checkbox.
- Tạo folder đúng dạng `2026June11/LocMilo`.
- Lưu JSON và tìm lại được.
- Bấm `Mở thư mục` để mở folder đã tạo.
