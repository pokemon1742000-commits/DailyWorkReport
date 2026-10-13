"""Regenerate compact references with `pip install "markitdown[xlsx]"`."""

from pathlib import Path
import re
import unicodedata
import warnings

from markitdown import MarkItDown


ROOT = Path(__file__).resolve().parent.parent
REFERENCE_FOLDER = ROOT / "reference_files"
WORKBOOKS = (
    ("Thamkhao.xlsm", "Danh sách máy", 1, 29, 28),
    ("Thamkhao2.xlsm", "Dự án lẻ1", 1, 5, 4),
    ("Thamkhao3.xlsm", "Danh sách máy", 1, 31, 30),
)


def normalize_heading(value):
    value = value.replace("đ", "d").replace("Đ", "D")
    return "".join(
        character
        for character in unicodedata.normalize("NFD", value)
        if not unicodedata.combining(character)
    ).lower()


def split_markdown_row(line):
    cells = []
    cell = []
    escaped = False
    for character in line.strip().strip("|"):
        if escaped:
            if character == "n":
                cell.append("\n")
            elif character in "\\`*_{}[]()#+-.!|>":
                cell.append(character)
            else:
                cell.extend(("\\", character))
            escaped = False
        elif character == "\\":
            escaped = True
        elif character == "|":
            cells.append("".join(cell).strip())
            cell.clear()
        else:
            cell.append(character)
    if escaped:
        cell.append("\\")
    cells.append("".join(cell).strip())
    return cells


def escape_cell(value):
    return (
        value.replace("\\", "\\\\")
        .replace("\r\n", "\n")
        .replace("\r", "\n")
        .replace("\n", "<br>")
        .replace("|", "&#124;")
    )


def convert_workbook(converter, filename, sheet_name, code_column, machine_column, project_column):
    workbook_path = REFERENCE_FOLDER / filename
    converted_lines = converter.convert(str(workbook_path)).text_content.splitlines()
    expected_heading = normalize_heading("## " + sheet_name)
    section_start = next(
        (
            index + 1
            for index, line in enumerate(converted_lines)
            if normalize_heading(line) == expected_heading
        ),
        None,
    )
    if section_start is None:
        raise ValueError(f"MarkItDown did not convert worksheet {sheet_name!r} in {filename}.")

    rows = []
    for line in converted_lines[section_start:]:
        if line.startswith("## "):
            break
        if not line.startswith("|"):
            continue
        cells = split_markdown_row(line)
        required_column = max(code_column, machine_column, project_column)
        if len(cells) <= required_column:
            continue
        code = cells[code_column].strip()
        normalized_code = re.sub(r"[^A-Z0-9]", "", code.upper())
        if not re.fullmatch(r"(?:MEC|AUT[A-Z]?)[A-Z0-9]{4,12}", normalized_code):
            continue

        values = [code]
        for column in (machine_column, project_column):
            value = cells[column].strip()
            if value in {"NaN", "NaT", "None"}:
                value = ""
            value = value.replace("\u00a0", " ")
            values.append(value)
        rows.append("| " + " | ".join(escape_cell(value) for value in values) + " |")

    if not rows:
        raise ValueError(f"No project-reference rows found in {filename}:{sheet_name}.")

    output_path = workbook_path.with_suffix(".md")
    content = [
        f"# Machine reference from {filename}",
        "",
        "| Project code | Machine name | Project name |",
        "| --- | --- | --- |",
        *rows,
        "",
    ]
    output_path.write_text("\n".join(content), encoding="utf-8")
    return output_path, len(rows)


def main():
    warnings.filterwarnings("ignore", category=UserWarning, module="openpyxl")
    converter = MarkItDown()
    for workbook in WORKBOOKS:
        output_path, row_count = convert_workbook(converter, *workbook)
        print(f"{output_path.relative_to(ROOT)}: {row_count} rows")


if __name__ == "__main__":
    main()
