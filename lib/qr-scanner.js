class QRScanner {
  /**
   * Scan QR codes from the current page via content script
   * @returns {Promise<string|null>} - Decoded QR content or null
   */
  static async scanFromPage() {
    return new Promise((resolve) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!tabs[0]?.id) {
          resolve(null);
          return;
        }

        chrome.tabs.sendMessage(tabs[0].id, { action: 'scanQR' }, (response) => {
          if (chrome.runtime.lastError) {
            // Content script not injected on this page — try to inject it
            chrome.scripting?.executeScript?.({
              target: { tabId: tabs[0].id },
              files: ['lib/jsqr.min.js', 'content/scanner.js']
            }).then(() => {
              // Retry after injection
              setTimeout(() => {
                chrome.tabs.sendMessage(tabs[0].id, { action: 'scanQR' }, (retryResponse) => {
                  if (chrome.runtime.lastError) {
                    resolve(null);
                    return;
                  }
                  resolve(retryResponse?.data || null);
                });
              }, 300);
            }).catch(() => {
              resolve(null);
            });
            return;
          }
          resolve(response?.data || null);
        });
      });
    });
  }

  /**
   * Scan QR code from an uploaded image file
   * @param {File} file - Image file
   * @returns {Promise<string|null>} - Decoded QR content or null
   */
  static async scanFromFile(file) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth || img.width;
          canvas.height = img.naturalHeight || img.height;
          const ctx = canvas.getContext('2d');
          
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

          try {
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const result = QRScanner.decodeImageData(imageData);
            resolve(result);
          } catch (err) {
            console.error('QR decode error:', err);
            resolve(null);
          }
        };
        img.onerror = () => resolve(null);
        img.src = e.target.result;
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });
  }

  /**
   * Decode QR code from ImageData using jsQR
   * @param {ImageData} imageData
   * @returns {string|null}
   */
  static decodeImageData(imageData) {
    if (typeof jsQR === 'undefined') {
      console.error('jsQR library not loaded');
      return null;
    }

    // Try normal scan
    let result = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: 'dontInvert'
    });
    if (result && result.data) return result.data;

    // Try inverted (for dark QR on light bg or vice versa)
    result = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: 'attemptBoth'
    });
    if (result && result.data) return result.data;

    // Try with scaled-up image for small QR codes
    if (imageData.width < 200 || imageData.height < 200) {
      const scale = Math.ceil(200 / Math.min(imageData.width, imageData.height));
      const canvas = document.createElement('canvas');
      canvas.width = imageData.width * scale;
      canvas.height = imageData.height * scale;
      const ctx = canvas.getContext('2d');
      
      // Put original image data on a temp canvas
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = imageData.width;
      tempCanvas.height = imageData.height;
      tempCanvas.getContext('2d').putImageData(imageData, 0, 0);
      
      // Scale up with nearest-neighbor
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(tempCanvas, 0, 0, canvas.width, canvas.height);
      
      const scaledData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      result = jsQR(scaledData.data, scaledData.width, scaledData.height, {
        inversionAttempts: 'attemptBoth'
      });
      if (result && result.data) return result.data;
    }

    return null;
  }

  /**
   * Parse a scanned QR result for TOTP
   * @param {string} data - QR decoded string
   * @returns {object|null} - Parsed account or null
   */
  static parseResult(data) {
    if (!data) return null;
    if (data.toLowerCase().startsWith('otpauth://totp/')) {
      return TOTP.parseOtpauthUri(data);
    }
    return null;
  }
}
