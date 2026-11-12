"""Approach 2: a single linear layer trained with gradient descent.

Input is a one-hot vector for the current character; the output logits go
through softmax to give next-character probabilities. Because the input is
one-hot, `xenc @ W` just picks row W[ix], so exp(W) plays the same role as the
count matrix N in the counting model, and training converges to (nearly) the
same table.
"""
from __future__ import annotations

import torch
import torch.nn.functional as F

from .vocab import Vocab, bigrams


def build_dataset(words: list[str], vocab: Vocab) -> tuple[torch.Tensor, torch.Tensor]:
    xs, ys = [], []
    for w in words:
        for a, b in bigrams(w):
            xs.append(vocab.stoi[a])
            ys.append(vocab.stoi[b])
    return torch.tensor(xs), torch.tensor(ys)


class NeuralBigram:
    def __init__(self, vocab: Vocab, seed: int = 2147483647):
        self.vocab = vocab
        n = len(vocab)
        g = torch.Generator().manual_seed(seed)
        self.W = torch.randn((n, n), generator=g, requires_grad=True)
        self.history: list[float] = []

    def loss(self, xs: torch.Tensor, ys: torch.Tensor, reg: float = 0.0) -> torch.Tensor:
        xenc = F.one_hot(xs, num_classes=len(self.vocab)).float()
        logits = xenc @ self.W
        loss = F.cross_entropy(logits, ys)
        if reg:
            # Pulling W toward 0 pushes probabilities toward uniform, the
            # gradient-descent equivalent of count smoothing.
            loss = loss + reg * (self.W**2).mean()
        return loss

    def fit(
        self,
        xs: torch.Tensor,
        ys: torch.Tensor,
        steps: int = 1000,
        lr: float = 50.0,
        reg: float = 0.0,
        log_every: int = 100,
        verbose: bool = True,
    ) -> "NeuralBigram":
        for k in range(steps):
            loss = self.loss(xs, ys, reg)
            self.W.grad = None
            loss.backward()
            with torch.no_grad():
                self.W -= lr * self.W.grad
            self.history.append(loss.item())
            if verbose and (k == 0 or (k + 1) % log_every == 0):
                print(f"  step {k + 1:4d}/{steps} | loss {loss.item():.4f}")
        return self

    def probs(self) -> torch.Tensor:
        with torch.no_grad():
            return torch.softmax(self.W, dim=1)
