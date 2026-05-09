import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, PutCommand, UpdateCommand, QueryCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb'
import { countWords } from './entries'

const TABLE = 'journal_entries'
const CACHE_KEY = 'docsCache'

const dynamoClient = new DynamoDBClient({
  region: import.meta.env.VITE_AWS_REGION,
  credentials: {
    accessKeyId: import.meta.env.VITE_AWS_ACCESS_KEY_ID,
    secretAccessKey: import.meta.env.VITE_AWS_SECRET_ACCESS_KEY,
  },
})
const docClient = DynamoDBDocumentClient.from(dynamoClient)

function loadCache() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY)) } catch { return null }
}
function saveCache(docs) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(docs)) } catch {}
}

export { countWords }

// Strip **bold** and __underline__ markers to get visible text (same space highlights live in)
export function toVisibleText(raw) {
  return (raw || '').replace(/\*\*(.+?)\*\*/gs, '$1').replace(/__(.+?)__/gs, '$1')
}

// Adjust highlight offsets after text is edited.
// Highlights entirely before the changed region are kept as-is.
// Highlights entirely after are shifted by the net character delta.
// Highlights overlapping the changed region are removed.
export function adjustHighlights(oldVisible, newVisible, highlights) {
  if (!highlights || highlights.length === 0) return []
  if (oldVisible === newVisible) return highlights

  // Longest common prefix
  let pre = 0
  const minLen = Math.min(oldVisible.length, newVisible.length)
  while (pre < minLen && oldVisible[pre] === newVisible[pre]) pre++

  // Longest common suffix (without overlapping prefix)
  let suf = 0
  while (
    suf < oldVisible.length - pre &&
    suf < newVisible.length - pre &&
    oldVisible[oldVisible.length - 1 - suf] === newVisible[newVisible.length - 1 - suf]
  ) suf++

  const oldChangeEnd = oldVisible.length - suf  // exclusive end in old text
  const delta = newVisible.length - oldVisible.length

  return highlights
    .map(h => {
      if (h.end <= pre) return h                                       // before change
      if (h.start >= oldChangeEnd) return { start: h.start + delta, end: h.end + delta } // after change
      return null                                                       // overlaps change → drop
    })
    .filter(Boolean)
}

export async function fetchDocs({ userId }) {
  try {
    const result = await docClient.send(new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: 'userId = :pk',
      ExpressionAttributeValues: { ':pk': `READER#${userId}` },
      ScanIndexForward: false,
    }))
    const docs = (result.Items || []).map(item => ({
      ...item,
      tags: Array.isArray(item.tags) ? item.tags : item.tags ? [...item.tags] : [],
      highlights: Array.isArray(item.highlights) ? item.highlights : [],
    }))
    saveCache(docs)
    return docs
  } catch (err) {
    const cache = loadCache()
    if (cache) return cache
    throw err
  }
}

export async function createDoc({ userId, docId, createdAt, title, body, tags }) {
  const wc = countWords(body)
  await docClient.send(new PutCommand({
    TableName: TABLE,
    Item: {
      userId: `READER#${userId}`,
      createdAt,
      docId,
      updatedAt: createdAt,
      title,
      body,
      tags: tags || [],
      wordCount: wc,
      highlights: [],
    },
  }))
  return wc
}

export async function updateHighlights({ userId, createdAt, highlights }) {
  await docClient.send(new UpdateCommand({
    TableName: TABLE,
    Key: { userId: `READER#${userId}`, createdAt },
    UpdateExpression: 'SET highlights = :h',
    ExpressionAttributeValues: { ':h': highlights },
  }))
  const cache = loadCache()
  if (cache) saveCache(cache.map(d => d.createdAt === createdAt ? { ...d, highlights } : d))
}

export async function updateDoc({ userId, createdAt, title, body, tags, highlights }) {
  const updatedAt = new Date().toISOString()
  const wc = countWords(body)
  const hasHighlights = highlights !== undefined
  await docClient.send(new UpdateCommand({
    TableName: TABLE,
    Key: { userId: `READER#${userId}`, createdAt },
    UpdateExpression: 'SET title = :t, body = :b, tags = :tg, wordCount = :wc, updatedAt = :ua'
      + (hasHighlights ? ', highlights = :h' : ''),
    ExpressionAttributeValues: {
      ':t': title,
      ':b': body,
      ':tg': tags || [],
      ':wc': wc,
      ':ua': updatedAt,
      ...(hasHighlights ? { ':h': highlights } : {}),
    },
  }))
  return wc
}

export async function deleteDoc({ userId, createdAt }) {
  await docClient.send(new DeleteCommand({
    TableName: TABLE,
    Key: { userId: `READER#${userId}`, createdAt },
  }))
  const cache = loadCache()
  if (cache) saveCache(cache.filter(d => d.createdAt !== createdAt))
}
