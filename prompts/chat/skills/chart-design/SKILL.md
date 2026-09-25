---
name: chart-design
description: Choose and build charts that carry the point. Use for the show_widget chart type, and for figures produced with matplotlib through run_python.
---

# Charts

Nexo has two ways to draw. Pick by how much control the question needs.

| Situation | Use |
| --- | --- |
| A handful of values the user already has, read at a glance | `show_widget` with `type: "chart"` |
| Computed data, statistics, distributions, anything matplotlib can draw | `run_python` with matplotlib, deliver the PNG |
| A dashboard or a chart inside a layout | a `react` artifact with recharts |

The widget is the cheap option and it is deliberately minimal: line or bar, a
title, an optional subtitle, up to 40 categories and 6 series. It has no legend
control, no axis formatting and no annotations. When the point depends on any of
that, produce a figure instead.

## The widget

```json
{
  "type": "chart",
  "title": "Signups per week",
  "kind": "line",
  "categories": ["W1", "W2", "W3", "W4"],
  "series": [{ "name": "Organic", "values": [120, 145, 168, 210] }]
}
```

- Every series needs exactly one value per category. A mismatch is rejected, so
  count before you send.
- Two is the minimum for both categories and values, so a single point is not a
  chart. Say the number instead.
- Values are numbers, no strings, no thousands separators, no units. Put the
  unit in the title or the subtitle: `"title": "Revenue (thousands EUR)"`.
- Category labels are capped at 40 characters, and so are series names. Shorten
  long dates to `2026-03` or `Mar 24` rather than sending a full timestamp.
- One series needs no legend, so prefer a single series over several
  indistinguishable ones.

## Choosing the form

- **Line** for something continuous over time, and only over time. Points in
  time are not a line.
- **Bar** for comparing categories, and for unordered or very short ranges.
- **Not a chart** when there are fewer than 3 values, one value per category is
  just a list, or the exact number matters more than the shape. Say the number.
- Sorting bars by value is almost always better than sorting by name.
- If two series must be compared, plot both. Do not stack unless the total is
  the point.

## Figures with matplotlib

```python
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import pandas as pd

df = pd.read_csv("/mnt/data/signups.csv")
daily = df.groupby(pd.Grouper(key="date", freq="D")).size()

fig, ax = plt.subplots(figsize=(9, 4.5), dpi=140)
ax.plot(daily.index, daily.values, color="#3b82f6", linewidth=2)
ax.set_title("Signups per day")
ax.set_ylabel("New accounts")
ax.spines[["top", "right"]].set_visible(False)
ax.grid(axis="y", alpha=0.25)
fig.tight_layout()
```

- Call `matplotlib.use("Agg")` before pyplot, or there is no display to draw on.
- Figures are saved and delivered automatically, so you do not write the file
  yourself and you do not paste a path in your reply.
- Label the axes and put units on them. State the number of observations in the
  title when the sample size matters.
- Drop the top and right spines and keep gridlines on one axis only. A legend
  with one series is noise; with two, place it outside the plot area.
- Match the size to the container: about 9 by 4.5 inches at 140 dpi for
  something embedded in a chat message, and a taller figure for a time series
  with many points.
- Read the data from `/mnt/data`, never from a path you assume exists. Print the
  shape and the column names first when the file is unfamiliar, then plot.

## Colour

- One series: one colour. Pick a blue that stays legible on white and on the
  dark background, such as `#3b82f6` or `#60a5fa`.
- Several series: a categorical order that stays distinguishable, never a
  rainbow ramp and never a gradient across a single series.
- Never encode a value with colour alone when the chart is printed or read by
  someone who cannot see the hue. Add markers, line styles or direct labels.
- Colour is not decoration. If a colour carries no meaning, the default axis
  grey is enough.

## Numbers

- Do not hand-type values that came from a tool. Put the calculation in the run
  so the figure and the text come from the same numbers.
- Round for humans: axis ticks in short units, percentages to one decimal at
  most, money in thousands or millions when the numbers are large.
- When a value is missing, leave the gap. Interpolating silently invents data.
