import { cookies } from 'next/headers';
import { verifySession, SessionPayload } from './session';

export async function getCurrentUser(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get('resort_session')?.value;
  if (!token) return null;
  return verifySession(token);
}

export async function requireAuth(): Promise<SessionPayload> {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error('UNAUTHORIZED');
  }
  return user;
}