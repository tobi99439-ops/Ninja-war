import * as THREE from 'three';
import type { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// Valid 1x1 neutral slate (#6b7280) opaque RGBA PNG used as safe fallback for truncated/missing embedded GLB images
const FALLBACK_NEUTRAL_PNG_DATA_URI =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGPILmr4DwAFBgJd0OtwgAAAAABJRU5ErkJggg==';

const GLB_MAGIC = 0x46546c67; // 'glTF'
const CHUNK_TYPE_JSON = 0x4e4f534a; // 'JSON'
const CHUNK_TYPE_BIN = 0x004e4942; // 'BIN\0'

interface GlbBufferDef {
  byteLength?: number;
  uri?: string;
}

interface GlbBufferViewDef {
  buffer?: number;
  byteOffset?: number;
  byteLength?: number;
}

interface GlbImageDef {
  name?: string;
  uri?: string;
  mimeType?: string;
  bufferView?: number;
}

interface GlbTextureDef {
  source?: number;
}

interface GlbMaterialDef {
  name?: string;
  pbrMetallicRoughness?: {
    baseColorFactor?: number[];
    baseColorTexture?: { index?: number };
    metallicRoughnessTexture?: { index?: number };
  };
  normalTexture?: { index?: number };
  occlusionTexture?: { index?: number };
  emissiveTexture?: { index?: number };
}

interface GlbJsonRoot {
  buffers?: GlbBufferDef[];
  bufferViews?: GlbBufferViewDef[];
  images?: GlbImageDef[];
  textures?: GlbTextureDef[];
  materials?: GlbMaterialDef[];
}

interface InternalParserTextureLoader {
  isImageBitmapLoader?: boolean;
  load: (
    url: string,
    onLoad?: (result: unknown) => void,
    onProgress?: (event: ProgressEvent) => void,
    onError?: (err: unknown) => void
  ) => unknown;
  __resilientBlobFallbackWrapped?: boolean;
}

function hasBytesSignature(bytes: Uint8Array, sig: number[]): boolean {
  if (bytes.byteLength < sig.length) return false;
  for (let i = 0; i < sig.length; i++) {
    if (bytes[i] !== sig[i]) return false;
  }
  return true;
}

function containsAsciiSequence(bytes: Uint8Array, seq: number[]): boolean {
  if (bytes.byteLength < seq.length) return false;
  outer: for (let i = bytes.byteLength - seq.length; i >= 0; i--) {
    for (let j = 0; j < seq.length; j++) {
      if (bytes[i + j] !== seq[j]) continue outer;
    }
    return true;
  }
  return false;
}

function isEmbeddedImageCorruptOrTruncated(
  bytes: Uint8Array,
  declaredOffset: number,
  declaredLength: number,
  actualBinBytes: number,
  binDataOffset: number
): boolean {
  if (declaredLength <= 0 || declaredOffset < 0 || declaredOffset + declaredLength > actualBinBytes) {
    return true;
  }

  const start = binDataOffset + declaredOffset;
  const end = start + declaredLength;
  const slice = bytes.subarray(start, end);

  // PNG: 89 50 4E 47 — must contain an IEND chunk ('IEND' = 0x49, 0x45, 0x4E, 0x44)
  if (hasBytesSignature(slice, [0x89, 0x50, 0x4e, 0x47])) {
    if (!containsAsciiSequence(slice, [0x49, 0x45, 0x4e, 0x44])) {
      return true;
    }
  }

  return false;
}

/**
 * Inspects a binary GLB buffer before `GLTFLoader.parse` / `parseAsync`.
 * When a remote GLB file was truncated on the server (e.g. `2snmwp.glb`), embedded image
 * `bufferView`s beyond EOF cause `GLTFLoader` to create empty/partial `blob:` URLs that
 * trigger `THREE.GLTFLoader: Couldn't load texture blob:...` errors.
 *
 * Returns the original `ArrayBuffer` untouched when intact, or a cleanly repacked GLB with
 * broken image slots replaced by safe fallbacks and binary bounds clamped.
 */
export function sanitizeGlbBuffer(buffer: ArrayBuffer): ArrayBuffer {
  if (buffer.byteLength < 20) return buffer;

  const view = new DataView(buffer);
  const magic = view.getUint32(0, true);
  const version = view.getUint32(4, true);
  if (magic !== GLB_MAGIC || version !== 2) {
    return buffer;
  }

  const totalDeclaredLen = view.getUint32(8, true);
  const jsonChunkLen = view.getUint32(12, true);
  const jsonChunkType = view.getUint32(16, true);
  if (jsonChunkType !== CHUNK_TYPE_JSON || 20 + jsonChunkLen > buffer.byteLength) {
    return buffer;
  }

  const binHeaderOffset = 20 + jsonChunkLen;
  let hasBin = false;
  let binDataOffset = buffer.byteLength;
  let actualBinBytes = 0;

  if (binHeaderOffset + 8 <= buffer.byteLength) {
    const chunk1Type = view.getUint32(binHeaderOffset + 4, true);
    if (chunk1Type === CHUNK_TYPE_BIN) {
      hasBin = true;
      binDataOffset = binHeaderOffset + 8;
      actualBinBytes = Math.max(0, buffer.byteLength - binDataOffset);
    }
  }

  const bytes = new Uint8Array(buffer);
  let jsonText: string;
  try {
    jsonText = new TextDecoder('utf-8', { fatal: false }).decode(bytes.subarray(20, 20 + jsonChunkLen));
  } catch {
    return buffer;
  }

  let json: GlbJsonRoot;
  try {
    json = JSON.parse(jsonText) as GlbJsonRoot;
  } catch {
    return buffer;
  }

  const bufferViews = Array.isArray(json.bufferViews) ? json.bufferViews : [];
  const images = Array.isArray(json.images) ? json.images : [];
  const brokenImageIndices = new Set<number>();

  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    if (!img || img.bufferView === undefined) continue;
    const bv = bufferViews[img.bufferView];
    if (!bv) {
      brokenImageIndices.add(i);
      continue;
    }
    const offset = bv.byteOffset ?? 0;
    const length = bv.byteLength ?? 0;
    if (isEmbeddedImageCorruptOrTruncated(bytes, offset, length, actualBinBytes, binDataOffset)) {
      brokenImageIndices.add(i);
    }
  }

  const declaredBinTooLarge =
    hasBin &&
    Array.isArray(json.buffers) &&
    json.buffers[0] &&
    typeof json.buffers[0].byteLength === 'number' &&
    json.buffers[0].byteLength > actualBinBytes;

  if (brokenImageIndices.size === 0 && !declaredBinTooLarge && totalDeclaredLen <= buffer.byteLength) {
    return buffer;
  }

  // Replace broken image bufferViews with safe inline PNG data URIs
  for (const imgIdx of brokenImageIndices) {
    const img = images[imgIdx];
    if (!img) continue;
    delete img.bufferView;
    delete img.mimeType;
    img.uri = FALLBACK_NEUTRAL_PNG_DATA_URI;
    img.name = img.name ? `${img.name}__SANITIZED_MISSING` : '__SANITIZED_MISSING';
  }

  // Strip broken baseColorTexture references on materials so surfaces render cleanly with neutral slate albedo
  if (brokenImageIndices.size > 0 && Array.isArray(json.materials) && Array.isArray(json.textures)) {
    const brokenTextureIndices = new Set<number>();
    for (let t = 0; t < json.textures.length; t++) {
      const srcIdx = json.textures[t]?.source;
      if (srcIdx !== undefined && brokenImageIndices.has(srcIdx)) {
        brokenTextureIndices.add(t);
      }
    }

    for (const mat of json.materials) {
      const pbr = mat?.pbrMetallicRoughness;
      if (pbr?.baseColorTexture?.index !== undefined && brokenTextureIndices.has(pbr.baseColorTexture.index)) {
        delete pbr.baseColorTexture;
        if (!pbr.baseColorFactor) {
          pbr.baseColorFactor = [0.42, 0.45, 0.49, 1.0];
        }
      }
      if (mat?.normalTexture?.index !== undefined && brokenTextureIndices.has(mat.normalTexture.index)) {
        delete mat.normalTexture;
      }
      if (mat?.occlusionTexture?.index !== undefined && brokenTextureIndices.has(mat.occlusionTexture.index)) {
        delete mat.occlusionTexture;
      }
      if (mat?.emissiveTexture?.index !== undefined && brokenTextureIndices.has(mat.emissiveTexture.index)) {
        delete mat.emissiveTexture;
      }
      if (
        pbr?.metallicRoughnessTexture?.index !== undefined &&
        brokenTextureIndices.has(pbr.metallicRoughnessTexture.index)
      ) {
        delete pbr.metallicRoughnessTexture;
      }
    }
  }

  if (hasBin && Array.isArray(json.buffers) && json.buffers[0]) {
    json.buffers[0].byteLength = actualBinBytes;
  }

  const encodedJson = new TextEncoder().encode(JSON.stringify(json));
  const paddedJsonLen = (encodedJson.byteLength + 3) & ~3;
  const paddedBinLen = hasBin ? (actualBinBytes + 3) & ~3 : 0;
  const outTotalLen = 12 + 8 + paddedJsonLen + (hasBin ? 8 + paddedBinLen : 0);

  const outBuf = new ArrayBuffer(outTotalLen);
  const outView = new DataView(outBuf);
  const outBytes = new Uint8Array(outBuf);

  // Header
  outView.setUint32(0, GLB_MAGIC, true);
  outView.setUint32(4, 2, true);
  outView.setUint32(8, outTotalLen, true);

  // Chunk 0: JSON (0x20 space padded)
  outView.setUint32(12, paddedJsonLen, true);
  outView.setUint32(16, CHUNK_TYPE_JSON, true);
  outBytes.set(encodedJson, 20);
  for (let i = encodedJson.byteLength; i < paddedJsonLen; i++) {
    outBytes[20 + i] = 0x20;
  }

  // Chunk 1: BIN (0x00 padded)
  if (hasBin) {
    const outBinHeader = 20 + paddedJsonLen;
    outView.setUint32(outBinHeader, paddedBinLen, true);
    outView.setUint32(outBinHeader + 4, CHUNK_TYPE_BIN, true);
    if (actualBinBytes > 0) {
      outBytes.set(bytes.subarray(binDataOffset, binDataOffset + actualBinBytes), outBinHeader + 8);
    }
  }

  return outBuf;
}

function createFallbackNeutralCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas') as HTMLCanvasElement & {
    __isFallbackTexture?: boolean;
  };
  canvas.width = 1;
  canvas.height = 1;
  canvas.__isFallbackTexture = true;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#9ca3af';
    ctx.fillRect(0, 0, 1, 1);
  }
  return canvas;
}

/**
 * Registers a GLTFLoader plugin that wraps `parser.textureLoader.load` (typically
 * `THREE.ImageBitmapLoader` for embedded GLB `blob:` images) so that any decode error
 * falls back first to `HTMLImageElement` and then to a silent 1x1 neutral texture,
 * preventing `THREE.GLTFLoader: Couldn't load texture blob:...` console errors.
 */
export function registerResilientGltfTextureFallback(gltfLoader: GLTFLoader): void {
  gltfLoader.register((parser) => {
    const parserWithLoader = parser as unknown as {
      textureLoader?: InternalParserTextureLoader;
    };
    const texLoader = parserWithLoader.textureLoader;
    if (texLoader && !texLoader.__resilientBlobFallbackWrapped) {
      texLoader.__resilientBlobFallbackWrapped = true;
      const originalLoad = texLoader.load.bind(texLoader);
      const isBitmapLoader = texLoader.isImageBitmapLoader === true;

      texLoader.load = (url, onLoad, onProgress, _onError) => {
        const resolveFallback = () => {
          const canvas = createFallbackNeutralCanvas();
          if (isBitmapLoader) {
            if (typeof createImageBitmap === 'function') {
              createImageBitmap(canvas)
                .then((bmp) => onLoad?.(bmp))
                .catch(() => onLoad?.(canvas));
            } else {
              onLoad?.(canvas);
            }
          } else {
            const tex = new THREE.CanvasTexture(canvas);
            tex.needsUpdate = true;
            onLoad?.(tex);
          }
        };

        return originalLoad(url, onLoad, onProgress, () => {
          // Retry with HTMLImageElement (handles partial/quirky PNGs that createImageBitmap rejects)
          if (typeof Image === 'undefined') {
            resolveFallback();
            return;
          }
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => {
            if (isBitmapLoader) {
              if (typeof createImageBitmap === 'function') {
                createImageBitmap(img)
                  .then((bmp) => onLoad?.(bmp))
                  .catch(() => onLoad?.(img));
              } else {
                onLoad?.(img);
              }
            } else {
              const tex = new THREE.Texture(img);
              tex.needsUpdate = true;
              onLoad?.(tex);
            }
          };
          img.onerror = () => {
            resolveFallback();
          };
          img.src = url;
        });
      };
    }

    return { name: 'ResilientGltfBlobTexturePlugin' };
  });
}
