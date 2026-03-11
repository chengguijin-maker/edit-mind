import { createCookieSessionStorage } from 'react-router'
import { env } from '~/env'

export const sessionStorage = createCookieSessionStorage({
  cookie: {
    name: process.env.NODE_ENV === 'production' ? '__session' : '__session_dev',
    httpOnly: true,
    path: '/',
    sameSite: 'lax',
    secrets: [env.SESSION_SECRET],
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * 30,
    domain: undefined,
  },
})

export const { getSession, commitSession, destroySession } = sessionStorage
