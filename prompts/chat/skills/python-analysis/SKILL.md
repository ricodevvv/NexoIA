---
name: python-analysis
description: Work out the answer with run_python instead of guessing it. Use for arithmetic, data analysis, the user's uploaded files, simulations, plotting and any deliverable file.
requires: code
---

# Python in the sandbox

`run_python` executes one self-contained Python 3 program and hands back stdout,
stderr, the value of the last expression, and any file it produced. Use it
whenever the answer depends on a number you would otherwise have to estimate.

## The rules

- **Preloaded:** numpy, pandas, matplotlib, scipy, sympy, scikit-learn. They
  import instantly.
- **Pyodide packages load on import.** lxml, pillow, requests, beautifulsoup4,
  pyyaml and the rest of the Pyodide distribution are fetched the first time you
  import them, with no extra step.
- **Anything else comes from PyPI through micropip.** Pure-Python wheels work;
  packages that need a C compiler and are not in Pyodide do not.

  ```python
  import micropip
  await micropip.install(["openpyxl", "python-docx", "pypdf"])
  import openpyxl
  ```

  There is no `pip` and no shell. If `micropip.install` fails with "Can't find a
  pure Python 3 wheel", the package is not available: rewrite it with what is,
  and say so instead of retrying.
- **Internet is HTTP and HTTPS to public hosts.** Use `requests`, or
  `from pyodide.http import pyfetch` with `await`. `urllib.request` fails on
  HTTPS, raw sockets do not work, and private or local addresses are blocked.
  Cite the URL of any data you downloaded.
- **Nothing persists.** Every run starts from zero, installed packages
  included. Install, download, load every file and compute in a single program.
- **120 seconds.** Downloads count against it. Aggregate early, vectorize, and
  install only what the run needs.
- **No environment variables, no subprocesses, no writes outside the sandbox
  filesystem.**

## The filesystem

| Path | What it is |
| --- | --- |
| `/mnt/data` | The user's attachments, with their original names |
| `/mnt/output` | Where you write deliverables |

- Read attachments from `/mnt/data` by their real name, spaces and accents
  included. List the directory first when you are not sure what arrived.
- `.zip` and `.tar.gz` are not unpacked for you. Open them with `zipfile` and
  `tarfile`.
- `.xlsx`, `.docx` and `.pptx` need `openpyxl`, `python-docx` and
  `python-pptx`, installed with micropip in the same run. pandas' `read_excel`
  also needs `openpyxl`.
- `.pdf` text comes out with `pypdf`, also through micropip. Scanned PDFs have
  no text layer and there is no OCR, so say when the extraction is empty or
  partial.

## Delivering files

Everything you write is downloaded by the user when the run ends, from
`/mnt/output` or `/mnt/data`. Archives are delivered as they are, a few loose
files are delivered as they are, and a directory tree is zipped for you, up to 10
files and 10 MB in total.

```python
import zipfile, pathlib

out = pathlib.Path("/mnt/output/analysis")
out.mkdir(parents=True, exist_ok=True)
(out / "summary.csv").write_text(df.to_csv(index=False), encoding="utf-8")
(out / "chart.png")  # written by matplotlib, collected automatically

archive = pathlib.Path("/mnt/output/analysis.zip")
with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as z:
    for path in sorted(out.rglob("*")):
        z.write(path, path.relative_to(out))
```

- Build and compress in the same run, otherwise nothing survives to the next
  call.
- Stay inside the size limits. A 40 MB archive is dropped, and the run reports
  nothing about the loss, so check the size yourself and split the work.
- Never paste file contents or base64 into your reply. The user already has the
  download.

## Patterns

Print the last expression to get a value back:

```python
import pandas as pd

df = pd.read_csv("/mnt/data/sales.csv")          # raises if the name is wrong
print(df.shape)                                   # look before you compute
total = df["amount"].sum()
total                                               # returned as "valor final"
```

Check the frame before trusting it:

```python
print(df.dtypes)
print(df.isna().sum())
print(df.head())
```

Numeric work that a language model should never do in its head:

```python
import numpy as np
print(np.linalg.solve(np.array([[3, 1], [1, 2]]), np.array([9, 8])))
print(sympy.solve(sympy.Symbol("x")**2 - 5))
```

Sampling and fitting:

```python
from sklearn.linear_model import LinearRegression
model = LinearRegression().fit(X, y)
print(model.coef_, model.score(X, y))
```

## Reading the result

- `stderr` with an empty stdout is a real failure. Report it and fix it.
- A `result` of `None` means the program printed nothing at the end; the stdout
  section still has whatever you printed.
- When a number in your reply came from a run, do not re-derive it from memory.
  Print it, then use exactly that.
