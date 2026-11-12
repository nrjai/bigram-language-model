"""Shared helpers: generate names from a probability table and score real names."""
from __future__ import annotations

import torch

from .vocab import Vocab, bigrams


def sample(
    P: torch.Tensor,
    vocab: Vocab,
    n: int = 10,
    seed: int = 2147483647,
    max_len: int = 50,
) -> list[str]:
    """Walk the table one character at a time until the end token comes up."""
    g = torch.Generator().manual_seed(seed)
    names = []
    for _ in range(n):
        out, ix = [], 0
        while len(out) < max_len:
            ix = torch.multinomial(P[ix], num_samples=1, replacement=True, generator=g).item()
            if ix == 0:
                break
            out.append(vocab.itos[ix])
        names.append("".join(out))
    return names


def nll(P: torch.Tensor, vocab: Vocab, words: list[str]) -> float:
    """Average negative log-likelihood per character pair (lower is better)."""
    total, count = 0.0, 0
    logP = P.log()
    for w in words:
        for a, b in bigrams(w):
            total -= logP[vocab.stoi[a], vocab.stoi[b]].item()
            count += 1
    return total / count
