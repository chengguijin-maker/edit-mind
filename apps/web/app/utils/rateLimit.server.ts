const attempts = new Map<string, { count: number; resetTime: number }>()

export function checkRateLimit(
  key: string,
  maxAttempts: number = 5,
  windowMs: number = 15 * 60 * 1000
): { allowed: boolean; retryAfterMs: number } {
  const now = Date.now()
  const entry = attempts.get(key)

  if (!entry || now > entry.resetTime) {
    attempts.set(key, { count: 1, resetTime: now + windowMs })
    return { allowed: true, retryAfterMs: 0 }
  }

  if (entry.count >= maxAttempts) {
    return { allowed: false, retryAfterMs: entry.resetTime - now }
  }

  entry.count++
  return { allowed: true, retryAfterMs: 0 }
}
