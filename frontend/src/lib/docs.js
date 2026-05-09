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

export async function updateDoc({ userId, createdAt, title, body, tags }) {
  const updatedAt = new Date().toISOString()
  const wc = countWords(body)
  await docClient.send(new UpdateCommand({
    TableName: TABLE,
    Key: { userId: `READER#${userId}`, createdAt },
    UpdateExpression: 'SET title = :t, body = :b, tags = :tg, wordCount = :wc, updatedAt = :ua',
    ExpressionAttributeValues: {
      ':t': title,
      ':b': body,
      ':tg': tags || [],
      ':wc': wc,
      ':ua': updatedAt,
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
