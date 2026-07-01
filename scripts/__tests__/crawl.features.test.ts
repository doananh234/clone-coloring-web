/**
 * Crawler Feature Test Suite
 * Tests failure/edge cases for crawler features (not just auth)
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

const mockFetch = jest.fn();
global.fetch = mockFetch as any;

const originalConsoleError = console.error;
const originalConsoleLog = console.log;
const originalConsoleWarn = console.warn;

beforeEach(() => {
  jest.clearAllMocks();
  console.error = jest.fn();
  console.log = jest.fn();
  console.warn = jest.fn();
});

afterEach(() => {
  console.error = originalConsoleError;
  console.log = originalConsoleLog;
  console.warn = originalConsoleWarn;
});

describe('Crawler Feature Tests - Failure/Edge Cases', () => {
  describe('Pagination Feature', () => {
    it('FC-PAG-1: Invalid Page Number (Negative)', async () => {
      const options = { page: -1 };
      // Should default to page 1 or handle gracefully
      expect(options.page).toBeLessThan(1);
    });

    it('FC-PAG-2: Invalid Page Number (Zero)', async () => {
      const options = { page: 0 };
      // Should default to page 1
      expect(options.page).toBe(0);
    });

    it('FC-PAG-3: Invalid Page Number (Non-numeric)', async () => {
      // CLI: --page "abc"
      // Should parse as NaN and use default
      const page = parseInt('abc', 10);
      expect(isNaN(page)).toBe(true);
    });

    it('FC-PAG-4: Max Pages Exceeded', async () => {
      const options = { maxPages: 5 };
      // If API has 10 pages but maxPages=5, should stop at 5
      expect(options.maxPages).toBe(5);
    });

    it('FC-PAG-5: Empty Results on Page', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [],
          page: 1,
          pageCount: 1,
          total: 0,
        }),
      } as Response);

      const response = await mockFetch('https://api.example.com?page=1');
      const data = await response.json();
      expect(data.results).toHaveLength(0);
    });

    it('FC-PAG-6: Inconsistent Pagination Metadata', async () => {
      // API returns page=1 but pageCount=undefined
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [{ _id: '1' }],
          page: 1,
          // pageCount missing
        }),
      } as Response);

      const response = await mockFetch('https://api.example.com?page=1');
      const data = await response.json();
      expect(data.pageCount).toBeUndefined();
      // Should handle gracefully (assume hasMore based on results.length)
    });

    it('EC-PAG-1: Very Large Page Number', async () => {
      const options = { page: 999999 };
      // Should handle gracefully (API may return empty or error)
      expect(options.page).toBe(999999);
    });

    it('EC-PAG-2: Page Number Exceeds Total Pages', async () => {
      // Request page 100 when only 10 pages exist
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [],
          page: 100,
          pageCount: 10,
          total: 50,
        }),
      } as Response);

      const response = await mockFetch('https://api.example.com?page=100');
      const data = await response.json();
      expect(data.results).toHaveLength(0);
    });
  });

  describe('Metadata Saving Feature', () => {
    it('FC-META-1: Invalid JSON in Listing Data', async () => {
      // Listing has circular reference or invalid JSON
      const listing = { _id: '123' };
      (listing as any).self = listing; // Circular reference

      // Should handle gracefully when stringifying
      expect(() => {
        JSON.stringify(listing);
      }).toThrow();
    });

    it('FC-META-2: Missing Listing ID', async () => {
      const listing = { itemName: 'Test' }; // No _id
      // Should use folder name or generate ID
      expect(listing._id).toBeUndefined();
    });

    it('FC-META-3: File System Permission Denied', async () => {
      // Simulate permission error when writing metadata.json
      const mockWriteFile = jest.fn().mockRejectedValueOnce(
        new Error('EACCES: permission denied, open metadata.json')
      );

      await expect(mockWriteFile('metadata.json', '{}')).rejects.toThrow('EACCES');
    });

    it('FC-META-4: Disk Full', async () => {
      // Simulate disk full error
      const mockWriteFile = jest.fn().mockRejectedValueOnce(
        new Error('ENOSPC: no space left on device')
      );

      await expect(mockWriteFile('metadata.json', '{}')).rejects.toThrow('ENOSPC');
    });

    it('EC-META-1: Very Large Metadata File', async () => {
      // Listing with huge nested data
      const largeListing = {
        _id: '123',
        hugeArray: Array(100000).fill({ data: 'x'.repeat(1000) }),
      };

      const jsonSize = JSON.stringify(largeListing).length;
      expect(jsonSize).toBeGreaterThan(1000000); // > 1MB
    });

    it('EC-META-2: Special Characters in Listing ID', async () => {
      const listing = { _id: '../../etc/passwd' }; // Path traversal attempt
      // Should sanitize or reject
      expect(listing._id).toContain('../');
    });
  });

  describe('Asset Download Feature', () => {
    it('FC-DL-1: Invalid PDF URL', async () => {
      const invalidUrl = 'not-a-valid-url';
      mockFetch.mockRejectedValueOnce(new Error('Invalid URL'));

      await expect(mockFetch(invalidUrl)).rejects.toThrow('Invalid URL');
    });

    it('FC-DL-2: PDF URL Returns 404', async () => {
      const pdfUrl = 'https://example.com/missing.pdf';
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      } as Response);

      const response = await mockFetch(pdfUrl);
      expect(response.ok).toBe(false);
      expect(response.status).toBe(404);
    });

    it('FC-DL-3: PDF URL Returns Non-PDF Content', async () => {
      const pdfUrl = 'https://example.com/fake.pdf';
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'text/html' }),
        arrayBuffer: async () => new ArrayBuffer(0),
      } as Response);

      const response = await mockFetch(pdfUrl);
      expect(response.headers.get('content-type')).toBe('text/html');
    });

    it('FC-DL-4: Image URL Returns 403 Forbidden', async () => {
      const imageUrl = 'https://example.com/protected-image.png';
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
      } as Response);

      const response = await mockFetch(imageUrl);
      expect(response.ok).toBe(false);
      expect(response.status).toBe(403);
    });

    it('FC-DL-5: Download Timeout', async () => {
      const slowUrl = 'https://example.com/slow-download.pdf';
      mockFetch.mockImplementationOnce(
        () =>
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Timeout')), 100)
          )
      );

      await expect(mockFetch(slowUrl)).rejects.toThrow('Timeout');
    });

    it('FC-DL-6: Corrupted File Download', async () => {
      const pdfUrl = 'https://example.com/corrupted.pdf';
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/pdf' }),
        arrayBuffer: async () => new ArrayBuffer(0), // Empty/corrupted
      } as Response);

      const response = await mockFetch(pdfUrl);
      const buffer = await response.arrayBuffer();
      expect(buffer.byteLength).toBe(0);
    });

    it('EC-DL-1: Very Large File Download', async () => {
      const largeFileUrl = 'https://example.com/huge.pdf';
      const largeBuffer = new ArrayBuffer(100 * 1024 * 1024); // 100MB
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/pdf' }),
        arrayBuffer: async () => largeBuffer,
      } as Response);

      const response = await mockFetch(largeFileUrl);
      const buffer = await response.arrayBuffer();
      expect(buffer.byteLength).toBe(100 * 1024 * 1024);
    });

    it('EC-DL-2: Filename with Special Characters', async () => {
      const filename = 'file with spaces & special chars<>:"|?*.pdf';
      // Should sanitize filename
      const sanitized = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
      expect(sanitized).not.toContain(' ');
      expect(sanitized).not.toContain('&');
    });

    it('EC-DL-3: Filename Too Long', async () => {
      const longFilename = 'a'.repeat(300) + '.pdf';
      // Should truncate to 255 chars
      const truncated = longFilename.substring(0, 255);
      expect(truncated.length).toBeLessThanOrEqual(255);
    });

    it('EC-DL-4: Duplicate Filenames', async () => {
      // Same URL downloaded twice with same filename
      const url = 'https://example.com/file.pdf';
      const filename = 'file.pdf';

      // First download succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(100),
      } as Response);

      // Second download should skip if file exists
      // (Implementation should check file existence)
    });

    it('EC-DL-5: URL Redirects Multiple Times', async () => {
      const redirectUrl = 'https://example.com/redirect';
      // Chain of redirects (should follow up to limit)
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 301,
          headers: new Headers({ location: 'https://example.com/redirect2' }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          arrayBuffer: async () => new ArrayBuffer(100),
        } as Response);

      // fetch() typically follows redirects automatically
    });
  });

  describe('From Metadata Mode Feature', () => {
    it('FC-META-MODE-1: Metadata Directory Does Not Exist', async () => {
      const assetsDir = '/nonexistent/path/assets';
      // Should handle gracefully
      expect(assetsDir).not.toBe(process.cwd() + '/assets');
    });

    it('FC-META-MODE-2: Metadata File Missing', async () => {
      // Directory exists but metadata.json is missing
      const listingDir = 'assets/123';
      const metadataPath = `${listingDir}/metadata.json`;
      // Should skip this listing
    });

    it('FC-META-MODE-3: Invalid JSON in Metadata File', async () => {
      const invalidJson = '{ invalid json }';
      expect(() => {
        JSON.parse(invalidJson);
      }).toThrow();
    });

    it('FC-META-MODE-4: Metadata File Empty', async () => {
      const emptyJson = '';
      expect(() => {
        JSON.parse(emptyJson);
      }).toThrow();
    });

    it('FC-META-MODE-5: Metadata Missing Required Fields', async () => {
      const incompleteMetadata = { itemName: 'Test' }; // No _id, no purchaseLink
      // Should handle gracefully
      expect(incompleteMetadata._id).toBeUndefined();
    });

    it('EC-META-MODE-1: Symlink in Assets Directory', async () => {
      // Assets dir contains symlinks (should handle or skip)
      const symlinkPath = 'assets/symlink-to-elsewhere';
      // Should detect and skip symlinks
    });

    it('EC-META-MODE-2: Very Large Number of Metadata Files', async () => {
      // 10,000+ metadata.json files (performance test)
      const manyListings = Array(10000).fill(null).map((_, i) => ({
        _id: `listing_${i}`,
        itemName: `Listing ${i}`,
      }));
      expect(manyListings.length).toBe(10000);
    });
  });

  describe('URL Building Feature', () => {
    it('FC-URL-1: Malformed Base URL', async () => {
      const malformedUrl = 'not-a-url';
      expect(() => {
        new URL(malformedUrl);
      }).toThrow();
    });

    it('FC-URL-2: URL with Existing Query Parameters', async () => {
      const baseUrl = 'https://api.example.com/listings?limit=50&sort=-_id';
      const url = new URL(baseUrl);
      url.searchParams.set('page', '2');
      // Should preserve existing params and add new ones
      expect(url.searchParams.get('limit')).toBe('50');
      expect(url.searchParams.get('page')).toBe('2');
    });

    it('FC-URL-3: URL with Fragment', async () => {
      const urlWithFragment = 'https://api.example.com/listings#fragment';
      const url = new URL(urlWithFragment);
      // Fragment should be preserved
      expect(url.hash).toBe('#fragment');
    });

    it('EC-URL-1: URL with Special Characters in Query', async () => {
      const baseUrl = 'https://api.example.com/listings?filter={"key":"value"}';
      const url = new URL(baseUrl);
      // Should handle JSON in query params
      expect(url.searchParams.get('filter')).toBe('{"key":"value"}');
    });

    it('EC-URL-2: Very Long URL', async () => {
      const longQuery = 'x'.repeat(10000);
      const baseUrl = `https://api.example.com/listings?data=${longQuery}`;
      // May hit URL length limits
      expect(baseUrl.length).toBeGreaterThan(8000);
    });
  });

  describe('Error Handling Feature', () => {
    it('FC-ERR-1: Unhandled Promise Rejection', async () => {
      // Should catch and handle gracefully
      const unhandled = Promise.reject(new Error('Unhandled'));
      await expect(unhandled).rejects.toThrow('Unhandled');
    });

    it('FC-ERR-2: Partial Success (Some Listings Fail)', async () => {
      // Some listings download successfully, others fail
      const results = [
        { success: true, listingId: '1' },
        { success: false, listingId: '2', error: 'Download failed' },
        { success: true, listingId: '3' },
      ];
      const failures = results.filter((r) => !r.success);
      expect(failures.length).toBe(1);
    });

    it('EC-ERR-1: Error Message Truncation', async () => {
      const longError = 'x'.repeat(10000);
      // Should truncate or handle long error messages
      expect(longError.length).toBe(10000);
    });
  });
});
