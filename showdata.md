# Dữ liệu mình hiểu về phần nhập liệu

## 1. Mục đích của phần nhập liệu

Phần nhập liệu dùng để người dùng copy nội dung báo cáo công việc hằng ngày từ bên ngoài vào một vùng text lớn. Nội dung có thể đúng form, sai form, thiếu mục, viết hoa hoặc viết thường lẫn lộn, có dấu hoặc không dấu, có ký tự đặc biệt, có một hoặc nhiều dự án trong cùng một báo cáo.

Sau khi bấm `Accept / Xác nhận`, phần mềm cần bóc tách nội dung thô thành các bản ghi chuẩn hóa theo từng mã dự án.

## 2. Các trường dữ liệu cần bóc tách

| Trường | Ý nghĩa | Ví dụ |
| --- | --- | --- |
| Mã dự án | Mã máy hoặc mã dự án cần báo cáo(Ưu tiên text có bắt đầu bằng) | `AUTM...`, `MEC...`, `AUTS...` |
| Nội dung công việc | Công việc đã, đang hoặc sẽ thực hiện | `Bọc lại dây tín hiệu và nguồn kết nối máy lazer` |
| Thời Gian | Công việc được thực hiện trong thời gian nào (thường là text thời gian dạng xx:xx - xx:xx hoặc xxhxx - xxhxx ) | `8:15 - 18:30`, `8h15 - 18h30`,`...` |
| Người thực hiện | Danh sách người làm việc | `Tân, Nguyễn Quang Hiếu` |
| Trạng thái | Tiến độ, kết quả hoặc vấn đề đang xử lý (ưu tiên text có chữ)| `Hoàn thành`, `30%`, `đang chờ`,` xử lý`,`đang hoàn thiện`, `đang`, `đã`,`xong`,`%`,`chưa xong`,.... |
| Ngày thực hiện | Ngày báo cáo | `2026-06-11` |
| Thư mục ảnh | Đường dẫn folder ảnh/tài liệu tự động tạo | `2026June11/BuiHuuSy_NguyenVanHung` |

## 3. Form đầu vào mong muốn

Form chuẩn thường có dạng:

```text
1. Mã dự án: AUTM..... hoặc AUTM..... hoặc MEC......
2. Nội dung công việc: bọc lại dây và bọc dây tín hiệu
3. Người thực hiện: Bùi Hữu Sỹ, Tân, ...
4. Trạng thái: đã xong máy AUTM......., đang làm máy AUTM....., Hoàn thành, ..%, đang ..., đã ...., chưa ...., đang chờ .....
5. Ngày 11/06/2026
```
## 4. Quy tắc nhận diện mã dự án

Mã dự án thường có tiền tố:

- `MEC`
- `AUTM`
- `AUTS`
- Các tiền tố tương tự, có thể viết hoa hoặc viết thường lẫn lộn.

Sau tiền tố mã dự án thường là: 

`20`
`21`
`22`
`23`
`24`
`25`
`26`
`27`
`28`
`29`
`30`

Sau ký tự trên sẽ thường là:

`01`
`02`
`03`
`04`
`05`
`06`
`07`
`08`
`09`
`10`
`11`
`12`

Cuối cùng là 2 hậu tố sau cùng đối với tiền tố AUTM, AUTS và 3 hậu tố cuối cùng đối với tiền tố MEC ví dụ:

`E9`
`E6`
`A5`
`A8`
`010`
`05`
`11`

Cần tự động chuẩn hóa:

| Đầu vào | Kết quả đúng |
| --- | --- |
| `Autm2602e7` | `AUTM2602E7` |
| `mec2510010` | `MEC2510010` |
| `Mec 2601043` | `MEC2601043` |
| `AUTM:2602E8, 2602E9` | `AUTM2602E8`, `AUTM2602E9` |
| `MEC2601044,45` | `MEC2601044`, `MEC2601045` |

Không được tạo mã dự án ảo không có trong input. Ví dụ input chỉ có:

```text
AUTM:2602E8, 2602E9.
MEC2601045.
```
Input tham khảo mã dự án trong file thamkhao.xlsm

Thì chỉ được sinh:

- `AUTM2602E8`
- `AUTM2602E9`
- `MEC2601045`

Không được sinh thêm các mã sai như `AUTM262602`, `MEC262602`.(sai do 2 ký tự AUTM26xx02/MEC26xx02, xx không được khác 01->12)

## 5. Quy tắc tách nhiều dự án

Nếu một báo cáo có nhiều mã dự án, phần mềm cần chia thành nhiều vùng chuẩn hóa, mỗi vùng ứng với một dự án.

Ví dụ:

```text
1. Mã dự án: AUTM2602E8, AUTM2602E9, MEC2601045
2. Nội dung công việc: bọc lại dây và bọc dây tín hiệu
3. Người thực hiện: Bùi Hữu Sỹ, E Hùng Lắp Ráp, Tân A7
4. Tình trạng:
Máy AUTM2602E9 đang làm chưa xong.
Đã bọc xong dây máy AUTM2602E8.
Đang bọc lại dây máy MEC2601045.
5. Ngày 11/06/2026
```

Cần tạo 3 bản ghi:

| Mã dự án | Nội dung công việc | Trạng thái |
| --- | --- | --- |
| `AUTM2602E8` | `Bọc lại dây và bọc dây tín hiệu` | `Đã bọc xong dây máy` |
| `AUTM2602E9` | `Bọc lại dây và bọc dây tín hiệu` | `đang làm chưa xong` |
| `MEC2601045` | `Bọc lại dây và bọc dây tín hiệu` | `Đang bọc lại dây` |

Nếu trạng thái không nói rõ dự án nào, có thể gán trạng thái chung cho các dự án hoặc để cảnh báo `Chưa có trạng thái riêng cho dự án này`.

## 6. Quy tắc dùng số thứ tự làm key

Khi input phức tạp hoặc sai form, cần ưu tiên đọc theo số thứ tự:

| Số thứ tự | Ý nghĩa ưu tiên |
| --- | --- |
| `1` | Mã dự án |
| `2` | Nội dung công việc |
| `3` | Người thực hiện |
| `4` | Trạng thái |
| `5` | Ngày thực hiện |

Ví dụ:

```text
1. Dự án: Mec 2601043(pcb transfer)
2. Đấu tủ điện (08:30-16:45)
3. Người thực hiện: nguyễn hùng, quang hưng
4. Trạng thái: 60%
1. Dự án: Mec 2601042(pcb transfer)
2. Đấu tủ điện (08:30-16:45)
3. Người thực hiện: nguyễn hùng, nam
4. Trạng thái: 50%
5. Ngày17/06/2026
```

Cần tách ra 2 dự án riêng:

- `MEC2601043`, nội dung `Đấu tủ điện`, trạng thái `60%`, thời gian `8:30 - 16:45`, ngày thực hiện `17/06/2026`
- `MEC2601042`, nội dung `Đấu tủ điện`, trạng thái `50%`, thời gian `8:30 - 16:45`, ngày thực hiện `17/06/2026`

## 7. Quy tắc nhận diện nội dung công việc

Nội dung công việc thường nằm ở mục `2`

Nội dung công việc là các dòng:

- Không phải những từ ngữ đặc biệt đã được (`AUTM...`, `MEC...`, `AUTS...`,`8:15 - 18:30`, `8h15 - 18h30`,`Tân, Nguyễn Quang Hiếu`,....)
- Không phải mã dự án
- Không phải tên người
- Không phải ngày tháng
- Không phải trạng thái thuần túy 
- Là hành động hoặc công việc cần làm/đã làm

Ví dụ:

```text
2. - lắp các cụm camera và các vị trí còn thiếu
- đã căn chỉnh xong cụm xe trước LD, đang chỉnh cụm hút tray LD
```

Nội dung công việc nên lấy:

- `Lắp các cụm camera và các vị trí còn thiếu`
- `Căn chỉnh cụm xe trước LD`
- `Chỉnh cụm hút tray LD`

Khi lấy nội dung từ trạng thái, cần bỏ bớt các từ chỉ trạng thái:

- `đang`
- `đã`
- `sẽ`
- `hoàn thành`
- `xong`
- `chưa`
- `%`

Nhưng không được bỏ cả câu nếu trong câu có text: `nội dung công việc`,`Nội dung`,`nội dung`, `ND`, ....

## 8. Quy tắc nhận diện trạng thái

Trạng thái thường có các dấu hiệu:

- `đang xử lý`
- `đang làm`
- `đã xong`
- `hoàn thành`
- `xx%`
- `đang chờ`
- `chưa hoàn thành`
- `chờ thiết kế điện xử lý`
- `chưa chạy được chương trình mới`

Trạng thái không chỉ ghi mỗi `hoàn thành`, mà cần ghi rõ cái gì hoàn thành nếu có nhiều dự án và nhiều đầu mục công việc.

Ví dụ:

```text
Bắn panel và gá thiết bị tủ chính và tủ phụ - hoàn thành
Đấu tủ chính -30%
```

Kết quả:

| Nội dung công việc | Trạng thái |
| --- | --- |
| `Bắn panel và gá thiết bị tủ chính và tủ phụ` | `Bắn panel và gá thiết bị tủ chính và tủ phụ hoàn thành` |
| `Đấu tủ chính` | `Đấu tủ chính 30%` |

## 9. Quy tắc nhận diện người thực hiện

Người thực hiện có thể có nhiều người, ngăn cách bằng:

- Dấu phẩy
- Chữ `và`
- Xuống dòng
- Ký tự tag `@`

Cần xóa ký tự đặc biệt trong tên:

| Đầu vào | Kết quả |
| --- | --- |
| `Tân, @Nguyễn Quang Hiếu` | `Tân, Nguyễn Quang Hiếu` |
| `@E Hùng Lắp Ráp và @Tân a7` | `E Hùng Lắp Ráp, Tân A7` |
| `- Hoàng Bá Thuần` | `Hoàng Bá Thuần` |

Danh sách thành viên trong cài đặt được dùng để tham chiếu tên. Nếu tên nhập gần đúng với thành viên, cho phép người dùng chọn tên đúng.

Ví dụ:

- Input: `Tân A7`
- Danh sách thành viên có: `Nguyễn Bá Tân`
- Gợi ý chọn: `Nguyễn Bá Tân`

Sau khi chọn, tên người và tên folder phải cập nhật theo tên đã sửa.

## 10. Quy tắc nhận diện ngày thực hiện

Ngày có thể viết nhiều dạng:

| Đầu vào | Kết quả |
| --- | --- |
| `11/6/2026` | `2026-06-11` |
| `11/06/2026` | `2026-06-11` |
| `thứ Năm ngày 11 tháng 06 năm 2026` | `2026-06-11` |
| `Ngày17/06/2026` | `2026-06-17` |

Nếu nhiều dự án trong cùng một block và ngày chỉ xuất hiện ở cuối, ngày đó dùng chung cho các dự án phía trên.

## 11. Thư mục được tạo sau khi xác nhận

Người dùng chọn một thư mục gốc để lưu ảnh/tài liệu.

Sau khi xác nhận, phần mềm tạo cấu trúc:

```text
<Thư mục gốc>/
  2026June11/
    BuiHuuSy_NguyenVanHung_NguyenBaTan/
```

Quy tắc:

- Folder ngày có dạng `YYYYMonthDD`, ví dụ `2026June11`.
- Nếu folder ngày đã tồn tại thì không tạo trùng.
- Nếu nhiều người cùng làm chung một báo cáo thì chỉ tạo 1 folder chung cho nhóm người.
- Tên folder người bỏ dấu tiếng Việt và bỏ ký tự đặc biệt.
- Nếu không có ngày thì có thể dùng `UnknownDate`.
- Nếu không có người thì có thể dùng `ChuaXacDinh` hoặc `Chung`.

## 12. Dữ liệu lưu trữ

Sau khi xác nhận hoặc tạo folder, dữ liệu chuẩn hóa được lưu vào:

- SQLite: phục vụ tìm kiếm và tổng hợp theo các trường

Mỗi bản ghi SQLite cần có index riêng tăng dần, không ghi đè bản ghi cũ cùng mã dự án.

Cần có thể query theo:

- Mã dự án
- Ngày thực hiện
- Người thực hiện
- Nội dung công việc
- Trạng thái
- Thời gian
- Thư mục ảnh

## 13. Tìm kiếm

Trang tìm kiếm cần cho phép tìm theo tất cả nội dung đã lưu.

Ví dụ tìm `AUTM2602E8` thì hiện:

- Toàn bộ nội dung công việc của `AUTM2602E8`
- Trạng thái
- Người thực hiện
- Ngày thực hiện
- Thời gian
- Thư mục ảnh tương ứng

Có thể xóa từng bản ghi hoặc xóa tất cả, nhưng phải hiện popup xác nhận trước khi xóa. Khi xóa phải xóa đồng thời trong SQLite.

## 14. Bảng chuẩn hóa sau khi nhập

Sau khi nhấn `Accept / Xác nhận`, phần mềm render bảng chuẩn hóa. Mỗi dự án là một vùng riêng.

Người dùng được phép sửa nhanh các trường:

- Mã dự án
- Nội dung công việc
- Trạng thái
- Người thực hiện nếu cần chọn lại theo danh sách thành viên

Nếu mã dự án không có trong file tham khảo `Thamkhao.xlsm`, cần cảnh báo:

- Bôi vàng ô STT
- Có tam giác gợi ý mã dự án gần đúng
- Khi chọn mã đúng thì cập nhật lại mã, tên máy, ghi chú và bỏ cảnh báo

## 15. Nguyên tắc quan trọng

- Không được sinh mã dự án ảo không có trong input.
- Nếu sai form, phải ưu tiên tách theo số thứ tự 1-5.
- Nếu không tách được bằng số thứ tự, mới dùng các dấu hiệu nội dung/trạng thái/người/ngày để suy luận.
- Thời gian làm việc như `8:15 - 18:30` phải giữ đủ số, không được cắt mất thành `:15 - 18:30`.
- Trạng thái phải giữ đủ ý nghĩa, không chỉ lấy mỗi từ `hoàn thành`.
- Tên người phải được làm sạch ký tự đặc biệt.
- Dữ liệu mới cùng dự án không được ghi đè dữ liệu cũ.
- Mỗi lần mở app, nội dung báo cáo trong ô nhập nên được clear, nhưng thư mục lưu gần nhất cần được ghi nhớ.