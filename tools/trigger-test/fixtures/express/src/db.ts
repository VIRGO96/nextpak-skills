// In-memory data store (stands in for the real database).
export type Role = 'user' | 'admin';

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: Role;
  passwordHash: string;
}

export interface Order {
  id: string;
  userId: string;
  total: number;
  status: 'pending' | 'paid' | 'shipped';
  createdAt: string;
}

export const ALICE_ID = '11111111-1111-4111-8111-111111111111';
export const BOB_ID = '22222222-2222-4222-8222-222222222222';

export let users: User[] = [];
export let orders: Order[] = [];
export let tokens: Record<string, string> = {};

export function reset() {
  users = [
    { id: ALICE_ID, name: 'Alice', email: 'alice@example.com', phone: null, role: 'user', passwordHash: '$2b$10$alicehash' },
    { id: BOB_ID, name: 'Bob', email: 'bob@example.com', phone: '+100000', role: 'user', passwordHash: '$2b$10$bobhash' },
  ];
  orders = [
    { id: 'aaaaaaaa-0000-4000-8000-000000000001', userId: ALICE_ID, total: 50, status: 'paid', createdAt: '2026-10-01T10:00:00Z' },
    { id: 'bbbbbbbb-0000-4000-8000-000000000001', userId: BOB_ID, total: 75, status: 'pending', createdAt: '2026-10-02T10:00:00Z' },
  ];
  tokens = { 'token-alice': ALICE_ID, 'token-bob': BOB_ID };
}

reset();
