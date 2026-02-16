#!/usr/bin/env python3
"""
Extract page images + clothing item text from Brynn PDFs.

Input: a directory of PDFs (default: ~/Desktop/brynn-outfits/pdfs)
Output:
  - brynn-outfits/images/<source>/page_<n>.(jpg|png)
  - brynn-outfits/data/collections.json

This avoids OCR: the PDFs already contain selectable text for the item lists.
"""

import argparse
import json
import re
import shutil
import unicodedata
from collections import defaultdict
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Tuple

import fitz  # PyMuPDF

from config import (
    DEFAULT_PDF_DIR,
    IMAGES_DIR,
    DATA_DIR,
    CATEGORY_ORDER,
    CATEGORY_ICONS,
    CATEGORY_KEYWORDS,
    IGNORE_TEXT_SUBSTRINGS,
)

# Keyword match precedence for categorization.
# This is intentionally not the same as the UI display order.
CATEGORY_MATCH_ORDER = [
    "Boots",
    "Footwear",
    "Bags",
    "Outerwear",
    "Dresses",
    "Skirts",
    "Shorts",
    "Bottoms",
    "Sweaters",
    "Tops",
    "Accessories",
]


def _ascii_normalize(text: str) -> str:
    # Keep it readable but normalize common PDF punctuation to ASCII.
    text = unicodedata.normalize("NFKC", text)
    text = (
        text.replace("\u2019", "'")  # right single quote
            .replace("\u2018", "'")  # left single quote
            .replace("\u201c", '"')  # left double quote
            .replace("\u201d", '"')  # right double quote
            .replace("\u2013", "-")  # en-dash
            .replace("\u2014", "-")  # em-dash
    )
    return text


def slugify(text: str) -> str:
    text = _ascii_normalize(text)
    text = text.lower().strip()
    text = text.replace("&", "and")
    # Replace separators like "|" with spaces before slugging.
    text = text.replace("|", " ")
    text = re.sub(r"[^a-z0-9]+", "-", text).strip("-")
    return text or "pdf"


def infer_pdf_label(pdf_path: Path) -> str:
    """
    Pick a human-friendly label from the first page.
    Falls back to filename stem.
    """
    try:
        doc = fitz.open(pdf_path)
        lines = [l.strip() for l in doc[0].get_text("text").splitlines() if l.strip()]
        doc.close()
    except Exception:
        lines = []

    for line in lines:
        line_norm = _ascii_normalize(line).strip()
        if not line_norm:
            continue
        low = line_norm.lower()
        if low.startswith("brynn |"):
            continue
        if any(s.lower() in low for s in IGNORE_TEXT_SUBSTRINGS):
            continue
        # Use first non-generic line.
        return line_norm

    return _ascii_normalize(pdf_path.stem).strip()


def clean_line(line: str) -> str:
    line = _ascii_normalize(line)
    line = re.sub(r"\s+", " ", line).strip()
    # Trim stray separators.
    line = line.strip("|").strip()
    return line


def should_ignore_line(line: str) -> bool:
    if not line:
        return True
    low = line.lower()
    if low.startswith("brynn |"):
        return True
    if any(s.lower() in low for s in IGNORE_TEXT_SUBSTRINGS):
        return True
    # Some cover pages repeat the title/year.
    if re.fullmatch(r"(spring|summer|fall|winter).*\d{4}", low):
        return True
    return False


def merge_wrapped_lines(lines: Iterable[str]) -> List[str]:
    """
    Merge continuation lines (typically lowercased) into the previous line.
    """
    items: List[str] = []
    current: Optional[str] = None

    for raw in lines:
        line = clean_line(raw)
        if should_ignore_line(line):
            continue

        if current is None:
            current = line
            continue

        # Continuation lines tend to start lowercase or punctuation.
        if re.match(r"^[a-z]", line) or re.match(r"^[,.;:/\\)\\]\"'-]", line):
            current = (current.rstrip() + " " + line.lstrip()).strip()
            continue

        items.append(current.strip())
        current = line

    if current:
        items.append(current.strip())

    # Collapse double spaces and drop empties.
    return [re.sub(r"\s+", " ", s).strip() for s in items if s.strip()]


def categorize_item(item_text: str) -> str:
    """
    Categorize via keyword phrases using token matching (not substring matching).

    Substring matching creates false positives (e.g., "Pologeorgis" contains "polo").
    """

    def tokenize(s: str) -> List[str]:
        s = _ascii_normalize(s).lower()
        s = re.sub(r"[^a-z0-9]+", " ", s)
        return [t for t in s.split() if t]

    def contains_phrase(tokens: List[str], phrase: List[str]) -> bool:
        if not phrase:
            return False
        n = len(phrase)
        for i in range(0, len(tokens) - n + 1):
            if tokens[i : i + n] == phrase:
                return True
        return False

    def endswith_phrase(tokens: List[str], phrase: List[str]) -> bool:
        if not phrase:
            return False
        n = len(phrase)
        if len(tokens) < n:
            return False
        return tokens[-n:] == phrase

    tokens = tokenize(item_text)
    # Always classify V-neck items as sweaters.
    if "vneck" in tokens or contains_phrase(tokens, ["v", "neck"]):
        return "Sweaters"

    # In this dataset, "mini" / "midi" / "pencil" are used as shorthand for
    # skirt silhouettes; treat them as explicit overrides so these items are
    # grouped under Skirts.
    if any(t in tokens for t in ("mini", "midi", "pencil")):
        return "Skirts"

    for cat in CATEGORY_MATCH_ORDER:
        for kw in CATEGORY_KEYWORDS.get(cat, []):
            kw_tokens = tokenize(kw)
            # "short" is ambiguous (e.g., "short sleeved"), so only treat it as
            # Shorts when it appears at the end of the item name.
            if cat == "Shorts" and kw_tokens in (["short"], ["shorts"]):
                if endswith_phrase(tokens, kw_tokens):
                    return cat
                continue
            if contains_phrase(tokens, kw_tokens):
                return cat
    return "Other"


def is_heading_item(item_text: str) -> bool:
    """
    Heuristics to drop non-item text that appears on cover/section pages.
    """
    t = clean_line(item_text)
    if not t:
        return True

    # Drop section labels like "SHORTS", "DENIM", etc.
    if not re.search(r"[a-z]", t) and len(t) <= 60:
        return True

    # Drop title-like strings with a year (e.g., "Valentine's Day ... 2026").
    if re.search(r"\b\d{4}\b", t) and categorize_item(t) == "Other":
        return True

    # Drop simple title-case headings like "Chloe", "Phoebe Philo", "Gucci".
    words = t.split()
    if 1 <= len(words) <= 2 and t.istitle() and categorize_item(t) == "Other":
        return True

    return False


def extract_page_items(page_text: str) -> List[Dict[str, str]]:
    lines = page_text.splitlines()
    merged = merge_wrapped_lines(lines)
    items = []
    for it in merged:
        name = clean_line(it)
        if not name or is_heading_item(name):
            continue
        items.append({"name": name, "category": categorize_item(name)})
    return items


def page_sort_key(prefixed_page: str) -> Tuple[str, int]:
    source, rest = parse_prefixed_page(prefixed_page)
    m = re.search(r"page_(\d+)", rest)
    n = int(m.group(1)) if m else 0
    return source, n


def parse_prefixed_page(prefixed_page: str) -> Tuple[str, str]:
    s = str(prefixed_page)
    idx = s.find("_")
    if idx == -1:
        return "", s
    return s[:idx], s[idx + 1 :]


def extract_pdf(
    pdf_path: Path,
    source_slug: str,
    scale: float,
    image_format: str,
    jpg_quality: int,
    render_images: bool,
    skip_existing_images: bool,
) -> Tuple[Dict[str, List[Dict[str, str]]], Dict[str, int]]:
    """
    Returns:
      - page_items mapping: "<source>_page_<n>" -> [ {name, category}, ... ]
      - stats: {"pages_total": int, "pages_with_items": int}
    """
    doc = fitz.open(pdf_path)
    out_dir = IMAGES_DIR / source_slug
    out_dir.mkdir(parents=True, exist_ok=True)

    mat = fitz.Matrix(scale, scale)
    extracted: Dict[str, List[Dict[str, str]]] = {}
    pages_total = doc.page_count
    pages_with_items = 0

    for i in range(doc.page_count):
        page_num = i + 1
        page = doc.load_page(i)

        # Render image
        if render_images:
            out_path = out_dir / f"page_{page_num}.{image_format}"
            if not (skip_existing_images and out_path.exists()):
                pix = page.get_pixmap(matrix=mat, alpha=False)
                if image_format == "jpg":
                    pix.save(out_path, jpg_quality=jpg_quality)
                else:
                    pix.save(out_path)

        # Extract item list
        text = page.get_text("text") or ""
        items = extract_page_items(text)
        if items:
            pages_with_items += 1
            key = f"{source_slug}_page_{page_num}"
            extracted[key] = items

    doc.close()
    return extracted, {"pages_total": pages_total, "pages_with_items": pages_with_items}


def main() -> None:
    parser = argparse.ArgumentParser(description="Extract images + item lists from Brynn PDFs.")
    parser.add_argument(
        "--pdf-dir",
        type=Path,
        default=DEFAULT_PDF_DIR,
        help=f"Directory containing PDFs (default: {DEFAULT_PDF_DIR})",
    )
    parser.add_argument(
        "--scale",
        type=float,
        default=2.0,
        help="Render scale for page images (default: 2.0).",
    )
    parser.add_argument(
        "--image-format",
        choices=["jpg", "png"],
        default="jpg",
        help="Output image format for rendered pages (default: jpg).",
    )
    parser.add_argument(
        "--jpg-quality",
        type=int,
        default=85,
        help="JPEG quality (1-100) when --image-format=jpg (default: 85).",
    )
    parser.add_argument(
        "--no-render",
        action="store_true",
        help="Skip rendering page images (text extraction only).",
    )
    parser.add_argument(
        "--clean",
        action="store_true",
        help="Delete existing images/ and data/collections.json before extracting.",
    )
    parser.add_argument(
        "--overwrite-images",
        action="store_true",
        help="Re-render page images even if they already exist.",
    )
    args = parser.parse_args()

    pdf_dir: Path = args.pdf_dir
    if not pdf_dir.exists():
        raise SystemExit(f"PDF dir not found: {pdf_dir}")

    if args.clean:
        if IMAGES_DIR.exists():
            shutil.rmtree(IMAGES_DIR)
        (DATA_DIR / "collections.json").unlink(missing_ok=True)

    IMAGES_DIR.mkdir(parents=True, exist_ok=True)
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    pdfs = sorted(pdf_dir.glob("*.pdf"))
    if not pdfs:
        raise SystemExit(f"No PDFs found in: {pdf_dir}")

    # Build per-PDF sources with unique slugs.
    source_labels: Dict[str, str] = {}
    slug_counts: Dict[str, int] = defaultdict(int)
    pdf_sources: List[Tuple[Path, str]] = []

    for pdf_path in pdfs:
        label = infer_pdf_label(pdf_path)
        slug = slugify(label)
        slug_counts[slug] += 1
        if slug_counts[slug] > 1:
            slug = f"{slug}-{slug_counts[slug]}"

        source_labels[slug] = label
        pdf_sources.append((pdf_path, slug))

    all_items: Dict[str, List[Dict[str, str]]] = {}
    stats_by_source: Dict[str, Dict[str, int]] = {}

    for pdf_path, slug in pdf_sources:
        print(f"Processing {pdf_path.name} -> {slug} ({source_labels[slug]})")
        extracted, stats = extract_pdf(
            pdf_path,
            slug,
            scale=args.scale,
            image_format=args.image_format,
            jpg_quality=args.jpg_quality,
            render_images=not args.no_render,
            skip_existing_images=not args.overwrite_images,
        )
        all_items.update(extracted)
        stats_by_source[slug] = stats
        print(f"  pages: {stats['pages_total']}  pages_with_items: {stats['pages_with_items']}")

    # Build inverted index: item -> pages
    all_index: Dict[str, List[str]] = defaultdict(list)
    for page_key, items in all_items.items():
        for item in items:
            name = item.get("name", "").strip()
            if not name:
                continue
            all_index[name].append(page_key)

    # Deduplicate + sort pages for each item.
    all_index_sorted: Dict[str, List[str]] = {}
    for name, pages in all_index.items():
        uniq = sorted(set(pages), key=page_sort_key)
        all_index_sorted[name] = uniq

    # Map sources -> image folder paths (relative for static and Flask).
    source_image_paths = {slug: f"images/{slug}" for slug in source_labels.keys()}

    app_data = {
        "all_index": all_index_sorted,
        "all_items": all_items,
        "source_image_paths": source_image_paths,
        "source_labels": source_labels,
        "category_order": CATEGORY_ORDER,
        "category_icons": CATEGORY_ICONS,
        "edit_mode_enabled": False,
        "stats_by_source": stats_by_source,
    }

    out_path = DATA_DIR / "collections.json"
    out_path.write_text(json.dumps(app_data, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"\nWrote app data: {out_path}")


if __name__ == "__main__":
    main()
