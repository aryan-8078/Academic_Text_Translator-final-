"""
structure.py
------------
Reads a document and returns its STRUCTURE, not just its text:

    title / subtitle / heading (level 1-3) / paragraph / bullet / number

For PDFs it uses font size, boldness and position (via pdfplumber), so
headings are detected even when they are written in normal Title Case
(e.g. "Introduction", "How Machine Translation Works").

If pdfplumber is not installed, or for .txt files, it falls back to a
text-only heuristic.

Every section is a dict:
    {"type": "heading", "level": 1, "text": "..."}
    {"type": "number",  "number": "1.", "text": "..."}
    ...
"""

import io
import re
import statistics
from collections import Counter

try:
    import pdfplumber
    HAS_PDFPLUMBER = True
except ImportError:                       # pragma: no cover
    HAS_PDFPLUMBER = False


BULLET_RE = re.compile(r"^[\-\u2022\u25CF\u25AA\u25E6\u2023\u2043\*\u25AB\u2013]\s+")
NUMBER_RE = re.compile(r"^(\d{1,3}[\.\)])\s+(.*)")
SENTENCE_END = (".", "!", "?", ":", ";", "\u0964")


# ============================================================
# HELPERS
# ============================================================

def _norm(text):
    """Normalise a line so headers/footers on different pages match."""
    return re.sub(r"\d+", "#", text.strip().lower())


def _is_bold(fontname):
    name = (fontname or "").lower()
    return any(k in name for k in ("bold", "black", "heavy", "semibold", "demi"))


def _join_lines(lines):
    """Join wrapped lines, repairing 'trans-\\nlation' style hyphenation."""
    out = ""
    for line in lines:
        line = line.strip()
        if not line:
            continue
        if not out:
            out = line
        elif out.endswith("-") and line[:1].islower() and len(out) > 1 and out[-2].isalpha():
            out = out[:-1] + line
        else:
            out += " " + line
    return out.strip()


def _title_case_ratio(text):
    small = {"a", "an", "the", "of", "in", "on", "and", "or", "for", "to",
             "with", "by", "at", "from", "vs", "is", "as"}
    words = [w for w in re.findall(r"[A-Za-z][A-Za-z\-']*", text)]
    words = [w for w in words if w.lower() not in small]
    if not words:
        return 0
    return sum(1 for w in words if w[0].isupper()) / len(words)


# ============================================================
# PDF -> LINES (with font information)
# ============================================================

def _pdf_lines(pdf_bytes):
    lines = []
    page_count = 0

    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        page_count = len(pdf.pages)

        for page_no, page in enumerate(pdf.pages):
            words = page.extract_words(
                extra_attrs=["fontname", "size"],
                keep_blank_chars=False,
                use_text_flow=False,
            )
            if not words:
                continue

            words.sort(key=lambda w: ((w["top"] + w["bottom"]) / 2, w["x0"]))

            grouped = []
            for w in words:
                mid = (w["top"] + w["bottom"]) / 2
                if grouped and abs(mid - grouped[-1]["mid"]) <= 0.45 * w["size"]:
                    grouped[-1]["words"].append(w)
                else:
                    grouped.append({"mid": mid, "words": [w]})

            for g in grouped:
                ws = sorted(g["words"], key=lambda w: w["x0"])
                text = " ".join(w["text"] for w in ws).strip()
                if not text:
                    continue

                sizes = [round(w["size"] * 2) / 2 for w in ws]
                chars = sum(len(w["text"]) for w in ws)
                bold_chars = sum(len(w["text"]) for w in ws if _is_bold(w["fontname"]))

                lines.append({
                    "page": page_no,
                    "page_w": float(page.width),
                    "page_h": float(page.height),
                    "text": text,
                    "size": statistics.median(sizes),
                    "bold": chars > 0 and bold_chars / chars >= 0.8,
                    "x0": min(w["x0"] for w in ws),
                    "x1": max(w["x1"] for w in ws),
                    "top": min(w["top"] for w in ws),
                    "bottom": max(w["bottom"] for w in ws),
                    "chars": chars,
                })

    return lines, page_count


def _drop_headers_footers(lines, page_count):
    """Remove running headers, footers and page numbers."""
    if not lines:
        return lines

    def in_margin(l):
        return l["top"] < 0.07 * l["page_h"] or l["bottom"] > 0.93 * l["page_h"]

    counts = Counter(_norm(l["text"]) for l in lines if in_margin(l))
    kept = []
    for l in lines:
        if in_margin(l):
            n = _norm(l["text"])
            is_page_no = bool(re.fullmatch(r"(page\s*)?\d+(\s*(of|/)\s*\d+)?", l["text"].strip().lower()))
            repeated = page_count > 1 and counts[n] >= 2
            if is_page_no or repeated:
                continue
        kept.append(l)
    return kept


# ============================================================
# LINES -> SECTIONS
# ============================================================

def _sections_from_lines(lines):
    if not lines:
        return []

    # ---- body font size = the size that carries most characters
    size_weight = Counter()
    for l in lines:
        size_weight[l["size"]] += l["chars"]
    body_size = size_weight.most_common(1)[0][0]

    # ---- typical gap between lines of the same paragraph
    gaps = []
    for prev, cur in zip(lines, lines[1:]):
        if prev["page"] == cur["page"] and abs(prev["size"] - body_size) < 0.6 and abs(cur["size"] - body_size) < 0.6:
            gaps.append(cur["top"] - prev["bottom"])
    base_gap = statistics.median(gaps) if gaps else 2.0
    para_gap = base_gap + 0.45 * body_size

    body_lines = [l for l in lines if abs(l["size"] - body_size) < 0.6]
    left_margin = statistics.median([l["x0"] for l in body_lines]) if body_lines else 0

    # ---- classify each line
    def classify(l):
        text = l["text"]
        words = len(text.split())
        if BULLET_RE.match(text):
            return "bullet"
        bigger = l["size"] >= body_size + 1.0
        bold_short = (l["bold"] and l["size"] >= body_size - 0.6
                      and words <= 14 and not text.rstrip().endswith((".", ",", ";")))
        if (bigger and words <= 25) or bold_short:
            return "heading"
        if NUMBER_RE.match(text):
            return "number"
        return "body"

    for l in lines:
        l["kind"] = classify(l)

    # ---- heading levels from distinct (size, bold) styles
    styles = sorted(
        {(l["size"], l["bold"]) for l in lines if l["kind"] == "heading"},
        key=lambda s: (s[0], s[1]),
        reverse=True,
    )

    # the title = the largest style, if clearly bigger than body and on page 1
    title_style = None
    if styles and styles[0][0] >= body_size * 1.45:
        first_heading = next((l for l in lines if l["kind"] == "heading"), None)
        if first_heading and first_heading["page"] == 0 and (first_heading["size"], first_heading["bold"]) == styles[0]:
            title_style = styles[0]

    level_styles = [s for s in styles if s != title_style]
    level_of = {s: min(i + 1, 3) for i, s in enumerate(level_styles)}

    # ---- build sections
    sections = []
    para = []          # current paragraph lines
    item = None        # current bullet / number item
    last = None        # previous line
    title_done = title_style is None
    title_line = None

    def flush_para():
        nonlocal para
        text = _join_lines(para)
        if text:
            sections.append({"type": "paragraph", "text": text})
        para = []

    def flush_item():
        nonlocal item
        if item:
            text = _join_lines(item["lines"])
            if text:
                entry = {"type": item["type"], "text": text}
                if item["type"] == "number":
                    entry["number"] = item["number"]
                sections.append(entry)
        item = None

    def flush_all():
        flush_para()
        flush_item()

    for l in lines:
        text = l["text"]
        gap = (l["top"] - last["bottom"]) if (last and last["page"] == l["page"]) else None
        centered = abs((l["x0"] + l["x1"]) / 2 - l["page_w"] / 2) < 0.04 * l["page_w"] \
            and (l["x1"] - l["x0"]) < 0.8 * l["page_w"]

        # ------------------------------------------------ HEADING / TITLE
        if l["kind"] == "heading":
            style = (l["size"], l["bold"])

            # wrapped heading (same style, directly under previous heading line)
            if (last and last["kind"] == "heading" and (last["size"], last["bold"]) == style
                    and gap is not None and gap < 0.8 * l["size"] and sections
                    and sections[-1]["type"] in ("title", "heading")):
                sections[-1]["text"] += " " + text
                last = l
                continue

            flush_all()

            if style == title_style and not title_done:
                sections.append({"type": "title", "text": text})
                title_line = l
            else:
                sections.append({"type": "heading", "level": level_of.get(style, 2), "text": text})
            last = l
            continue

        # ------------------------------------------------ SUBTITLE
        # centered line(s) right after the title, before any other content
        if (sections and sections[-1]["type"] in ("title", "subtitle") and l["page"] == 0
                and centered and l["kind"] == "body"):
            if sections[-1]["type"] == "subtitle":
                sections[-1]["text"] += " " + text
            else:
                sections.append({"type": "subtitle", "text": text})
                title_done = True
            last = l
            continue
        if sections and sections[-1]["type"] == "title":
            title_done = True

        # ------------------------------------------------ BULLET
        if l["kind"] == "bullet":
            flush_all()
            item = {"type": "bullet", "lines": [BULLET_RE.sub("", text)]}
            last = l
            continue

        # ------------------------------------------------ NUMBERED ITEM
        if l["kind"] == "number":
            flush_all()
            m = NUMBER_RE.match(text)
            item = {"type": "number", "number": m.group(1), "lines": [m.group(2)]}
            last = l
            continue

        # ------------------------------------------------ BODY LINE
        if item is not None:
            # continuation of a list item, unless there is a paragraph-sized gap
            if gap is not None and gap > para_gap:
                flush_item()
                para = [text]
            else:
                item["lines"].append(text)
            last = l
            continue

        new_para = False
        if not para:
            new_para = True
        elif gap is not None and gap > para_gap:
            new_para = True
        elif gap is not None and l["x0"] > left_margin + 0.8 * body_size \
                and last and last["text"].rstrip().endswith(SENTENCE_END):
            new_para = True                      # first-line indent

        if new_para and para:
            flush_para()
        para.append(text)
        last = l

    flush_all()
    return sections


# ============================================================
# TEXT -> SECTIONS  (fallback for .txt and PDFs without pdfplumber)
# ============================================================

def analyze_text_structure(text):
    raw = [ln.strip() for ln in text.splitlines()]
    sections = []
    para = []

    def flush():
        nonlocal para
        t = _join_lines(para)
        if t:
            sections.append({"type": "paragraph", "text": t})
        para = []

    def prev_nonblank_index(i):
        j = i - 1
        while j >= 0 and not raw[j]:
            j -= 1
        return j

    def looks_like_heading(i):
        line = raw[i]
        words = line.split()
        if not words or len(words) > 12:
            return False
        if line.endswith((".", ",", ";", "?", "!")):
            return False
        # must be followed by real content
        if i + 1 >= len(raw) and True:
            return False
        if re.match(r"^(UNIT|CHAPTER|MODULE|SECTION|PART)\b", line, re.I):
            return True
        if re.match(r"^\d+(\.\d+)+\s+\S", line):
            return True
        if len(line) > 3 and line.isupper():
            return True
        if _title_case_ratio(line) >= 0.75:
            j = prev_nonblank_index(i)
            # a Title-Case line that starts the text, follows a blank line,
            # or follows a line that ended a sentence
            return j < 0 or raw[i - 1] == "" or raw[j].endswith(SENTENCE_END) \
                or (j >= 0 and sections and sections[-1]["type"] == "heading" and not para)
        return False

    first_heading_seen = False
    for i, line in enumerate(raw):
        if not line:
            flush()
            continue

        if BULLET_RE.match(line):
            flush()
            sections.append({"type": "bullet", "text": BULLET_RE.sub("", line)})
            continue

        m = NUMBER_RE.match(line)
        if m and not looks_like_heading(i):
            flush()
            sections.append({"type": "number", "number": m.group(1), "text": m.group(2)})
            continue

        if looks_like_heading(i):
            flush()
            if not first_heading_seen:
                first_heading_seen = True
                sections.append({"type": "title", "text": line})
            else:
                sections.append({"type": "heading", "level": 2, "text": line})
            continue

        # continuation of a list item that wrapped onto the next line
        if not para and sections and sections[-1]["type"] in ("bullet", "number") \
                and i > 0 and raw[i - 1]:
            sections[-1]["text"] = _join_lines([sections[-1]["text"], line])
            continue

        para.append(line)

    flush()
    return sections


# ============================================================
# PUBLIC API
# ============================================================

def extract_sections_from_pdf(pdf_bytes):
    """Return (sections, plain_text) for a PDF."""
    if HAS_PDFPLUMBER:
        lines, pages = _pdf_lines(pdf_bytes)
        lines = _drop_headers_footers(lines, pages)
        sections = _sections_from_lines(lines)
        if sections:
            return sections, sections_to_text(sections)

    # Fallback: plain text extraction + heuristics
    from PyPDF2 import PdfReader
    reader = PdfReader(io.BytesIO(pdf_bytes))
    pages = [(p.extract_text() or "").strip() for p in reader.pages]
    text = "\n".join(p for p in pages if p).strip()
    return analyze_text_structure(text), text


def sections_to_text(sections):
    return "\n\n".join(s["text"] for s in sections)
