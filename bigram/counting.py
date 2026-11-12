"""Approach 1: count every character pair and turn the counts into probabilities."""
from __future__ import annotations

import torch

from .vocab import Vocab, bigrams


class CountingBigram:
    """A 27x27 lookup table: row = current character, column = next character."""

    def __init__(self, vocab: Vocab, smoothing: int = 1):
        self.vocab = vocab
        self.smoothing = smoothing
        n = len(vocab)
        self.N = torch.zeros((n, n), dtype=torch.int32)
        self.P = torch.full((n, n), 1.0 / n)

    def fit(self, words: list[str]) -> "CountingBigram":
        stoi = self.vocab.stoi
        self.N.zero_()
        for w in words:
            for a, b in bigrams(w):
                self.N[stoi[a], stoi[b]] += 1
        # Add-k smoothing so unseen pairs never get probability 0 (log 0 = -inf).
        P = (self.N + self.smoothing).float()
        self.P = P / P.sum(dim=1, keepdim=True)
        return self

    def probs(self) -> torch.Tensor:
        return self.P
