export interface AdLibraryManifest {
  total: number;
  categories: Record<string, number>;
  images: Array<{ filename: string; category: string; path: string; aspectRatio?: string }>;
}

export async function loadAdLibraryManifest(): Promise<AdLibraryManifest> {
  try {
    const response = await fetch('/ad-library/manifest.json');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (err) {
    console.error('Failed to load ad library manifest:', err);
    return { total: 0, categories: {}, images: [] };
  }
}

export async function loadAdImageBase64(path: string): Promise<string | null> {
  try {
    const response = await fetch(`/ad-library/${path}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  } catch (err) {
    console.error(`Failed to load image ${path}:`, err);
    return null;
  }
}

export function downloadImage(base64: string, filename: string) {
  const link = document.createElement('a');
  link.href = base64;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
