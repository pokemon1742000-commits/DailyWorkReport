# Tự kiểm điểm sau khi đọc lại `showdata.md`

## 1. Những điểm bạn đã chỉnh trong `showdata.md` mà mình đã đọc lại

Bạn đã làm rõ thêm các yêu cầu quan trọng sau:

- Có thêm trường `Thời Gian` riêng, không được để thời gian lẫn vào `Nội dung công việc`.
- Mã dự án phải ưu tiên các tiền tố `MEC`, `AUTM`, `AUTS` và các tiền tố tương tự.
- Sau tiền tố mã dự án thường có cấu trúc:
  - 2 số năm: `20` đến `30`
  - 2 số tháng: `01` đến `12`
  - Hậu tố cuối:
    - AUTM/AUTS: thường 2 ký tự cuối, ví dụ `E8`, `17`, `34`
    - MEC: thường 3 ký tự cuối, ví dụ `010`, `045`, `011`
- Không được sinh mã dự án ảo kiểu `AUTM262602`, `MEC262602`, vì phần tháng `26` là sai.
- Khi nhiều dự án có trạng thái riêng, trạng thái sau khi gán về từng dự án nên bỏ mã dự án khỏi câu.
  - Ví dụ `Máy AUTM2602E9 đang làm chưa xong` nên thành `đang làm chưa xong`.
- Nội dung công việc thường nằm ở mục `2`; thời gian như `8:15 - 18:30` hoặc `8h15 - 18h30` là dữ liệu riêng.
- Dữ liệu lưu trữ theo tài liệu hiện tại ưu tiên SQLite.
- Tìm kiếm cần tìm được cả `Thời gian`.

## 2. Những điểm mình đã hiểu sai trước đó

### 2.1. Mình từng hiểu sai thời gian là nội dung công việc

Trước đó, case như:

```text
2. Đấu tủ điện (08:30-16:45)
```

có thể bị hiểu thành nội dung:

```text
Đấu tủ điện (08:30-16:45)
```

hoặc thời gian `8:15 - 18:30` từng bị đi vào danh sách nội dung.

Hiểu đúng sau khi đọc lại:

- `Đấu tủ điện` là `Nội dung công việc`.
- `08:30 - 16:45` là `Thời gian`.

### 2.2. Mình từng validate mã dự án quá rộng

Trước đó mã dự án chỉ cần giống dạng `AUT...` hoặc `MEC...` là có thể được nhận.

Điều này làm rủi ro sinh mã ảo như:

```text
AUTM262602
MEC262602
```

Hiểu đúng sau khi đọc lại:

- Phần sau tiền tố phải có cấu trúc năm/tháng hợp lý.
- Tháng phải nằm trong `01` đến `12`.
- `AUTM262602` sai vì sau `AUTM` là `26 26 02`, tháng `26` không hợp lệ.

### 2.3. Mình từng giữ nguyên mã dự án trong trạng thái

Trước đó trạng thái có thể hiển thị:

```text
Đã bọc xong dây máy AUTM2602E8
```

Hiểu đúng hơn:

Sau khi đã gán trạng thái về đúng dự án, có thể bỏ mã dự án khỏi nội dung trạng thái:

```text
Đã bọc xong dây
```

### 2.4. Tìm kiếm chưa thật sự tìm toàn bộ trường

Trước đó khi gõ từ khóa thường, app có lúc query SQLite theo `ma_du_an` trước, sau đó mới lọc frontend. Vì vậy nếu tìm theo thời gian hoặc nội dung không liên quan mã dự án có thể bị thiếu kết quả.

Hiểu đúng:

- Tìm kiếm text thường cần xét toàn bộ dữ liệu đã lưu.
- Tìm theo ngày vẫn có thể dùng query ngày chính xác.

## 3. Những gì mình đã sửa trong code

### 3.1. Thêm trường `Thời gian`

Đã thêm trường `thoi_gian` vào dữ liệu chuẩn hóa.

Các nơi đã nối trường này:

- Parser nhập liệu
- Bảng chuẩn hóa sau khi nhập
- Cho phép sửa nhanh ở preview
- SQLite
- Trang tìm kiếm
- Detail dự án

Ví dụ:

```text
2. Đấu tủ điện (08:30-16:45)
```

Kết quả mong muốn sau sửa:

```text
Nội dung công việc: Đấu tủ điện
Thời gian: 8:30 - 16:45
```

### 3.2. Chuẩn hóa thời gian

Đã sửa thời gian để các dạng sau được chuẩn hóa:

| Đầu vào | Kết quả |
| --- | --- |
| `8:15 - 18:30` | `8:15 - 18:30` |
| `8h15 - 18h30` | `8:15 - 18:30` |
| `8h-15h` | `8:00 - 15:00` |

### 3.3. Siết lại validate mã dự án

Đã sửa `isValidProjectCode`:

- AUTM/AUTS/AUT... phải có dạng: tiền tố + năm + tháng + hậu tố 2 ký tự.
- MEC phải có dạng: `MEC` + năm + tháng + hậu tố 3 số.
- Năm hợp lệ: `20` đến `30`.
- Tháng hợp lệ: `01` đến `12`.

Ví dụ hợp lệ:

- `AUTM2602E8`
- `AUTM260217`
- `AUTM260234`
- `MEC2601045`
- `MEC2510010`

Ví dụ không hợp lệ:

- `AUTM262602`
- `MEC262602`

### 3.4. Làm sạch trạng thái sau khi gán đúng dự án

Đã thêm bước `cleanStatusForProject`.

Mục tiêu:

```text
Máy AUTM2602E9 đang làm chưa xong
```

sau khi thuộc về dự án `AUTM2602E9`, trạng thái sẽ thành:

```text
đang làm chưa xong
```

### 3.5. Thêm cột thời gian vào tìm kiếm

Trang tìm kiếm hiện có thêm cột:

```text
Thời gian
```

Khi tìm kiếm, dữ liệu `thoi_gian` cũng nằm trong blob tìm kiếm nên có thể tìm theo:

- `8:15`
- `18:30`
- `8:15 - 18:30`

### 3.6. Thêm trường thời gian vào SQLite

Đã thêm vào schema SQLite:

- `thoi_gian`
- `thoi_gian_text`

Và thêm index:

- `idx_reports_thoi_gian_text`

Nếu database cũ chưa có cột này, app sẽ tự `ALTER TABLE` để thêm cột.

## 4. Những gì mình đã thêm

- Trường `thoi_gian` trong object report.
- Hàm `extractTimeItems`.
- Hàm `normalizeTimeText` chuẩn hóa giờ dạng `h` và `:`.
- Hàm `cleanStatusForProject`.
- Cột `Thời gian` ở bảng tìm kiếm.
- Hiển thị `Thời gian` trong Detail.
- Lưu `Thời gian` vào SQLite.

## 5. Những gì mình đã bớt hoặc thay đổi

### 5.1. Không còn đưa dòng thời gian thuần túy vào nội dung công việc

Trước đây:

```text
8:15 - 18:30
```

có thể thành một dòng nội dung.

Sau sửa:

```text
8:15 - 18:30
```

được đưa vào `Thời gian`.

### 5.2. Trạng thái riêng theo dự án sẽ bớt mã dự án

Trước đây:

```text
Đã bọc xong dây máy AUTM2602E8
```

Sau sửa:

```text
Đã bọc xong dây
```

## 6. Những điểm mình chưa xóa hẳn

### 6.1. JSON vẫn còn trong code như legacy/backup

Trong `showdata.md` bạn đã chỉnh phần lưu trữ còn SQLite là chính. Tuy nhiên code hiện tại vẫn còn ghi JSON cùng SQLite.

Mình chưa xóa JSON ngay trong lần này vì:

- Nhiều luồng cũ vẫn dùng JSON để fallback/migrate.
- Nếu xóa đột ngột có thể ảnh hưởng dữ liệu cũ của bạn.
- Trước đây app đã có cơ chế đồng bộ từ JSON sang SQLite khi chưa có SQLite.

Đề xuất bước tiếp theo:

- Nếu bạn xác nhận bỏ JSON hoàn toàn, mình sẽ sửa riêng một lượt:
  - Không ghi JSON mới nữa.
  - Không xóa dữ liệu SQLite.
  - Giữ migration đọc JSON cũ một lần nếu cần.

### 6.2. Chưa bắt buộc mã dự án phải tồn tại trong `Thamkhao.xlsm` ngay lúc nhập

Mình đã siết cấu trúc mã dự án theo năm/tháng/hậu tố.

Tuy nhiên chưa bắt buộc parser loại bỏ mã nếu không có trong `Thamkhao.xlsm`, vì hiện phần tham khảo đang chạy ở luồng báo cáo tuần/cảnh báo mã. Nếu áp dụng bắt buộc ngay lúc nhập, cần thêm luồng IPC async để parser hỏi main process.

Đề xuất:

- Giữ parser nhận mã hợp lệ theo cấu trúc.
- Sau đó dùng cảnh báo `Thamkhao.xlsm` để bôi vàng/gợi ý sửa mã.

## 7. Kết luận sau khi đọc lại file

Mình hiểu lại trọng tâm phần nhập liệu như sau:

1. Dữ liệu nhập không chỉ có 5 trường cũ, mà có thêm `Thời gian`.
2. `Thời gian` là trường riêng, không phải nội dung công việc.
3. Mã dự án không được nhận quá rộng; phải kiểm soát năm/tháng/hậu tố để tránh mã ảo.
4. Trạng thái gắn theo từng dự án nên sạch, không cần giữ lại mã dự án trong câu nếu mã đó chỉ dùng để nhận diện.
5. Tìm kiếm phải bao phủ cả `Thời gian`.
6. SQLite là nơi lưu trữ chính.

