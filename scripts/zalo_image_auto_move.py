import argparse
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path


if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")


IMAGE_EXTENSIONS = {
    ".jpg",
    ".jpeg",
    ".png",
    ".bmp",
    ".gif",
    ".webp",
    ".heic",
    ".tif",
    ".tiff",
}


def default_zalo_download_candidates():
    home = Path.home()
    return [
        home / "Downloads" / "Zalo Received Files",
        home / "Documents" / "Zalo Received Files",
        home / "OneDrive" / "Documents" / "Zalo Received Files",
        home / "OneDrive" / "Downloads" / "Zalo Received Files",
    ]


def find_default_zalo_download_folder():
    for folder in default_zalo_download_candidates():
        if folder.exists() and folder.is_dir():
            return folder
    return None


def powershell_active_explorer_folder():
    script = r"""
$shell = New-Object -ComObject Shell.Application
$hwnd = (Get-Process -Id $PID).MainWindowHandle
$windows = @($shell.Windows())
$foreground = Add-Type -MemberDefinition @"
[DllImport("user32.dll")]
public static extern System.IntPtr GetForegroundWindow();
"@ -Name Win32GetForegroundWindow -Namespace Native -PassThru
$activeHwnd = $foreground::GetForegroundWindow().ToInt64()

foreach ($window in $windows) {
    try {
        if ($window.HWND -eq $activeHwnd -and $window.Document.Folder.Self.Path) {
            $window.Document.Folder.Self.Path
            exit 0
        }
    } catch {}
}

foreach ($window in $windows) {
    try {
        if ($window.Document.Folder.Self.Path) {
            $window.Document.Folder.Self.Path
            exit 0
        }
    } catch {}
}
"""
    try:
        result = subprocess.run(
            ["powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
            capture_output=True,
            text=True,
            timeout=3,
            creationflags=subprocess.CREATE_NO_WINDOW if hasattr(subprocess, "CREATE_NO_WINDOW") else 0,
        )
    except Exception:
        return None

    folder = result.stdout.strip().splitlines()
    if not folder:
        return None
    path = Path(folder[-1].strip())
    if path.exists() and path.is_dir():
        return path
    return None


def is_image_file(path):
    return path.is_file() and path.suffix.lower() in IMAGE_EXTENSIONS


def is_file_stable(path, wait_seconds):
    try:
        first_size = path.stat().st_size
        first_mtime = path.stat().st_mtime
        time.sleep(wait_seconds)
        second_size = path.stat().st_size
        second_mtime = path.stat().st_mtime
        return first_size == second_size and first_mtime == second_mtime and second_size > 0
    except FileNotFoundError:
        return False
    except PermissionError:
        return False


def unique_destination(destination_folder, file_name):
    target = destination_folder / file_name
    if not target.exists():
        return target

    stem = target.stem
    suffix = target.suffix
    index = 1
    while True:
        candidate = destination_folder / f"{stem} ({index}){suffix}"
        if not candidate.exists():
            return candidate
        index += 1


def move_image(source_file, destination_folder):
    destination_folder.mkdir(parents=True, exist_ok=True)
    target = unique_destination(destination_folder, source_file.name)
    shutil.move(str(source_file), str(target))
    return target


def scan_existing_images(source_folder):
    return {
        str(path.resolve())
        for path in source_folder.iterdir()
        if is_image_file(path)
    }


def monitor(source_folder, fallback_destination=None, interval=1.0, stable_wait=0.8):
    source_folder = Path(source_folder).expanduser().resolve()
    if not source_folder.exists() or not source_folder.is_dir():
        raise SystemExit(f"Không tìm thấy thư mục Zalo: {source_folder}")

    fallback_destination = Path(fallback_destination).expanduser().resolve() if fallback_destination else None
    seen = scan_existing_images(source_folder)
    last_destination = fallback_destination

    print("Đang theo dõi thư mục Zalo:")
    print(f"  {source_folder}")
    print("Ảnh mới sẽ được chuyển sang thư mục File Explorer đang mở.")
    if fallback_destination:
        print(f"Nếu không đọc được Explorer, dùng thư mục dự phòng: {fallback_destination}")
    print("Nhấn Ctrl+C để dừng.\n")

    while True:
        active_folder = powershell_active_explorer_folder()
        if active_folder and active_folder.resolve() != source_folder:
            last_destination = active_folder

        for path in source_folder.iterdir():
            if not is_image_file(path):
                continue
            key = str(path.resolve())
            if key in seen:
                continue
            if not is_file_stable(path, stable_wait):
                continue

            destination = last_destination
            if not destination:
                print(f"Bỏ qua {path.name}: chưa tìm thấy thư mục Explorer đang mở.")
                seen.add(key)
                continue

            try:
                moved_to = move_image(path, destination)
                print(f"Đã chuyển: {path.name} -> {moved_to}")
                seen.add(key)
            except Exception as error:
                print(f"Lỗi khi chuyển {path.name}: {error}")

        time.sleep(interval)


def parse_args():
    parser = argparse.ArgumentParser(
        description="Theo dõi thư mục tải xuống Zalo và tự chuyển ảnh mới vào thư mục Explorer đang mở."
    )
    parser.add_argument(
        "--source",
        help="Thư mục Zalo tải ảnh về. Nếu bỏ trống, chương trình tự tìm Zalo Received Files.",
    )
    parser.add_argument(
        "--fallback",
        help="Thư mục dự phòng nếu không đọc được thư mục Explorer đang mở.",
    )
    parser.add_argument(
        "--interval",
        type=float,
        default=1.0,
        help="Chu kỳ quét thư mục, đơn vị giây. Mặc định 1.0.",
    )
    return parser.parse_args()


def main():
    args = parse_args()
    source = Path(args.source).expanduser() if args.source else find_default_zalo_download_folder()
    if not source:
        print("Không tự tìm thấy thư mục Zalo Received Files.")
        print("Hãy chạy lại với dạng:")
        print(r'python scripts\zalo_image_auto_move.py --source "C:\Users\...\Downloads\Zalo Received Files"')
        return 1

    try:
        monitor(source, args.fallback, args.interval)
    except KeyboardInterrupt:
        print("\nĐã dừng theo dõi.")
        return 0


if __name__ == "__main__":
    sys.exit(main())
