# Daily Work Report

Phan mem Electron ho tro chuan hoa bao cao cong viec hang ngay, luu du lieu SQLite, quan ly thu muc anh/tai lieu va xuat bao cao tuan Excel.

## Chay thu

```bash
npm install
npm start
```

## Server dong bo SQLite

Chay server luu backup SQLite:

```bash
npm run sync-server
```

Mac dinh server chay tai:

```text
http://localhost:3959
```

Neu muon dat token bao ve:

```powershell
$env:SYNC_TOKEN="mat_khau_rieng"
npm run sync-server
```

Trong app vao **Cai dat -> Dong bo du lieu**, nhap dia chi server, token neu co, roi bam **Day SQLite len server**.
Du lieu backup duoc luu trong `server_data/` va khong duoc commit len Git.

## Backup bang link Google Sheet

Neu muon backup len Google Drive bang mot link Google Sheet:

1. Mo Google Apps Script: https://script.google.com
2. Tao project moi.
3. Copy noi dung file `scripts/google-sheets-backup.gs` vao Apps Script.
4. Bam **Deploy -> New deployment -> Web app**.
5. Chon **Execute as: Me** va **Who has access: Anyone with the link**.
6. Copy Web App URL dang `https://script.google.com/macros/s/.../exec`.
7. Trong app vao **Cai dat -> Dong bo du lieu**, dan URL vao muc Google Sheet va bam **Backup len Google Sheet**.

Sau khi backup thanh cong, app se hien link file Google Sheet. Reset Windows xong chi can cai/chay lai app, dan lai Web App URL va bam **Khoi phuc tu Google Sheet**.

Neu muon dat token bao ve Apps Script, vao **Project Settings -> Script properties** them:

```text
SYNC_TOKEN=mat_khau_rieng
```

Sau do nhap cung token nay trong app.

Neu muon chay tren Windows ma chi hien cua so phan mem, bam file:

```text
Run Daily Work Report.vbs
```

Hoac chay:

```bash
npm run start:hidden
```

## Build Windows

```bash
npm run build
```

Ban build unpacked nam trong `dist/win-unpacked`.

## Release tu dong

Chay mot lenh de tu dong nang version, build, commit, tag, push va tao GitHub Release:

```bash
npm run release:auto -- 1.5.7 "Release v1.5.7"
```

Co the truyen ghi chu release sau message:

```bash
npm run release:auto -- 1.5.7 "Release v1.5.7" "Noi dung cap nhat"
```

Script se tu dung `gh`; neu may chua co `gh` tren Windows thi se thu cai bang `winget`.

## Cap nhat tu GitHub

Nut **Thong tin** trong app co chuc nang **Update tu GitHub**. Chuc nang nay yeu cau thu muc phan mem la mot Git repository va da cau hinh remote `origin`.
