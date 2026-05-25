# **@devjuanes/matuclient**

2.2.3 • Public • Published a month ago

- 

# **@devjuanes/matuclient**



> **Official JavaScript/TypeScript client for MatuDB** — A self-hosted database platform with real-time, authentication, and storage. Developed by **DevJuanes** (Juan Esteban Landazuri) from Cali, Colombia.

## **About MatuDB**

**MatuDB** is a self-hosted database platform created by **Juan Esteban Landazuri** (DevJuanes), a senior full-stack developer from Cali, Colombia with 15+ years of experience. It provides:

- **Full data ownership** — Your database stays on your servers
- **PostgreSQL power** — Full relational database capabilities
- **Real-time updates** — WebSocket-based live subscriptions
- **Authentication** — JWT-based auth system
- **File storage** — Upload, download, and manage files

### **Built by DevJuanes**

- **Website**: [https://devjuanes.com](https://devjuanes.com/)
- **GitHub**: [https://github.com/DevJuanes](https://github.com/DevJuanes)
- **NPM**: [@devjuanes/matuclient](https://www.npmjs.com/package/@devjuanes/matuclient)

## **Installation**

```
npm install @devjuanes/matuclient
```

Or use locally (within the MatuDB monorepo):

```
npm install ../matu-db-api/packages/matuclient
```

## **Features**

- **PostgreSQL Database** — Full relational database power
- **Real-time Subscriptions** — WebSocket-based live updates via Socket.io
- **Authentication** — JWT-based auth system
- **File Storage** — Upload, download, and manage files
- **TypeScript Support** — Full type definitions included
- **Supabase-compatible API** — Familiar patterns for developers

## **Quick Start**

```
import { createClient } from '@devjuanes/matuclient';

const db = createClient({
  url: 'http://localhost:3001',
  projectId: 'my-project',
  apiKey: 'anon_xxxx',
});

// Query data
const { data, error } = await db.from('users').select('*').eq('active', true);
```

## **Configuration**

### **Automatic Configuration (Environment Variables)**

```
MATUDB_URL=http://localhost:3001
MATUDB_PROJECT_ID=my-project
MATUDB_API_KEY=anon_xxxx...
MATUDB_USE_SUPABASE=false
```

### **Manual Configuration**

```
import { createClient } from '@devjuanes/matuclient';

const db = createClient({
  url: 'http://localhost:3001',
  projectId: 'my-project',
  apiKey: 'anon_xxxx',
  useSupabase: false
});
```

## **API Reference**

### `db.from(table)` **— Query Builder**

```
// SELECT with filters
const { data, error } = await db
  .from('users')
  .select('id, name, email')
  .eq('active', true)
  .order('created_at', { ascending: false })
  .limit(10);

// Filter operators
.eq('col', value)       // =
.neq('col', value)      // !=
.gt('col', value)       // >
.gte('col', value)      // >=
.lt('col', value)       // <
.lte('col', value)      // <=
.like('col', '%patt%')  // LIKE
.ilike('col', '%patt%') // ILIKE (case-insensitive)
.in('col', [1, 2, 3])   // IN (...)
.is('col', null)        // IS NULL / IS TRUE / IS FALSE

// Single row
const { data: user } = await db.from('users').select('*').eq('id', userId).single();

// INSERT
const { data, error } = await db.from('products').insert({ name: 'Widget', price: 9.99 });

// INSERT multiple
const { data } = await db.from('products').insert([{ name: 'A' }, { name: 'B' }]);

// UPDATE
const { data } = await db.from('users').update({ name: 'Alice' }).eq('id', userId);

// DELETE
const { data } = await db.from('orders').delete().eq('id', orderId);
```

### `db.auth` **— Authentication**

```
// Sign up
const { data, error } = await db.auth.signUp({ email, password });

// Sign in
const { data, error } = await db.auth.signInWithPassword({ email, password });
// data = { user, session: { access_token, expires_at, user } }

// Sign out
await db.auth.signOut();

// Get current session
const { data: { session } } = await db.auth.getSession();

// Get current user
const { data: { user } } = await db.auth.getUser();

// Listen for auth changes
const { data: { subscription } } = db.auth.onAuthStateChange((event, session) => {
  console.log(event); // 'SIGNED_IN' | 'SIGNED_OUT'
});
// Cleanup:
subscription.unsubscribe();
```

### `db.storage` **— File Storage**

```
// Upload
const { data, error } = await db.storage.upload('avatar.png', file);

// Get public URL
const { data: { publicUrl } } = db.storage.getPublicUrl('avatar.png');

// List files
const { data: files } = await db.storage.list();

// Download
const { data: blob } = await db.storage.download('report.pdf');

// Delete
await db.storage.remove(['old-file.png', 'another.pdf']);
```

### `db.channel()` **— Realtime**

```
// Supabase-compatible style
const channel = db
  .channel('public:users')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, payload => {
    console.log('Change:', payload);
  })
  .subscribe();

// Short style
db.channel('orders')
  .on('INSERT', payload => console.log('New order:', payload.data))
  .on('DELETE', payload => console.log('Deleted:', payload.data))
  .subscribe();

// Cleanup
db.removeChannel(channel);
db.removeAllChannels();
```

### `db.rpc()` **— Raw SQL**

```
const { data, error } = await db.rpc('SELECT * FROM users WHERE created_at > NOW() - INTERVAL \'7 days\'');
```

## **Related Packages**

- **[matu-db-api](https://github.com/DevJuanes/matu-db-api)** — The MatuDB backend server

