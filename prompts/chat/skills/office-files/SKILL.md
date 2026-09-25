---
name: office-files
description: Create and read xlsx, docx, pptx and pdf files with run_python. Use whenever the user asks for a spreadsheet, a Word document, a deck or a PDF, or attaches one of those files.
requires: code
---

# Office and PDF files in the sandbox

The sandbox does not ship these libraries, but it can install them from PyPI
with micropip in about two seconds. Install and build in the same `run_python`
call: nothing survives to the next one.

| Format | Install | Notes |
| --- | --- | --- |
| xlsx | `openpyxl`, or `xlsxwriter` for write-only with charts | pandas' `read_excel` and `to_excel` need `openpyxl` |
| docx | `python-docx` | |
| pptx | `python-pptx` | |
| pdf, write | `fpdf2` or `reportlab` | fpdf2 is simpler for text and tables |
| pdf, read | `pypdf` | Text, merge, split, rotate, form fields. No OCR, and `pdfplumber` does not install |

```python
import micropip
await micropip.install(["openpyxl", "python-docx"])
```

## Deliver, do not print

Save into `/mnt/output` with the name the user would expect. Everything there is
handed to the user as a download when the run ends, up to 10 files and 10 MB in
total. Never paste the file's contents or base64 into the reply; say in one line
what the file contains.

## Excel

```python
import micropip
await micropip.install("openpyxl")
from openpyxl import Workbook
from openpyxl.styles import Font
from openpyxl.utils import get_column_letter

wb = Workbook()
ws = wb.active
ws.title = "Resumen"
ws.append(["Mes", "Ventas", "Variación"])
ws.append(["Enero", 12400, None])
ws.append(["Febrero", 15800, "=B3/B2-1"])

for cell in ws[1]:
    cell.font = Font(bold=True)
ws["B2"].number_format = ws["B3"].number_format = "#,##0"
ws["C3"].number_format = "0.0%"
for column in ws.columns:
    ws.column_dimensions[get_column_letter(column[0].column)].width = 14
ws.freeze_panes = "A2"
wb.save("/mnt/output/reporte.xlsx")
```

- Write formulas when the user will change the inputs. openpyxl stores them
  without evaluating them, and Excel computes them on open, so if you also need
  the number in your reply, compute it in Python and print it.
- Number formats matter as much as the value. Freeze the header row, size the
  columns, and do not merge cells in data ranges.
- To read an attachment, `load_workbook("/mnt/data/<name>", data_only=True)`
  gives the last computed values; without `data_only` you get the formulas.

## Word

```python
import micropip
await micropip.install("python-docx")
from docx import Document

doc = Document()
doc.add_heading("Informe trimestral", level=1)
doc.add_paragraph("Resumen del trimestre con las ventas por región.")
table = doc.add_table(rows=1, cols=2)
table.style = "Light Grid Accent 1"
table.rows[0].cells[0].text, table.rows[0].cells[1].text = "Región", "Ventas"
for region, sales in [("Norte", 12400), ("Sur", 9800)]:
    cells = table.add_row().cells
    cells[0].text, cells[1].text = region, f"{sales:,}"
doc.save("/mnt/output/informe.docx")
```

- Append in reading order and use the built-in heading and table styles.
- Set the page size and margins when the layout matters; the default is US
  Letter.
- python-docx cannot make tracked changes. Build the document clean and say so.

## PowerPoint

```python
import micropip
await micropip.install("python-pptx")
from pptx import Presentation
from pptx.util import Inches

prs = Presentation()
prs.slide_width, prs.slide_height = Inches(13.333), Inches(7.5)
slide = prs.slides.add_slide(prs.slide_layouts[1])
slide.shapes.title.text = "Ventas por región"
slide.placeholders[1].text_frame.text = "Norte 12.400\nSur 9.800"
prs.save("/mnt/output/presentacion.pptx")
```

One idea per slide, a title and at most five bullets. To put a matplotlib figure
on a slide, save it to `/mnt/data/figura.png` first and use
`slide.shapes.add_picture`.

## PDF

```python
import micropip
await micropip.install("fpdf2")
from fpdf import FPDF

pdf = FPDF()
pdf.add_page()
pdf.set_font("Helvetica", size=16)
pdf.cell(text="Informe", new_x="LMARGIN", new_y="NEXT")
pdf.set_font("Helvetica", size=11)
pdf.multi_cell(0, 6, text="Texto del informe.")
pdf.output("/mnt/output/informe.pdf")
```

- The built-in fonts only cover Latin-1. For other characters, download a TTF
  in the same run and register it with `pdf.add_font`.
- To read a PDF, `pypdf.PdfReader("/mnt/data/<name>")` and look at the text
  before transforming anything. A scanned PDF has no text layer; say so instead
  of guessing its content.

## When an install fails

Every Office format is a zip of XML, so it is still reachable with `zipfile`:
open an existing file of the same type, read `word/document.xml`,
`xl/worksheets/sheet1.xml` or `ppt/slides/slide1.xml`, and write the parts back.
Tell the user when you had to go that way.
