import sys
from pathlib import Path

import pytest
import torch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from bigram import CountingBigram, NeuralBigram, Vocab, bigrams, build_dataset, load_words, nll, sample  # noqa: E402

TOY = ["emma", "ava", "anna"]


def test_vocab_puts_boundary_first():
    v = Vocab(TOY)
    assert v.stoi["."] == 0
    assert v.chars == [".", "a", "e", "m", "n", "v"]


def test_bigrams_are_boundary_padded():
    assert list(bigrams("ab")) == [(".", "a"), ("a", "b"), ("b", ".")]


def test_counting_rows_are_distributions():
    v = Vocab(TOY)
    m = CountingBigram(v).fit(TOY)
    assert m.N.sum().item() == sum(len(w) + 1 for w in TOY)
    assert torch.allclose(m.probs().sum(1), torch.ones(len(v)))
    assert (m.probs() > 0).all()  # smoothing: nothing is impossible


def test_neural_learns_toward_counting():
    v = Vocab(TOY)
    xs, ys = build_dataset(TOY, v)
    start = NeuralBigram(v).loss(xs, ys).item()
    m = NeuralBigram(v).fit(xs, ys, steps=300, lr=10.0, verbose=False)
    assert m.history[-1] < start
    assert torch.allclose(m.probs().sum(1), torch.ones(len(v)))


def test_sample_is_reproducible_and_uses_vocab():
    v = Vocab(TOY)
    P = CountingBigram(v).fit(TOY).probs()
    a, b = sample(P, v, n=5, seed=1), sample(P, v, n=5, seed=1)
    assert a == b
    assert all(set(name) <= set(v.chars[1:]) for name in a)


@pytest.mark.skipif(not (ROOT / "data" / "names.txt").exists(), reason="dataset missing")
def test_full_dataset_matches_notebook_loss():
    words = load_words(ROOT / "data" / "names.txt")
    v = Vocab(words)
    assert len(words) == 32033
    assert len(v) == 27
    assert nll(CountingBigram(v).fit(words).probs(), v, words) == pytest.approx(2.4544, abs=1e-3)


@pytest.mark.skipif(not (ROOT / "data" / "indian_names.txt").exists(), reason="dataset missing")
def test_indian_names_are_clean():
    words = load_words(ROOT / "data" / "indian_names.txt")
    assert len(words) > 5000
    assert len(set(words)) == len(words)
    assert all(w.isalpha() and w.isascii() and 3 <= len(w) <= 15 for w in words)
    assert not {"smt", "km", "mohd"} & set(words)
    assert len(Vocab(words)) == 27
