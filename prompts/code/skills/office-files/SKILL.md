---
name: office-files
description: Create and read xlsx, docx, pptx and pdf files in the workspace. Use whenever the user asks for a spreadsheet, a Word document, a deck or a PDF, or hands over one of those files.
---

# Office and PDF files

The workspace has python3 and pip, so the real libraries are available. The
formats are all zip archives of XML, which is the fallback when an install does
not work.

## Deliver, do not print

Build the file in the workspace and hand it over with `present_files`. Never
paste its contents into the chat, and never base64 it. One run that creates and
compresses beats a script the user has to run themselves.

## Excel

```bash
pip install --quiet openpyxl
```

```python
from openpyxl import Workbook
from openpyxl.styles import Font, Alignment
from openpyxl.utils import get_column_letter

wb = Workbook()
ws = wb.active
ws.title = "Resumen"

ws.append(["Mes", "Ventas", "Variación"])
for row in [("Enero", 12400, 0.08), ("Febrero", 15800, 0.27)]:
    ws.append(row)

for cell in ws[1]:
    cell.font = Font(bold=True)
    cell.alignment = Alignment(horizontal="right")

for column in ws.columns:
    ws.column_dimensions[get_column_letter(column[0].column)].width = 14

ws.freeze_panes = "A2"
wb.save("/home/nexo/workspace/reporte.xlsx")
```

- Write formulas, not precomputed values, when the user will change the inputs:
  `ws["C2"] = "=B2/B1-1"`. openpyxl stores the formula but does not evaluate it,
  so the file opens correctly and Excel or LibreOffice computes on open.
- Number formats matter as much as the value: `ws["B2"].number_format = '#,##0.00'`
  and `ws["C2"].number_format = '0.0%'`.
- Freeze the header row, size the columns once, and do not merge cells in data
  ranges: it breaks sorting and filtering.
- Read an existing file with `load_workbook(path, data_only=True)` to get the
  last computed values, and without it to get the formulas.

## Word

```bash
pip install --quiet python-docx
```

```python
from docx import Document
from docx.shared import Pt

doc = Document()
doc.add_heading("Informe trimestral", level=1)
doc.add_paragraph("Resumen del trimestre con las cifras de ventas por región.")

table = doc.add_table(rows=1, cols=3)
table.style = "Light Grid Accent 1"
for cell, text in zip(table.rows[0].cells, ["Región", "Ventas", "Δ"]):
    cell.text = text
for region, sales in [("Norte", 12400), ("Sur", 9800)]:
    cells = table.add_row().cells
    cells[0].text, cells[1].text = region, f"{sales:,}"

doc.save("/home/nexo/workspace/informe.docx")
```

- Build the document by appending in reading order. A document assembled out of
  order comes out out of order.
- Use the built-in heading and table styles. Custom XML styling is a rabbit hole
  with no payoff.
- Set page size and margins explicitly when the layout matters; the default is
  US Letter.
- python-docx cannot produce a redline. If the user wants tracked changes, build
  the document clean and say that the comparison has to be done in Word.

## PowerPoint

```bash
pip install --quiet python-pptx
```

One slide per idea, 16:9 by default, a title and at most five bullets per slide,
and a real chart object instead of a pasted image when the numbers are the point.
Set the slide size explicitly when the deck is meant to be widescreen:

```python
from pptx import Presentation
from pptx.util import Inches, Pt

prs = Presentation()
prs.slide_width, prs.slide_height = Inches(13.333), Inches(7.5)
slide = prs.slides.add_slide(prs.slide_layouts[1])
slide.shapes.title.text = "Ventas por región"
slide.placeholders[1].text_frame.text = "Norte 12.400\nSur 9.800"
prs.save("/home/nexo/workspace/deck.pptx")
```

Generate the deck from a script rather than by hand when the content is data, so
it can be regenerated when the data changes.

## PDF

```bash
pip install --quiet reportlab pypdf
```

- reportlab to write, pypdf to read, merge, split, rotate and add metadata.
- Extract text first and look at it before transforming a PDF. A scanned PDF has
  no text layer and needs OCR, which is not installed.
- Filling a form means reading its field names with pypdf and writing values into
  the AcroForm; a flat PDF has no fields to fill.

## When pip does not work

If the install fails, the format is still reachable. Every one of them is a zip
of XML, so build the parts directly:

```python
import zipfile, shutil
shutil.copy("plantilla.docx", "salida.docx")
with zipfile.ZipFile("salida.docx", "a") as z:
    z.writestr("word/document.xml", xml)
```

A minimal xlsx needs `[Content_Types].xml`, `_rels/.rels` and
`xl/worksheets/sheet1.xml`; a docx needs `word/document.xml`; a pptx needs
`ppt/slides/slide1.xml` plus its relationships. Read an existing file of the same
type as the template and count on it.

## Delivering several files

Compress a directory when there is more than one file, and let the folder layout
show through:

```bash
cd /home/nexo/workspace && zip -r entregables.zip entregables/
```

Then hand the archive over with `present_files`.
