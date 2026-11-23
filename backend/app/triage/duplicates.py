"""Lexical duplicate detection: TF-IDF cosine similarity in pure Python."""

from __future__ import annotations

import math
import re
from collections import Counter
from dataclasses import dataclass

from app.schemas.triage import DuplicateCandidate

STOPWORDS = frozenset(
    """a an the and or but if then else when is are was were be been being to of in on at for
    with by from as it its this that these those i we you he she they my our your their me us
    them not no do does did doing have has had can could should would will just so than too very
    there here what which who how why all any some such only own same into over under again
    further once about against between through during before after above below up down out off
    more most other each few both nor also get got using use used am im ive dont doesnt cant
    please thanks thank hi hello issue""".split()
)

_CODE_BLOCK = re.compile(r"```[\s\S]*?```")
_TOKEN = re.compile(r"[a-z0-9_]+")


def stem(token: str) -> str:
    if len(token) > 4 and token.endswith("ies"):
        return token[:-3] + "y"
    if len(token) > 5 and token.endswith("ing"):
        return token[:-3]
    if len(token) > 4 and token.endswith("ed"):
        return token[:-2]
    if len(token) > 4 and token.endswith(("ches", "shes", "sses", "xes")):
        return token[:-2]
    if len(token) > 3 and token.endswith("s") and not token.endswith("ss"):
        return token[:-1]
    return token


def tokenize(text: str) -> list[str]:
    out = []
    for tok in _TOKEN.findall(text.lower()):
        if len(tok) < 2 or tok in STOPWORDS:
            continue
        out.append(stem(tok))
    return out


def document_text(title: str, body: str) -> str:
    body_clean = _CODE_BLOCK.sub(" ", body or "")[:2000]
    return f"{title} {title} {body_clean}"


@dataclass
class _Doc:
    issue_id: int
    number: int
    title: str
    body: str
    vector: dict[str, float]


class DuplicateIndex:
    def __init__(self, docs: list[tuple[int, int, str, str]]) -> None:
        """docs: (issue_id, number, title, body)."""
        tokenized = [Counter(tokenize(document_text(t, b))) for _, _, t, b in docs]
        n = len(docs)
        df: Counter[str] = Counter()
        for tf in tokenized:
            df.update(tf.keys())
        self._idf = {term: math.log((1 + n) / (1 + c)) + 1.0 for term, c in df.items()}
        self._docs: list[_Doc] = []
        for (issue_id, number, title, body), tf in zip(docs, tokenized, strict=True):
            self._docs.append(_Doc(issue_id, number, title, body, self._vectorize(tf)))

    def _vectorize(self, tf: Counter[str]) -> dict[str, float]:
        vec = {t: (1 + math.log(c)) * self._idf.get(t, 1.0) for t, c in tf.items()}
        norm = math.sqrt(sum(v * v for v in vec.values())) or 1.0
        return {t: v / norm for t, v in vec.items()}

    @staticmethod
    def _cosine(a: dict[str, float], b: dict[str, float]) -> float:
        if len(a) > len(b):
            a, b = b, a
        return sum(v * b.get(t, 0.0) for t, v in a.items())

    def candidates(
        self, issue_id: int, *, threshold: float, top_k: int = 5
    ) -> list[DuplicateCandidate]:
        target = next((d for d in self._docs if d.issue_id == issue_id), None)
        if target is None:
            return []
        scored = []
        for d in self._docs:
            if d.issue_id == issue_id:
                continue
            sim = self._cosine(target.vector, d.vector)
            if sim >= threshold:
                scored.append((sim, d))
        scored.sort(key=lambda x: (-x[0], x[1].number))
        out = []
        for sim, d in scored[:top_k]:
            excerpt = " ".join(_CODE_BLOCK.sub(" ", d.body).split())[:300]
            out.append(
                DuplicateCandidate(
                    issue_id=d.issue_id,
                    number=d.number,
                    title=d.title,
                    similarity=round(min(sim, 1.0), 3),
                    excerpt=excerpt,
                )
            )
        return out
