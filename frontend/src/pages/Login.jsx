import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import '../styles/Login.css'

export default function Login() {
  const { login } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (submitting) return
    setError('')
    setSubmitting(true)
    try {
      await login(username.trim(), password)
    } catch (err) {
      const name = err?.name || ''
      if (name === 'NotAuthorizedException' || name === 'UserNotFoundException') {
        setError('invalid username or password')
      } else if (err?.name === 'NetworkError' || err instanceof TypeError) {
        setError('connection error, try again')
      } else {
        setError(String(err?.message || err) || 'unknown error')
      }
      setSubmitting(false)
    }
  }

  return (
    <div className="login">
      <h1 className="login-title">journal</h1>
      <form className="login-form" onSubmit={handleSubmit}>
        <input
          className="login-input"
          type="email"
          placeholder="email"
          autoComplete="username"
          value={username}
          onChange={e => setUsername(e.target.value)}
          required
        />
        <input
          className="login-input"
          type="password"
          placeholder="password"
          autoComplete="current-password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
        />
        {error && <div className="login-error">{error}</div>}
        <button className="login-btn" type="submit" disabled={submitting}>
          {submitting ? '…' : 'sign in'}
        </button>
      </form>
    </div>
  )
}
