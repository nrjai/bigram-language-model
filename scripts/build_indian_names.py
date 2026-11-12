"""Build data/indian_names.txt from two public lists of Indian names.

Source: mbejda's "Indian-Male-Names.csv" and "Indian-Female-Names.csv" gists
(~14k names each, collected from public records, widely used for NLP practice):
  https://gist.github.com/mbejda/7f86ca901fe41bc14a63
  https://gist.github.com/mbejda/9b93c7545c9dd93060bd

Cleaning: lowercase, keep letters only, drop honorifics and abbreviations
(smt, km, mohd, ...), keep the first remaining word, keep 3-15 letters,
de-duplicate, sort.

    python scripts/build_indian_names.py                  # download + build
    python scripts/build_indian_names.py male.csv female.csv  # from local files
"""
from __future__ import annotations

import csv
import io
import re
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "indian_names.txt"
URLS = [
    "https://gist.githubusercontent.com/mbejda/7f86ca901fe41bc14a63/raw",
    "https://gist.githubusercontent.com/mbejda/9b93c7545c9dd93060bd/raw",
]
# Titles and short forms that sit in front of the actual first name.
SKIP = {
    "smt", "shrimati", "sh", "shri", "sri", "km", "kum", "kumari", "mr", "mrs", "ms", "miss",
    "dr", "md", "mohd", "mohd", "mo", "mst", "ku", "baby", "master", "late", "s", "d", "w", "o",
}


def first_name(raw: str) -> str | None:
    words = re.sub(r"[^a-z ]", " ", raw.lower()).split()
    while words and words[0] in SKIP:
        words.pop(0)
    if not words:
        return None
    name = words[0]
    return name if 3 <= len(name) <= 15 else None


def read(source: str) -> str:
    if source.startswith("http"):
        with urllib.request.urlopen(source, timeout=30) as r:
            return r.read().decode("utf-8", errors="ignore")
    return Path(source).read_text(encoding="utf-8", errors="ignore")


def main() -> None:
    sources = sys.argv[1:] or URLS
    names: set[str] = set()
    for src in sources:
        for row in csv.DictReader(io.StringIO(read(src))):
            n = first_name(row.get("name") or "")
            if n:
                names.add(n)
    OUT.write_text("\n".join(sorted(names)) + "\n", encoding="utf-8")
    print(f"wrote {OUT.relative_to(ROOT)}: {len(names):,} unique first names")


if __name__ == "__main__":
    main()
