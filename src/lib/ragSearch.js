// Client-side search over the 51 hand-written articles in
// content/rag-articles.js. No embeddings/model needed - the corpus is small
// enough that simple token-overlap scoring (title/tags weighted higher than
// body) gives good-enough results for a "Ask a Question" fallback before a
// real backend exists.
import { RAG_ARTICLES } from '../../content/rag-articles.js';

function tokenize(s) {
  return (s || '').toLowerCase().match(/[a-z0-9]+/g) || [];
}

export function searchArticles(query, { limit = 5 } = {}) {
  const qTokens = new Set(tokenize(query));
  if (qTokens.size === 0) return [];

  const scored = RAG_ARTICLES.map((article) => {
    const titleTokens = tokenize(article.title);
    const tagTokens = article.tags.flatMap(tokenize);
    const bodyTokens = tokenize(article.body);
    let score = 0;
    for (const qt of qTokens) {
      if (titleTokens.includes(qt)) score += 3;
      if (tagTokens.includes(qt)) score += 2;
      if (bodyTokens.includes(qt)) score += 1;
    }
    return { article, score };
  });

  return scored
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((r) => r.article);
}

export function articlesByCategories(categories) {
  return RAG_ARTICLES.filter((a) => categories.includes(a.category));
}

export { RAG_ARTICLES };
