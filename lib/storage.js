class StorageManager {
  static STORAGE_KEY = 'totp_accounts';
  static ORDER_KEY = 'totp_order';
  static THEME_KEY = 'totp_theme';

  /**
   * Get all accounts
   * @returns {Promise<Array>} - Array of account objects
   */
  static async getAccounts() {
    return new Promise((resolve) => {
      chrome.storage.local.get([this.STORAGE_KEY, this.ORDER_KEY], (result) => {
        const accounts = result[this.STORAGE_KEY] || [];
        const order = result[this.ORDER_KEY] || [];

        if (order.length > 0) {
          accounts.sort((a, b) => {
            const indexA = order.indexOf(a.id);
            const indexB = order.indexOf(b.id);
            return indexA - indexB;
          });
        }

        resolve(accounts);
      });
    });
  }

  /**
   * Save an account
   * @param {object} account - Account object with id, issuer, label, secret, category
   * @returns {Promise<void>}
   */
  static async saveAccount(account) {
    const accounts = await this.getAccounts();
    const existing = accounts.findIndex((a) => a.id === account.id);

    if (existing >= 0) {
      accounts[existing] = account;
    } else {
      account.id = this.generateId();
      account.createdAt = Date.now();
      accounts.push(account);
    }

    return new Promise((resolve) => {
      chrome.storage.local.set({ [this.STORAGE_KEY]: accounts }, resolve);
    });
  }

  /**
   * Delete an account
   * @param {string} id - Account ID
   * @returns {Promise<void>}
   */
  static async deleteAccount(id) {
    let accounts = await this.getAccounts();
    accounts = accounts.filter((a) => a.id !== id);
    return new Promise((resolve) => {
      chrome.storage.local.set({ [this.STORAGE_KEY]: accounts }, resolve);
    });
  }

  /**
   * Save the display order of accounts
   * @param {Array<string>} order - Array of account IDs in display order
   * @returns {Promise<void>}
   */
  static async saveOrder(order) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [this.ORDER_KEY]: order }, resolve);
    });
  }

  /**
   * Export all accounts as JSON
   * @returns {Promise<string>} - JSON string
   */
  static async exportVault() {
    const accounts = await this.getAccounts();
    const exportData = {
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      accounts: accounts
    };
    return JSON.stringify(exportData, null, 2);
  }

  /**
   * Import accounts from JSON
   * @param {string} jsonStr - JSON string to import
   * @returns {Promise<{imported: number, skipped: number}>}
   */
  static async importVault(jsonStr) {
    try {
      const data = JSON.parse(jsonStr);
      if (!data.accounts || !Array.isArray(data.accounts)) {
        throw new Error('Invalid vault format');
      }

      const existing = await this.getAccounts();
      const existingSecrets = new Set(existing.map((a) => a.secret));
      let imported = 0;
      let skipped = 0;

      for (const account of data.accounts) {
        if (!account.secret || !account.issuer) {
          skipped++;
          continue;
        }

        if (existingSecrets.has(account.secret)) {
          skipped++;
          continue;
        }

        account.id = this.generateId();
        account.createdAt = Date.now();
        existing.push(account);
        imported++;
      }

      await new Promise((resolve) => {
        chrome.storage.local.set({ [this.STORAGE_KEY]: existing }, resolve);
      });

      return { imported, skipped };
    } catch (error) {
      throw new Error('Failed to import: ' + error.message);
    }
  }

  /**
   * Get theme preference
   * @returns {Promise<string>} - 'light', 'dark', or 'system'
   */
  static async getTheme() {
    return new Promise((resolve) => {
      chrome.storage.local.get([this.THEME_KEY], (result) => {
        resolve(result[this.THEME_KEY] || 'system');
      });
    });
  }

  /**
   * Save theme preference
   * @param {string} theme - 'light', 'dark', or 'system'
   * @returns {Promise<void>}
   */
  static async setTheme(theme) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [this.THEME_KEY]: theme }, resolve);
    });
  }

  /**
   * Generate a unique ID
   * @returns {string}
   */
  static generateId() {
    return 'acc_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }
}
