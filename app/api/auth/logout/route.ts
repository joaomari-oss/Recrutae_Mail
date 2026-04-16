import { NextResponse } from 'next/server'
import { cookieOptions } from '@/lib/auth'

export async function POST() {
  const { name, path } = cookieOptions()
  const response = NextResponse.json({ success: true })
  // Expire the cookie immediately
  response.cookies.set(name, '', { maxAge: 0, path, httpOnly: true })
  return response
}
