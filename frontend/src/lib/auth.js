import {
  CognitoIdentityProviderClient,
  InitiateAuthCommand,
  GlobalSignOutCommand,
} from '@aws-sdk/client-cognito-identity-provider'

const REGION = import.meta.env.VITE_AWS_REGION
const CLIENT_ID = import.meta.env.VITE_COGNITO_CLIENT_ID

const client = new CognitoIdentityProviderClient({
  region: REGION,
  credentials: {
    accessKeyId: import.meta.env.VITE_AWS_ACCESS_KEY_ID,
    secretAccessKey: import.meta.env.VITE_AWS_SECRET_ACCESS_KEY,
  },
})

const STORAGE_KEYS = {
  idToken: 'cognito_id_token',
  accessToken: 'cognito_access_token',
  refreshToken: 'cognito_refresh_token',
}

function saveTokens({ IdToken, AccessToken, RefreshToken }) {
  if (IdToken) localStorage.setItem(STORAGE_KEYS.idToken, IdToken)
  if (AccessToken) localStorage.setItem(STORAGE_KEYS.accessToken, AccessToken)
  if (RefreshToken) localStorage.setItem(STORAGE_KEYS.refreshToken, RefreshToken)
}

export function clearTokens() {
  localStorage.removeItem(STORAGE_KEYS.idToken)
  localStorage.removeItem(STORAGE_KEYS.accessToken)
  localStorage.removeItem(STORAGE_KEYS.refreshToken)
}

function decodeJwt(token) {
  try {
    const payload = token.split('.')[1]
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(atob(normalized))
  } catch {
    return null
  }
}

function userFromIdToken(idToken) {
  const claims = decodeJwt(idToken)
  if (!claims) return null
  return {
    userId: claims.sub,
    username: claims.email || claims['cognito:username'] || claims.sub,
  }
}

export function getCurrentUser() {
  const idToken = localStorage.getItem(STORAGE_KEYS.idToken)
  if (!idToken) return null
  return userFromIdToken(idToken)
}

export async function login(username, password) {
  const response = await client.send(new InitiateAuthCommand({
    AuthFlow: 'USER_PASSWORD_AUTH',
    ClientId: CLIENT_ID,
    AuthParameters: { USERNAME: username, PASSWORD: password },
  }))

  if (!response.AuthenticationResult) {
    throw new Error('Authentication challenge not supported')
  }

  saveTokens(response.AuthenticationResult)
  const user = userFromIdToken(response.AuthenticationResult.IdToken)
  if (!user) throw new Error('Failed to decode user from token')
  return user
}

export async function refreshSession() {
  const refreshToken = localStorage.getItem(STORAGE_KEYS.refreshToken)
  if (!refreshToken) return null

  try {
    const response = await client.send(new InitiateAuthCommand({
      AuthFlow: 'REFRESH_TOKEN_AUTH',
      ClientId: CLIENT_ID,
      AuthParameters: { REFRESH_TOKEN: refreshToken },
    }))
    saveTokens({ ...response.AuthenticationResult, RefreshToken: refreshToken })
    return userFromIdToken(response.AuthenticationResult.IdToken)
  } catch (err) {
    const name = err?.name || ''
    if (name === 'NotAuthorizedException' || name === 'InvalidParameterException') {
      clearTokens()
    }
    return null
  }
}

export async function logout() {
  const accessToken = localStorage.getItem(STORAGE_KEYS.accessToken)
  if (accessToken) {
    try {
      await client.send(new GlobalSignOutCommand({ AccessToken: accessToken }))
    } catch (_) {}
  }
  clearTokens()
}
