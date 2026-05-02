import { createPostgresAdapter } from '@dns-ops/db';

const url = process.env.DATABASE_URL;
console.log('Connecting to:', url?.replace(/:[^:@]+@/, ':****@'));

try {
  const db = createPostgresAdapter(url!);
  console.log('Adapter created');
  
  // Test query
  const result = await db.execute('SELECT NOW() as now');
  console.log('Query result:', result);
} catch (err) {
  console.error('Error:', err);
}
