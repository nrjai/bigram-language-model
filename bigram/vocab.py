"""Loading names and mapping characters to integers.

The token '.' marks both the start and the end of a name, so every name
"emma" becomes the sequence . e m m a . and the vocabulary has 27 entries:
'.' at index 0 and 'a'..'z' at 1..26.
"""
from __future__ import annotations

from pathlib import Path

BOUNDARY = "."


def load_words(path: str | Path) -> list[str]:
    """Read one lowercase name per line, skipping blank lines."""
    text = Path(path).read_text(encoding="utf-8")
    return [w.strip().lower() for w in text.splitlines() if w.strip()]


class Vocab:
    def __init__(self, words: list[str]):
        chars = sorted(set("".join(words)))
        if BOUNDARY in chars:
            raise ValueError(f"names must not contain the boundary token {BOUNDARY!r}")
        self.stoi: dict[str, int] = {s: i + 1 for i, s in enumerate(chars)}
        self.stoi[BOUNDARY] = 0
        self.itos: dict[int, str] = {i: s for s, i in self.stoi.items()}

    def __len__(self) -> int:
        return len(self.stoi)

    @property
    def chars(self) -> list[str]:
        """All tokens in index order, boundary first."""
        return [self.itos[i] for i in range(len(self))]


def bigrams(word: str):
    """Yield every (current, next) character pair, boundary-padded."""
    chs = [BOUNDARY] + list(word) + [BOUNDARY]
    yield from zip(chs, chs[1:])
