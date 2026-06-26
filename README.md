# Daily Work Report

Phan mem Electron ho tro chuan hoa bao cao cong viec hang ngay, luu du lieu SQLite, quan ly thu muc anh/tai lieu va xuat bao cao tuan Excel.

## Chay thu

```bash
npm install
npm start
```

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
