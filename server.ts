import { execFile } from 'node:child_process';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { createServer as createViteServer } from 'vite';

const execFileAsync = promisify(execFile);

interface StoredCharacterMeta {
  id: string;
  nameAr: string;
  subtitleAr: string;
  kind: 'file' | 'url';
  fileName?: string;
  storedFileName?: string;
  mimeType?: string;
  fileSize?: number;
  url?: string;
  createdAt: number;
}

interface CharactersStoreFile {
  activeId: string | null;
  items: StoredCharacterMeta[];
}

const PORT = Number(process.env.PORT) || 3000;
const CHAR_DIR = path.resolve(process.cwd(), 'data', 'characters');
const META_FILE = path.join(CHAR_DIR, 'characters.json');

fs.mkdirSync(CHAR_DIR, { recursive: true });

function readStore(): CharactersStoreFile {
  try {
    if (!fs.existsSync(META_FILE)) {
      return { activeId: null, items: [] };
    }
    const raw = fs.readFileSync(META_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Partial<CharactersStoreFile>;
    return {
      activeId: typeof parsed.activeId === 'string' ? parsed.activeId : null,
      items: Array.isArray(parsed.items) ? parsed.items : [],
    };
  } catch {
    return { activeId: null, items: [] };
  }
}

function writeStore(store: CharactersStoreFile): void {
  fs.mkdirSync(CHAR_DIR, { recursive: true });
  fs.writeFileSync(META_FILE, JSON.stringify(store, null, 2), 'utf8');
}

function sanitizeId(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64) || `saved_${Date.now()}`;
}

function getExtensionLabel(name: string): string {
  const clean = name.split('?')[0].split('#')[0];
  const ext = clean.split('.').pop()?.toLowerCase();
  if (
    ext === 'fbx' ||
    ext === 'glb' ||
    ext === 'gltf' ||
    ext === 'vrm' ||
    ext === 'obj' ||
    ext === 'dae' ||
    ext === 'stl' ||
    ext === 'ply' ||
    ext === 'zip'
  ) {
    return `.${ext}`;
  }
  return '3D';
}

function deriveNameFromFileName(fileName: string): string {
  const base = fileName
    .replace(/\.(glb|gltf|vrm|fbx|obj|dae|stl|ply|zip)$/i, '')
    .replace(/[_-]+/g, ' ')
    .trim();
  return base || 'شخصية مخصصة';
}

function deriveNameFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const lastSeg = parsed.pathname.split('/').filter(Boolean).pop() || parsed.hostname;
    const clean = decodeURIComponent(lastSeg)
      .replace(/\.(glb|gltf|vrm|fbx|obj|dae|stl|ply|zip)$/i, '')
      .trim();
    return clean || 'شخصية من رابط';
  } catch {
    return 'شخصية من رابط';
  }
}

async function startServer() {
  const app = express();
  const APK_FILE_PATH = path.resolve(process.cwd(), 'data', 'apk', 'Naruto_Obito_3D.apk');

  const DIST_INDEX_PATH = path.resolve(process.cwd(), 'dist', 'index.html');

  function getDistBundleTag(): string | null {
    try {
      if (!fs.existsSync(DIST_INDEX_PATH)) return null;
      const html = fs.readFileSync(DIST_INDEX_PATH, 'utf8');
      const match = html.match(/assets\/(index-[A-Za-z0-9_-]+\.js)/);
      return match ? match[1] : null;
    } catch {
      return null;
    }
  }

  app.get('/api/apk-info', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    try {
      if (fs.existsSync(APK_FILE_PATH)) {
        const stat = fs.statSync(APK_FILE_PATH);
        if (stat.size > 10000) {
          const updatedAt = Math.floor(stat.mtimeMs);
          const distMtime = fs.existsSync(DIST_INDEX_PATH)
            ? Math.floor(fs.statSync(DIST_INDEX_PATH).mtimeMs)
            : 0;
          res.json({
            available: true,
            sizeBytes: stat.size,
            updatedAt,
            bundleTag: getDistBundleTag(),
            upToDate: distMtime === 0 || updatedAt >= distMtime - 2000,
            fileName: 'Naruto_Obito_3D.apk',
            downloadUrl: `/api/download-apk?v=${updatedAt}`,
          });
          return;
        }
      }
    } catch {
      // Ignore stat errors
    }
    res.json({
      available: false,
      sizeBytes: 0,
      updatedAt: 0,
      bundleTag: getDistBundleTag(),
      upToDate: false,
      fileName: 'Naruto_Obito_3D.apk',
      downloadUrl: '/api/download-apk',
    });
  });

  app.get('/api/download-apk', (_req, res) => {
    if (!fs.existsSync(APK_FILE_PATH)) {
      res.status(404).json({ error: 'APK_NOT_BUILT' });
      return;
    }
    const stat = fs.statSync(APK_FILE_PATH);
    res.setHeader('Content-Type', 'application/vnd.android.package-archive');
    res.setHeader('Content-Length', String(stat.size));
    res.setHeader('Content-Disposition', 'attachment; filename="Naruto_Obito_3D.apk"');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.sendFile(APK_FILE_PATH, { etag: false, lastModified: false, cacheControl: false });
  });

  const PUBLIC_DEIDARA_DIR = path.resolve(
    process.cwd(),
    'public',
    'assets',
    'characters',
    'deidara'
  );
  const DEIDARA_CONFIG_PATH = path.join(PUBLIC_DEIDARA_DIR, 'config.json');
  let activeApkBuildPromise: Promise<{ apkBuilt: boolean; apkSizeBytes: number }> | null = null;

  const rebuildWebAndApk = (): Promise<{ apkBuilt: boolean; apkSizeBytes: number }> => {
    if (activeApkBuildPromise) return activeApkBuildPromise;
    activeApkBuildPromise = (async () => {
      try {
        await execFileAsync('npm', ['run', 'build'], {
          cwd: process.cwd(),
          maxBuffer: 10 * 1024 * 1024,
        });
        await execFileAsync('node', ['scripts/build-apk.mjs'], {
          cwd: process.cwd(),
          maxBuffer: 10 * 1024 * 1024,
        });
        const stat = fs.existsSync(APK_FILE_PATH) ? fs.statSync(APK_FILE_PATH) : null;
        return { apkBuilt: Boolean(stat && stat.size > 10000), apkSizeBytes: stat?.size || 0 };
      } catch (err) {
        console.error('[publish-defaults] APK rebuild error:', err);
        const stat = fs.existsSync(APK_FILE_PATH) ? fs.statSync(APK_FILE_PATH) : null;
        return { apkBuilt: false, apkSizeBytes: stat?.size || 0 };
      } finally {
        activeApkBuildPromise = null;
      }
    })();
    return activeApkBuildPromise;
  };

  app.get('/api/deidara/defaults-status', (_req, res) => {
    try {
      if (!fs.existsSync(DEIDARA_CONFIG_PATH)) {
        res.json({ published: false, hasModel: false, slots: [], updatedAt: null });
        return;
      }
      const raw = JSON.parse(fs.readFileSync(DEIDARA_CONFIG_PATH, 'utf8')) as {
        hasCustomModel?: boolean;
        slots?: Record<string, unknown>;
        updatedAt?: number;
      };
      res.json({
        published: true,
        hasModel: Boolean(raw.hasCustomModel),
        slots: raw.slots ? Object.keys(raw.slots) : [],
        updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : null,
      });
    } catch {
      res.json({ published: false, hasModel: false, slots: [], updatedAt: null });
    }
  });

  app.post('/api/deidara/publish-defaults', express.json({ limit: '80mb' }), async (req, res) => {
    try {
      const body = (req.body || {}) as {
        glb?: { dataBase64?: string; fileName?: string };
        slots?: Partial<
          Record<'body' | 'mant' | 'eye' | 'tongue', { dataBase64?: string; fileName?: string }>
        >;
        flipY?: boolean;
        slotFlipY?: Record<string, boolean>;
        meshSlotOverrides?: Record<string, string>;
        updatedAt?: number;
        rebuildApk?: boolean;
      };

      fs.mkdirSync(PUBLIC_DEIDARA_DIR, { recursive: true });

      let prevConfig: {
        hasCustomModel?: boolean;
        modelUrl?: string;
        modelFileName?: string;
        slots?: Record<string, { url: string; fileName: string }>;
        flipY?: boolean;
        slotFlipY?: Record<string, boolean>;
        meshSlotOverrides?: Record<string, string>;
        updatedAt?: number;
      } = {};
      if (fs.existsSync(DEIDARA_CONFIG_PATH)) {
        try {
          prevConfig = JSON.parse(fs.readFileSync(DEIDARA_CONFIG_PATH, 'utf8'));
        } catch {
          prevConfig = {};
        }
      }

      let hasCustomModel = Boolean(
        prevConfig.hasCustomModel && fs.existsSync(path.join(PUBLIC_DEIDARA_DIR, 'deidara.glb'))
      );
      let modelFileName = prevConfig.modelFileName || 'deidara.glb';

      if (body.glb?.dataBase64) {
        const glbBuf = Buffer.from(body.glb.dataBase64, 'base64');
        if (glbBuf.length >= 12) {
          fs.writeFileSync(path.join(PUBLIC_DEIDARA_DIR, 'deidara.glb'), glbBuf);
          hasCustomModel = true;
          modelFileName = path.basename(body.glb.fileName || 'deidara.glb');
        }
      }

      const nextSlots: Record<string, { url: string; fileName: string }> = {
        ...(prevConfig.slots || {}),
      };
      for (const slotKey of ['body', 'mant', 'eye', 'tongue'] as const) {
        const incoming = body.slots?.[slotKey];
        if (incoming?.dataBase64) {
          const imgBuf = Buffer.from(incoming.dataBase64, 'base64');
          if (imgBuf.length >= 32) {
            const outFile = `${slotKey}.png`;
            fs.writeFileSync(path.join(PUBLIC_DEIDARA_DIR, outFile), imgBuf);
            nextSlots[slotKey] = {
              url: `/assets/characters/deidara/${outFile}`,
              fileName: path.basename(incoming.fileName || outFile),
            };
          }
        }
      }

      const nextConfig = {
        hasCustomModel,
        modelUrl: hasCustomModel ? '/assets/characters/deidara/deidara.glb' : undefined,
        modelFileName: hasCustomModel ? modelFileName : undefined,
        slots: nextSlots,
        flipY: typeof body.flipY === 'boolean' ? body.flipY : Boolean(prevConfig.flipY ?? false),
        slotFlipY: body.slotFlipY ?? prevConfig.slotFlipY,
        meshSlotOverrides: body.meshSlotOverrides ?? prevConfig.meshSlotOverrides,
        updatedAt: typeof body.updatedAt === 'number' ? body.updatedAt : Date.now(),
      };

      fs.writeFileSync(DEIDARA_CONFIG_PATH, JSON.stringify(nextConfig, null, 2), 'utf8');

      const buildResult =
        body.rebuildApk === false
          ? { apkBuilt: false, apkSizeBytes: 0 }
          : await rebuildWebAndApk();

      res.json({
        ok: true,
        config: nextConfig,
        ...buildResult,
      });
    } catch (err) {
      console.error('Error publishing Deidara defaults:', err);
      res.status(500).json({ error: 'FAILED_TO_PUBLISH_DEIDARA_DEFAULTS' });
    }
  });

  app.get('/api/characters', (_req, res) => {
    const store = readStore();
    // Filter out any file entries whose backing binary no longer exists on disk
    const validItems = store.items.filter((item) => {
      if (item.kind === 'url') return Boolean(item.url);
      if (!item.storedFileName) return false;
      return fs.existsSync(path.join(CHAR_DIR, item.storedFileName));
    });
    if (validItems.length !== store.items.length) {
      store.items = validItems;
      writeStore(store);
    }

    res.json({
      activeId: store.activeId,
      items: validItems.map((item) => ({
        ...item,
        fileUrl: item.kind === 'file' ? `/api/characters/${encodeURIComponent(item.id)}/file` : undefined,
      })),
    });
  });

  app.post(
    '/api/characters/file',
    express.raw({ type: '*/*', limit: '80mb' }),
    (req, res) => {
      try {
        if (!Buffer.isBuffer(req.body) || req.body.length < 12) {
          res.status(400).json({ error: 'INVALID_FILE_PAYLOAD' });
          return;
        }

        const rawNameHeader = req.header('x-file-name');
        let fileName = 'character.glb';
        if (rawNameHeader) {
          try {
            fileName = decodeURIComponent(rawNameHeader);
          } catch {
            fileName = rawNameHeader;
          }
        }
        fileName = path.basename(fileName) || 'character.glb';

        const requestedId = req.header('x-character-id');
        const id = sanitizeId(requestedId || `saved_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`);
        const mimeType = req.header('x-file-type') || 'application/octet-stream';
        const store = readStore();

        const duplicate = store.items.find(
          (item) =>
            item.kind === 'file' &&
            item.fileName === fileName &&
            item.fileSize === req.body.length &&
            item.storedFileName &&
            fs.existsSync(path.join(CHAR_DIR, item.storedFileName))
        );
        if (duplicate) {
          store.activeId = duplicate.id;
          writeStore(store);
          res.json({
            entry: {
              ...duplicate,
              fileUrl: `/api/characters/${encodeURIComponent(duplicate.id)}/file`,
            },
          });
          return;
        }

        const extMatch = fileName.match(/\.(glb|gltf|vrm|fbx|obj|dae|stl|ply|zip)$/i);
        const safeExt = extMatch ? `.${extMatch[1].toLowerCase()}` : '.bin';
        const storedFileName = `${id}${safeExt}`;
        fs.writeFileSync(path.join(CHAR_DIR, storedFileName), req.body);

        const extLabel = getExtensionLabel(fileName);
        const entry: StoredCharacterMeta = {
          id,
          nameAr: deriveNameFromFileName(fileName),
          subtitleAr: `ملف محفوظ (${extLabel})`,
          kind: 'file',
          fileName,
          storedFileName,
          mimeType,
          fileSize: req.body.length,
          createdAt: Date.now(),
        };

        store.items = [entry, ...store.items.filter((item) => item.id !== id)];
        store.activeId = entry.id;
        writeStore(store);

        res.json({
          entry: {
            ...entry,
            fileUrl: `/api/characters/${encodeURIComponent(entry.id)}/file`,
          },
        });
      } catch (err) {
        console.error('Error saving character file:', err);
        res.status(500).json({ error: 'FAILED_TO_SAVE_FILE' });
      }
    }
  );

  app.post('/api/characters/url', express.json({ limit: '1mb' }), (req, res) => {
    const body = (req.body || {}) as { id?: string; url?: string };
    const url = typeof body.url === 'string' ? body.url.trim() : '';
    if (!url) {
      res.status(400).json({ error: 'MISSING_URL' });
      return;
    }

    const store = readStore();
    const duplicate = store.items.find((item) => item.kind === 'url' && item.url === url);
    if (duplicate) {
      store.activeId = duplicate.id;
      writeStore(store);
      res.json({ entry: duplicate });
      return;
    }

    const id = sanitizeId(body.id || `saved_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`);
    const extLabel = getExtensionLabel(url);
    const entry: StoredCharacterMeta = {
      id,
      nameAr: deriveNameFromUrl(url),
      subtitleAr: `رابط محفوظ (${extLabel})`,
      kind: 'url',
      url,
      createdAt: Date.now(),
    };

    store.items = [entry, ...store.items.filter((item) => item.id !== id)];
    store.activeId = entry.id;
    writeStore(store);
    res.json({ entry });
  });

  app.post('/api/characters/active', express.json({ limit: '1mb' }), (req, res) => {
    const body = (req.body || {}) as { activeId?: string };
    const activeId = typeof body.activeId === 'string' ? body.activeId : null;
    if (!activeId) {
      res.status(400).json({ error: 'MISSING_ACTIVE_ID' });
      return;
    }
    const store = readStore();
    store.activeId = activeId;
    writeStore(store);
    res.json({ ok: true, activeId });
  });

  app.get('/api/characters/:id/file', (req, res) => {
    const id = req.params.id;
    const store = readStore();
    const item = store.items.find((entry) => entry.id === id && entry.kind === 'file');
    if (!item || !item.storedFileName) {
      res.status(404).end();
      return;
    }
    const filePath = path.join(CHAR_DIR, item.storedFileName);
    if (!fs.existsSync(filePath)) {
      res.status(404).end();
      return;
    }
    res.setHeader('Content-Type', item.mimeType || 'application/octet-stream');
    res.setHeader('Cache-Control', 'public, max-age=31536000');
    res.sendFile(filePath);
  });

  app.delete('/api/characters/:id', (req, res) => {
    const id = req.params.id;
    const store = readStore();
    const target = store.items.find((entry) => entry.id === id);
    if (target?.storedFileName) {
      const filePath = path.join(CHAR_DIR, target.storedFileName);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
    store.items = store.items.filter((entry) => entry.id !== id);
    if (store.activeId === id) {
      store.activeId = 'mask_man';
    }
    writeStore(store);
    res.json({ ok: true, activeId: store.activeId });
  });

  if (process.env.NODE_ENV !== 'production') {
    process.env.DISABLE_HMR = 'true';
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false, ws: false },
      appType: 'spa',
    });
    app.get('/@vite/client', async (_req, res, next) => {
      try {
        const result = await vite.transformRequest('/@vite/client');
        if (result?.code) {
          const patched = result.code.replace(
            'transport.connect(createHMRHandler(handleMessage));',
            '/* HMR disabled */'
          );
          res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
          res.setHeader('Cache-Control', 'no-cache');
          res.send(patched);
          return;
        }
      } catch {
        // Fall through to default Vite middleware
      }
      next();
    });
    app.get('/@vite-plugin-pwa/pwa-entry-point-loaded', (_req, res) => {
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache');
      res.send('export default function registerDevSW() {}\n');
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.use((_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

void startServer();
