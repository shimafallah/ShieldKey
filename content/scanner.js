(function () {
  'use strict';

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'scanQR') {
      scanPageForQR().then((result) => {
        sendResponse({ data: result });
      }).catch(() => {
        sendResponse({ data: null });
      });
      return true;
    }
  });

  /**
   * Scan all images on the page for QR codes
   * Tries multiple strategies to handle CORS restrictions
   * @returns {Promise<string|null>}
   */
  async function scanPageForQR() {
    const candidates = [];

    const images = document.querySelectorAll('img');
    for (const img of images) {
      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;
      // QR codes are typically square-ish and at least 50px
      if (w >= 50 && h >= 50 && Math.abs(w - h) < Math.max(w, h) * 0.3) {
        candidates.push({ type: 'img', el: img, src: img.src });
      }
    }

    const canvases = document.querySelectorAll('canvas');
    for (const canvas of canvases) {
      if (canvas.width >= 50 && canvas.height >= 50) {
        candidates.push({ type: 'canvas', el: canvas });
      }
    }
    const svgs = document.querySelectorAll('svg');
    for (const svg of svgs) {
      if (svg.clientWidth >= 80 && svg.clientHeight >= 80) {
        candidates.push({ type: 'svg', el: svg });
      }
    }
    const allDivs = document.querySelectorAll('div[style*="background-image"], div[class*="qr"], div[class*="QR"], img[alt*="qr"], img[alt*="QR"]');
    for (const div of allDivs) {
      if (div.tagName === 'IMG') {
        candidates.push({ type: 'img', el: div, src: div.src });
      }
    }
    for (const candidate of candidates) {
      let result = null;
      try {
        if (candidate.type === 'img') {
          result = await decodeImgElement(candidate.el, candidate.src);
        } else if (candidate.type === 'canvas') {
          result = decodeCanvas(candidate.el);
        } else if (candidate.type === 'svg') {
          result = await decodeSVG(candidate.el);
        }
      } catch (e) {
        // Continue to next candidate
      }

      if (result) return result;
    }

    return null;
  }

  async function decodeImgElement(img, src) {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const result = decodeImageData(imageData);
      if (result) return result;
    } catch (e) {
      // CORS error — try fetch strategy
    }

    //! Strategy 2
    if (src && (src.startsWith('http') || src.startsWith('data:'))) {
      try {
        const response = await fetch(src);
        const blob = await response.blob();
        const bitmap = await createImageBitmap(blob);
        
        const canvas = document.createElement('canvas');
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(bitmap, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const result = decodeImageData(imageData);
        if (result) return result;
      } catch (e) {
        // Fetch also failed
      }
    }

    return null;
  }

  function decodeCanvas(canvas) {
    try {
      const ctx = canvas.getContext('2d');
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      return decodeImageData(imageData);
    } catch {
      return null;
    }
  }

  async function decodeSVG(svg) {
    try {
      const svgData = new XMLSerializer().serializeToString(svg);
      const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);

      return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(img.width, 200);
          canvas.height = Math.max(img.height, 200);
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          
          try {
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            URL.revokeObjectURL(url);
            resolve(decodeImageData(imageData));
          } catch {
            URL.revokeObjectURL(url);
            resolve(null);
          }
        };
        img.onerror = () => {
          URL.revokeObjectURL(url);
          resolve(null);
        };
        img.src = url;
      });
    } catch {
      return null;
    }
  }

  function decodeImageData(imageData) {
    if (typeof jsQR === 'undefined') {
      return null;
    }

    let result = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: 'dontInvert'
    });
    if (result && result.data) return result.data;

    result = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: 'attemptBoth'
    });
    if (result && result.data) return result.data;

    return null;
  }
})();
