import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, PutCommand, UpdateCommand, QueryCommand } from '@aws-sdk/lib-dynamodb'

// ── Offline cache helpers ──────────────────────────────────────────────────
const CACHE_KEY = 'entriesCache'
const PENDING_KEY = 'pendingWrites'

function loadCache() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY)) } catch { return null }
}

function saveCache(entries) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(entries)) } catch {}
}

function patchCache(entry, type) {
  const cache = loadCache() || []
  if (type === 'create') {
    saveCache([entry, ...cache])
  } else {
    saveCache(cache.map(e => e.entryId === entry.entryId ? { ...e, ...entry } : e))
  }
}

export function queueOfflineWrite(type, payload) {
  const queue = JSON.parse(localStorage.getItem(PENDING_KEY) || '[]')
  queue.push({ type, payload })
  localStorage.setItem(PENDING_KEY, JSON.stringify(queue))
  patchCache(payload, type)
}

export function hasPendingWrites() {
  try { return JSON.parse(localStorage.getItem(PENDING_KEY) || '[]').length > 0 } catch { return false }
}

export async function flushPendingWrites() {
  const queue = JSON.parse(localStorage.getItem(PENDING_KEY) || '[]')
  if (!queue.length) return 0
  const remaining = []
  for (const item of queue) {
    try {
      if (item.type === 'create') await createEntry(item.payload)
      else await updateEntry(item.payload)
    } catch {
      remaining.push(item)
    }
  }
  localStorage.setItem(PENDING_KEY, JSON.stringify(remaining))
  return queue.length - remaining.length
}
// ──────────────────────────────────────────────────────────────────────────

const TABLE = 'journal_entries'

const dynamoClient = new DynamoDBClient({
  region: import.meta.env.VITE_AWS_REGION,
  credentials: {
    accessKeyId: import.meta.env.VITE_AWS_ACCESS_KEY_ID,
    secretAccessKey: import.meta.env.VITE_AWS_SECRET_ACCESS_KEY,
  },
})
const docClient = DynamoDBDocumentClient.from(dynamoClient)

// Returns YYYY-MM-DD in local timezone, with a 4am cutoff
// (midnight–3:59am counts as the previous calendar day)
export function toLocalDate(d = new Date()) {
  const shifted = new Date(d.getTime() - 4 * 60 * 60 * 1000)
  return [
    shifted.getFullYear(),
    String(shifted.getMonth() + 1).padStart(2, '0'),
    String(shifted.getDate()).padStart(2, '0'),
  ].join('-')
}

export function countWords(text) {
  if (!text || !text.trim()) return 0
  return text.trim().split(/\s+/).filter(Boolean).length
}

export async function createEntry({ userId, entryId, date, createdAt, title, body, notes, tags, wordCount }) {
  await docClient.send(new PutCommand({
    TableName: TABLE,
    Item: {
      userId: `USER#${userId}`,
      createdAt,
      entryId,
      date,
      updatedAt: createdAt,
      title,
      body,
      notes: notes || '',
      tags: tags || [],
      wordCount,
    },
  }))
}

export async function updateEntry({ userId, createdAt, title, body, notes, tags, wordCount }) {
  const updatedAt = new Date().toISOString()
  await docClient.send(new UpdateCommand({
    TableName: TABLE,
    Key: { userId: `USER#${userId}`, createdAt },
    UpdateExpression: 'SET title = :t, body = :b, notes = :n, tags = :tg, wordCount = :wc, updatedAt = :ua',
    ExpressionAttributeValues: {
      ':t': title,
      ':b': body,
      ':n': notes || '',
      ':tg': tags || [],
      ':wc': wordCount,
      ':ua': updatedAt,
    },
  }))
}

export async function fetchEntries({ userId }) {
  try {
    const result = await docClient.send(new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: 'userId = :pk',
      ExpressionAttributeValues: { ':pk': `USER#${userId}` },
      ScanIndexForward: false,
    }))
    const entries = (result.Items || []).map(item => ({
      ...item,
      tags: Array.isArray(item.tags) ? item.tags : item.tags ? [...item.tags] : [],
    }))
    saveCache(entries)
    return entries
  } catch (err) {
    const cache = loadCache()
    if (cache) return cache
    throw err
  }
}

export function computeStreaks(entries) {
  if (!entries.length) return { currentStreak: 0, longestStreak: 0 }

  const dateSet = new Set(entries.map(e => e.date))
  const today = toLocalDate()
  const yesterdayDate = new Date(today + 'T12:00:00')
  yesterdayDate.setDate(yesterdayDate.getDate() - 1)
  const yesterday = toLocalDate(yesterdayDate)

  // Current streak: walk back from today (or yesterday if no entry today)
  let currentStreak = 0
  const startDate = dateSet.has(today) ? today : dateSet.has(yesterday) ? yesterday : null

  if (startDate) {
    const cursor = new Date(startDate + 'T12:00:00')
    while (dateSet.has(toLocalDate(cursor))) {
      currentStreak++
      cursor.setDate(cursor.getDate() - 1)
    }
  }

  // Longest streak: walk through sorted unique dates
  const sortedDates = [...dateSet].sort()
  let longestStreak = sortedDates.length ? 1 : 0
  let run = 1

  for (let i = 1; i < sortedDates.length; i++) {
    const prev = new Date(sortedDates[i - 1] + 'T12:00:00')
    const curr = new Date(sortedDates[i] + 'T12:00:00')
    const diffDays = Math.round((curr - prev) / 86400000)
    if (diffDays === 1) {
      run++
      longestStreak = Math.max(longestStreak, run)
    } else {
      run = 1
    }
  }

  return { currentStreak, longestStreak: Math.max(longestStreak, currentStreak) }
}
