import express from 'express';
import { join } from 'path';
import cookieParser from 'cookie-parser';
import { authRoutes } from './routes/auth';
import { adminRoutes } from './routes/admin';

const app = express();
const PORT = process.env.SERVER_PORT || 3001;

app.use(express.json());
app.use(cookieParser());

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);

app.get('/api/update/check', (_req, res) => {
  res.json({ version: '0.1.0', releaseNotes: 'Initial version', downloadUrl: '' });
});

app.use('/admin', express.static(join(__dirname, '..', 'admin-web')));

app.listen(PORT, () => {
  // Server started
});

export { app };
