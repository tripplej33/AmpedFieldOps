/**
 * Utility functions for managing the favicon
 */

/**
 * Updates the favicon in the document head
 * @param faviconUrl - URL to the favicon file
 */
export function updateFavicon(faviconUrl: string | null | undefined) {
  if (!faviconUrl) return;
  
  // Remove existing favicon links
  const existingLinks = document.querySelectorAll("link[rel*='icon']");
  existingLinks.forEach(link => link.remove());
  
  // Add new favicon link
  const link = document.createElement('link');
  link.rel = 'icon';
  link.type = faviconUrl.endsWith('.svg') ? 'image/svg+xml' : 
              faviconUrl.endsWith('.ico') ? 'image/x-icon' : 
              'image/png';
  link.href = faviconUrl;
  document.head.appendChild(link);
}

/**
 * Loads favicon from settings API
 */
export async function loadFaviconFromSettings(api: any) {
  try {
    const settings = await api.getSettings();
    if (settings.company_favicon) {
      updateFavicon(settings.company_favicon);
    }
  } catch (error) {
    // Silently fail - favicon is not critical
    console.debug('Failed to load favicon from settings:', error);
  }
}

