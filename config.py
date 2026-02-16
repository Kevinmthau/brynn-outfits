#!/usr/bin/env python3
"""
Configuration for Brynn's Outfit Finder.

This is intentionally separate from the root app's config because the
categories and data sources differ from Kevin's collections.
"""

from pathlib import Path
from typing import Dict, List


BASE_DIR = Path(__file__).parent

# Default PDF input location.
# Prefer a local `pdfs/` folder in the repo if present; otherwise fall back
# to the original Desktop location used during initial extraction.
_repo_pdfs_dir = BASE_DIR / "pdfs"
DEFAULT_PDF_DIR = _repo_pdfs_dir if _repo_pdfs_dir.exists() else (Path.home() / "Desktop" / "brynn-outfits" / "pdfs")

# Output locations (inside this repo).
IMAGES_DIR = BASE_DIR / "images"
DATA_DIR = BASE_DIR / "data"


# =============================================================================
# Categorization
# =============================================================================

CATEGORY_ORDER: Dict[str, List[str]] = {
    # Single collection used by the Brynn app.
    "all": [
        "Shorts",
        "Bottoms",
        "Skirts",
        "Dresses",
        "Sweaters",
        "Tops",
        "Outerwear",
        "Boots",
        "Footwear",
        "Bags",
        "Accessories",
        "Other",
    ],
}

CATEGORY_ICONS: Dict[str, str] = {
    "Outerwear": "🧥",
    "Sweaters": "🧶",
    "Tops": "👚",
    "Bottoms": "👖",
    "Shorts": "🩳",
    "Skirts": "👗",
    "Dresses": "💃",
    "Boots": "👢",
    "Footwear": "👠",
    "Bags": "👜",
    "Accessories": "🧣",
    "Other": "📦",
}

# Keyword-based categorization.
# Order is controlled by CATEGORY_ORDER["all"].
CATEGORY_KEYWORDS: Dict[str, List[str]] = {
    "Shorts": [
        "shorts", "short",
    ],
    "Sweaters": [
        "sweater", "sweaters", "crew", "crewneck", "v neck", "vneck",
    ],
    "Boots": [
        "boot", "boots", "bootie", "booties",
    ],
    "Bottoms": [
        "trouser", "pant", "jean", "denim", "legging", "tight", "tights",
        "skort", "capri",
    ],
    "Skirts": [
        "skirt", "mini skirt", "midi skirt", "maxi skirt",
        # Many skirt items are labeled as "<brand> ... mini" without the word "skirt".
        "mini",
    ],
    "Dresses": [
        "dress", "gown", "set", "jumpsuit", "romper",
    ],
    "Tops": [
        "top", "tank", "tee", "t-shirt", "shirt", "blouse",
        "hoodie", "polo", "cardigan", "knit", "pullover",
        "turtleneck", "bodysuit", "camisole",
    ],
    "Outerwear": [
        "coat", "jacket", "blazer", "trench", "shearling", "bomber", "parka",
        "cape", "poncho", "raincoat",
        # Common fur descriptors used in the PDFs without "coat/jacket" explicitly.
        "mink", "sable", "fur", "sheared", "palomino", "chevron",
    ],
    "Footwear": [
        "shoe", "loafer", "heel", "flat", "slingback", "mule",
        "sandal", "pump", "ballet", "boat shoe", "thong", "slipper", "sneaker",
    ],
    "Bags": [
        "bag", "tote", "clutch", "kelly", "birkin", "pochette", "purse", "pouch",
        "mini kelly", "backpack",
    ],
    "Accessories": [
        "belt", "scarf", "hat", "beanie", "sunglasses", "earring", "necklace",
        "bracelet", "ring", "brooch", "watch", "glove",
    ],
}


# =============================================================================
# PDF text cleanup
# =============================================================================

IGNORE_TEXT_SUBSTRINGS = [
    "Fall/Winter Looks",
    "Spring/Summer Looks",
]
