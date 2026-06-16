class TOTP {
  /**
   * Generate a TOTP code
   * @param {string} secret - Base32 encoded secret key
   * @param {number} period - Time step in seconds (default: 30)
   * @param {number} digits - Number of digits (default: 6)
   * @returns {Promise<string>} - The TOTP code
   */
  static async generate(secret, period = 30, digits = 6) {
    const time = Math.floor(Date.now() / 1000 / period);
    const timeBuffer = new ArrayBuffer(8);
    const timeView = new DataView(timeBuffer);
    timeView.setUint32(4, time, false);

    const keyBytes = this.base32Decode(secret);
    const key = await crypto.subtle.importKey(
      'raw',
      keyBytes,
      { name: 'HMAC', hash: 'SHA-1' },
      false,
      ['sign']
    );

    const hmac = await crypto.subtle.sign('HMAC', key, timeBuffer);
    const hmacArray = new Uint8Array(hmac);

    const offset = hmacArray[hmacArray.length - 1] & 0x0f;
    const code =
      ((hmacArray[offset] & 0x7f) << 24) |
      ((hmacArray[offset + 1] & 0xff) << 16) |
      ((hmacArray[offset + 2] & 0xff) << 8) |
      (hmacArray[offset + 3] & 0xff);

    const otp = (code % Math.pow(10, digits)).toString().padStart(digits, '0');
    return otp;
  }

  /**
   * Get remaining seconds in current period
   * @param {number} period - Time step in seconds
   * @returns {number} - Seconds remaining
   */
  static getRemaining(period = 30) {
    return period - (Math.floor(Date.now() / 1000) % period);
  }

  /**
   * Decode a Base32 string to Uint8Array
   * @param {string} str - Base32 encoded string
   * @returns {Uint8Array}
   */
  static base32Decode(str) {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    str = str.toUpperCase().replace(/[^A-Z2-7]/g, '');

    let bits = '';
    for (let i = 0; i < str.length; i++) {
      const val = alphabet.indexOf(str[i]);
      bits += val.toString(2).padStart(5, '0');
    }

    const bytes = new Uint8Array(Math.floor(bits.length / 8));
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = parseInt(bits.slice(i * 8, i * 8 + 8), 2);
    }

    return bytes;
  }

  /**
   * Validate a Base32 secret key
   * @param {string} secret - The secret key to validate
   * @returns {boolean}
   */
  static isValidSecret(secret) {
    if (!secret || secret.length < 8) return false;
    const cleaned = secret.toUpperCase().replace(/\s/g, '');
    return /^[A-Z2-7]+=*$/.test(cleaned);
  }

  /**
   * Parse an otpauth:// URI
   * @param {string} uri - The otpauth URI
   * @returns {object|null} - Parsed account details or null
   */
  static parseOtpauthUri(uri) {
    try {
      const url = new URL(uri);
      if (url.protocol !== 'otpauth:') return null;

      const type = url.hostname; // totp or hotp
      if (type !== 'totp') return null;

      const path = decodeURIComponent(url.pathname.slice(1));
      const params = url.searchParams;

      let issuer = params.get('issuer') || '';
      let label = path;

      if (path.includes(':')) {
        const parts = path.split(':');
        if (!issuer) issuer = parts[0];
        label = parts[1];
      }

      return {
        secret: params.get('secret') || '',
        issuer: issuer.trim(),
        label: label.trim(),
        period: parseInt(params.get('period') || '30'),
        digits: parseInt(params.get('digits') || '6'),
        algorithm: params.get('algorithm') || 'SHA1'
      };
    } catch {
      return null;
    }
  }
}
